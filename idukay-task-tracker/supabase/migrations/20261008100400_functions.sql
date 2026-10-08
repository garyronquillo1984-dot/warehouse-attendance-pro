-- Functions the app calls (RPC). Each one works only on the caller's own data
-- (auth.uid()); none takes a user id from the browser.

-- Everything the app shell needs in one round trip.
create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id',            u.id,
    'email',              u.email,
    'full_name',          p.full_name,
    'phone',              p.phone,
    'country',            p.country,
    'locale',             p.locale,
    'timezone',           p.timezone,
    'onboarded',          p.onboarded_at is not null,
    'access',             app.access_state(u.id),
    'trial_started_at',   t.started_at,
    'trial_ends_at',      t.ends_at,
    'status',             s.status,
    'current_period_end', s.current_period_end,
    'cancelled_at',       s.cancelled_at,
    'grace_days',         app.grace_days(),
    'is_admin',           app.is_admin())
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.trial_periods t on t.user_id = u.id
  left join public.subscriptions s on s.user_id = u.id
  where u.id = (select auth.uid());
$$;

create function public.complete_onboarding() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = (select auth.uid());
  insert into public.analytics_events (user_id, event) values ((select auth.uid()), 'onboarding_completed')
    on conflict do nothing;
$$;

-- The few product events only the browser can know about. Properties are dropped:
-- only the event name and day are stored.
create function public.track_event(p_event text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_event not in ('app_opened', 'paste_parsed') or (select auth.uid()) is null then
    return;
  end if;
  insert into public.analytics_events (user_id, event) values ((select auth.uid()), p_event) on conflict do nothing;
end $$;

create function public.mark_all_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Privacy: export, wipe, delete
-- ---------------------------------------------------------------------------
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at',   now(),
    'account',       public.my_account(),
    'settings',      (select to_jsonb(x) - 'user_id' from public.user_settings x where x.user_id = (select auth.uid())),
    'schools',       coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.schools x where x.user_id = (select auth.uid())), '[]'),
    'children',      coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.children x where x.user_id = (select auth.uid())), '[]'),
    'subjects',      coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.subjects x where x.user_id = (select auth.uid())), '[]'),
    'tasks',         coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' order by x.due_date) from public.tasks x where x.user_id = (select auth.uid())), '[]'),
    'status_history',coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.task_status_history x where x.user_id = (select auth.uid())), '[]'),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.notifications x where x.user_id = (select auth.uid())), '[]'));
$$;

-- Keeps the account and subscription; removes children, tasks, history, subjects, schools.
create function public.wipe_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.children      where user_id = uid;   -- cascades to tasks and history
  delete from public.subjects      where user_id = uid;
  delete from public.schools       where user_id = uid;
  delete from public.notifications where user_id = uid;
  insert into public.audit_logs (user_id, action) values (uid, 'data_wiped');
end $$;

-- Deletes the login and, by cascade, every row that belongs to it. Billing events are kept
-- for accounting without the user link; analytics rows lose their user link.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.audit_logs (user_id, action) values (uid, 'account_deleted');
  delete from auth.users where id = uid;
end $$;

-- ---------------------------------------------------------------------------
-- Sample family (lets a new parent explore with realistic data; clearly labelled)
-- ---------------------------------------------------------------------------
create function public.load_sample_data() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := (select auth.uid());
  es   boolean;
  a    uuid;
  b    uuid;
  d    date;   -- today in the parent's time zone
  mon  date;   -- Monday of this week
begin
  if uid is null or app.access_state(uid) = 'locked' then
    raise exception 'access required' using errcode = '42501';
  end if;
  if exists (select 1 from public.children where user_id = uid and is_sample) then
    return;
  end if;
  select locale = 'es', (now() at time zone timezone)::date into es, d from public.profiles where id = uid;
  mon := d - (extract(isodow from d)::integer - 1);

  insert into public.children (user_id, name, grade, color, is_sample, sort_order)
    values (uid, case when es then 'Ana (ejemplo)' else 'Ana (sample)' end, case when es then '5.º de básica' else '5th grade' end, '#a2542f', true, 90)
    returning id into a;
  insert into public.children (user_id, name, grade, color, is_sample, sort_order)
    values (uid, case when es then 'Leo (ejemplo)' else 'Leo (sample)' end, case when es then '3.º de básica' else '3rd grade' end, '#2f6690', true, 91)
    returning id into b;

  insert into public.tasks (user_id, child_id, subject, title, description, due_date, priority, status, estimated_minutes, source)
  select uid, x.child, x.subject, x.title, x.descr, x.due, x.prio::public.task_priority, x.st::public.task_status, x.mins, 'sample'
  from (values
    (a, case when es then 'Matemática' else 'Math' end,       case when es then 'Resolver ejercicios 1–10, pág. 45' else 'Exercises 1–10, page 45' end, null, d, 'high', 'pending', 30),
    (a, case when es then 'Lengua' else 'Language' end,       case when es then 'Leer el capítulo 3' else 'Read chapter 3' end, null, d, 'normal', 'completed', 20),
    (a, case when es then 'Ciencias' else 'Science' end,      case when es then 'Actividad sobre ecosistemas' else 'Ecosystems activity' end,
        case when es then 'Completar la ficha y pegar dos imágenes.' else 'Complete the worksheet and paste two pictures.' end, d + 1, 'normal', 'pending', 40),
    (a, case when es then 'Estudios Sociales' else 'Social Studies' end, case when es then 'Mapa de las provincias' else 'Map of the provinces' end, null, mon + 4, 'normal', 'pending', 45),
    (a, 'English', 'Spelling list 201–211', null, d - 1, 'high', 'pending', 15),
    (b, case when es then 'Matemática' else 'Math' end,       case when es then 'Tablas del 1 al 5' else 'Times tables 1–5' end, null, d, 'normal', 'in_progress', 20),
    (b, case when es then 'Arte' else 'Art' end,              case when es then 'Dibujo de un rasgo de personalidad' else 'Drawing: a personality trait' end, null, d + 1, 'low', 'pending', 30),
    (b, 'Science', 'Amphibians: notes and pictures', null, mon + 3, 'normal', 'pending', 30),
    (b, case when es then 'Lengua' else 'Language' end,       case when es then 'Leyendas tradicionales' else 'Traditional legends' end, null, d - 2, 'normal', 'completed', 25)
  ) as x(child, subject, title, descr, due, prio, st, mins);
end $$;

create function public.remove_sample_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.children where user_id = (select auth.uid()) and is_sample;
  delete from public.subjects s where s.user_id = (select auth.uid())
    and not exists (select 1 from public.tasks t where t.subject_id = s.id);
$$;

-- ---------------------------------------------------------------------------
-- Reminders (in-app now; channel column ready for e-mail/push workers)
-- ---------------------------------------------------------------------------
-- Runs every 15 minutes. For each parent with access, in their own time zone:
--   morning  (after morning_time, before noon): "You have N school tasks today."
--   evening  (after evening_time): "You still have N pending tasks."
--   tomorrow (after tomorrow_time): "Tomorrow <child> has N tasks."
-- Each kind is sent at most once per local day (unique index).
create function app.generate_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_total integer := 0; v_k integer;
begin
  with local as (
    select p.id as user_id, p.locale, st.morning_enabled, st.morning_time, st.evening_enabled, st.evening_time, st.tomorrow_enabled, st.tomorrow_time,
           (p_now at time zone p.timezone)::date as today,
           (p_now at time zone p.timezone)::time as now_t
    from public.profiles p join public.user_settings st on st.user_id = p.id
    where app.access_state(p.id) <> 'locked'
  ), counts as (
    select l.user_id, l.locale, l.today, count(t.id) as due_today
    from local l join public.tasks t on t.user_id = l.user_id and t.due_date = l.today and t.status <> 'completed'
    where l.morning_enabled and l.now_t >= l.morning_time and l.now_t < time '12:00'
    group by 1, 2, 3
  )
  insert into public.notifications (user_id, kind, title, body, local_date)
  select user_id, 'morning',
         case when locale = 'es' then 'Buenos días ☀️' else 'Good morning ☀️' end,
         case when locale = 'es' then format('Hoy hay %s tarea%s escolar%s.', due_today, case when due_today = 1 then '' else 's' end, case when due_today = 1 then '' else 'es' end)
              else format('You have %s school task%s today.', due_today, case when due_today = 1 then '' else 's' end) end,
         today
  from counts where due_today > 0
  on conflict do nothing;
  get diagnostics v_k = row_count; v_total := v_total + v_k;

  with local as (
    select p.id as user_id, p.locale, st.morning_enabled, st.morning_time, st.evening_enabled, st.evening_time, st.tomorrow_enabled, st.tomorrow_time,
           (p_now at time zone p.timezone)::date as today,
           (p_now at time zone p.timezone)::time as now_t
    from public.profiles p join public.user_settings st on st.user_id = p.id
    where app.access_state(p.id) <> 'locked'
  ), counts as (
    select l.user_id, l.locale, l.today, count(t.id) as pending
    from local l join public.tasks t on t.user_id = l.user_id and t.due_date <= l.today and t.status <> 'completed'
    where l.evening_enabled and l.now_t >= l.evening_time
    group by 1, 2, 3
  )
  insert into public.notifications (user_id, kind, title, body, local_date)
  select user_id, 'evening',
         case when locale = 'es' then 'Repaso de la tarde' else 'Evening check' end,
         case when locale = 'es' then format('Todavía hay %s tarea%s pendiente%s.', pending, case when pending = 1 then '' else 's' end, case when pending = 1 then '' else 's' end)
              else format('You still have %s pending task%s.', pending, case when pending = 1 then '' else 's' end) end,
         today
  from counts where pending > 0
  on conflict do nothing;
  get diagnostics v_k = row_count; v_total := v_total + v_k;

  with local as (
    select p.id as user_id, p.locale, st.morning_enabled, st.morning_time, st.evening_enabled, st.evening_time, st.tomorrow_enabled, st.tomorrow_time,
           (p_now at time zone p.timezone)::date as today,
           (p_now at time zone p.timezone)::time as now_t
    from public.profiles p join public.user_settings st on st.user_id = p.id
    where app.access_state(p.id) <> 'locked'
  ), per_child as (
    select l.user_id, l.locale, l.today, c.name, count(t.id) as n
    from local l
    join public.tasks t on t.user_id = l.user_id and t.due_date = l.today + 1 and t.status <> 'completed'
    join public.children c on c.id = t.child_id
    where l.tomorrow_enabled and l.now_t >= l.tomorrow_time
    group by 1, 2, 3, 4
  ), joined as (
    select user_id, locale, today,
           string_agg(case when locale = 'es' then format('%s tiene %s tarea%s', name, n, case when n = 1 then '' else 's' end)
                                     else format('%s has %s task%s', name, n, case when n = 1 then '' else 's' end) end, ' · ' order by name) as body
    from per_child group by 1, 2, 3
  )
  insert into public.notifications (user_id, kind, title, body, local_date)
  select user_id, 'tomorrow',
         case when locale = 'es' then 'Para mañana' else 'For tomorrow' end,
         case when locale = 'es' then 'Mañana: ' || body || '.' else 'Tomorrow: ' || body || '.' end,
         today
  from joined
  on conflict do nothing;
  get diagnostics v_k = row_count; v_total := v_total + v_k;
  return v_total;
end $$;

-- ---------------------------------------------------------------------------
-- Admin dashboard: aggregates only, never task text or children's names
-- ---------------------------------------------------------------------------
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  price numeric := coalesce((select (value #>> '{}')::numeric from public.app_config where key = 'monthly_price_usd'), 2.99);
  r jsonb;
begin
  if not app.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  with acc as (
    select u.id, app.access_state(u.id) as access, s.status, t.ends_at
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.subscriptions s on s.user_id = u.id
    left join public.trial_periods t on t.user_id = u.id
  ), ever_paid as (
    select distinct user_id from public.analytics_events where event = 'subscription_activated' and user_id is not null
  )
  select jsonb_build_object(
    'generated_at',          now(),
    'total_users',           (select count(*) from acc),
    'new_users_7d',          (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'active_trials',         (select count(*) from acc where access = 'trial'),
    'trials_expiring_3d',    (select count(*) from acc where access = 'trial' and ends_at < now() + interval '3 days'),
    'active_subscribers',    (select count(*) from acc where access in ('active', 'grace') and status <> 'TRIAL'),
    'cancelled_subscribers', (select count(*) from acc where status = 'CANCELLED'),
    'payment_failed',        (select count(*) from acc where status = 'PAYMENT_FAILED'),
    'payment_pending',       (select count(*) from acc where status = 'PAYMENT_PENDING'),
    'expired',               (select count(*) from acc where access = 'locked'),
    'conversion_rate',       (select case when count(*) = 0 then null
                                     else round(100.0 * count(*) filter (where e.user_id is not null) / count(*), 1) end
                              from acc left join ever_paid e on e.user_id = acc.id
                              where acc.ends_at <= now()),
    'monthly_price_usd',     price,
    'mrr_estimate_usd',      round(price * (select count(*) from acc where access in ('active', 'grace') and status in ('ACTIVE', 'PAYMENT_FAILED')), 2),
    'revenue_30d',           (select coalesce(jsonb_object_agg(coalesce(currency, '?'), total), '{}'::jsonb) from (
                                select currency, sum(amount) as total from public.billing_events
                                where event_type in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE') and received_at > now() - interval '30 days'
                                  and outcome not in ('duplicate', 'stale')
                                group by currency) x),
    'failed_payments_30d',   (select count(*) from public.billing_events where event_type = 'PURCHASE_DELAYED' and received_at > now() - interval '30 days'),
    'unmatched_payments',    (select count(*) from public.billing_events where outcome = 'unmatched'),
    'children',              (select count(*) from public.children where not is_sample),
    'tasks',                 (select count(*) from public.tasks where source <> 'sample'),
    'tasks_completed',       (select count(*) from public.tasks where source <> 'sample' and status = 'completed'),
    'dau',                   (select count(distinct user_id) from public.analytics_events where event = 'app_opened' and day = current_date),
    'wau',                   (select count(distinct user_id) from public.analytics_events where event = 'app_opened' and day > current_date - 7),
    'funnel',                (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb) from (
                                select event, count(distinct user_id) as n from public.analytics_events
                                where event in ('registration', 'trial_started', 'first_child_added', 'first_task_added',
                                                'first_task_completed', 'onboarding_completed', 'trial_expired',
                                                'checkout_clicked', 'subscription_activated', 'subscription_cancelled')
                                group by event) f),
    'signups_by_day',        (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]'::jsonb) from (
                                select g::date as day, (select count(*) from public.profiles where created_at::date = g::date) as n
                                from generate_series(current_date - 13, current_date, interval '1 day') g) s)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.my_account(), public.complete_onboarding(), public.track_event(text),
  public.mark_all_notifications_read(), public.export_my_data(), public.wipe_my_data(),
  public.delete_my_account(), public.load_sample_data(), public.remove_sample_data(),
  public.admin_overview() from public, anon;
grant execute on function public.my_account(), public.complete_onboarding(), public.track_event(text),
  public.mark_all_notifications_read(), public.export_my_data(), public.wipe_my_data(),
  public.delete_my_account(), public.load_sample_data(), public.remove_sample_data(),
  public.admin_overview() to authenticated;
revoke all on function app.generate_reminders(timestamptz) from public, authenticated;
