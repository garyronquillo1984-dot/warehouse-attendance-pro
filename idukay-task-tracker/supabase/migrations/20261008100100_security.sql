-- Idukay Task Tracker — access control.
-- Least privilege: revoke Supabase's default grants, grant back exactly what each table
-- needs (column by column for writes), and let Row Level Security pick the rows.

-- ---------------------------------------------------------------------------
-- 1. Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

revoke all on schema app, billing from public;
grant usage on schema app to authenticated;           -- RLS policies call app.* functions
grant usage on schema public to authenticated;

grant select                                                     on public.profiles to authenticated;
grant update (full_name, phone, country, locale, timezone)        on public.profiles to authenticated;

grant select                                                     on public.user_settings to authenticated;
grant update (morning_enabled, morning_time, evening_enabled, evening_time,
              tomorrow_enabled, tomorrow_time, email_reminders, push_reminders)
                                                                 on public.user_settings to authenticated;

grant select, delete                                             on public.schools to authenticated;
grant insert (name), update (name)                               on public.schools to authenticated;

grant select, delete                                             on public.children to authenticated;
grant insert (name, grade, school_id, classroom, teacher, color, is_active, sort_order),
      update (name, grade, school_id, classroom, teacher, color, is_active, sort_order)
                                                                 on public.children to authenticated;

grant select, delete                                             on public.subjects to authenticated;
grant update (name, color)                                       on public.subjects to authenticated;

grant select, delete                                             on public.tasks to authenticated;
grant insert (child_id, subject, title, description, assigned_date, due_date, due_time, priority,
              status, estimated_minutes, teacher, notes, source, external_id),
      update (child_id, subject, title, description, assigned_date, due_date, due_time, priority,
              status, estimated_minutes, teacher, notes)
                                                                 on public.tasks to authenticated;

grant select                                                     on public.task_status_history to authenticated;
grant select                                                     on public.trial_periods to authenticated;
grant select                                                     on public.subscriptions to authenticated;
grant select, update (read_at)                                   on public.notifications to authenticated;
-- checkout_sessions, billing_events, used_trials, audit_logs, analytics_events,
-- platform_admins, app_config: no client access at all.

-- ---------------------------------------------------------------------------
-- 2. Access state (trial / paid / locked) — the single source of truth
-- ---------------------------------------------------------------------------
create function app.grace_days() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.app_config where key = 'payment_grace_days'), 3);
$$;

-- 'active'  paid period running (also a cancelled subscription until its period ends)
-- 'grace'   renewal failed or is late; a few days to fix the payment
-- 'trial'   inside the 7-day free trial
-- 'locked'  none of the above: data is kept and readable, writes are refused
create function app.access_state(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_PENDING')
         and s.current_period_end > now()                                                   then 'active'
    when s.status in ('ACTIVE', 'PAYMENT_FAILED')
         and s.current_period_end + make_interval(days => app.grace_days()) > now()         then 'grace'
    when t.ends_at > now()                                                                  then 'trial'
    else 'locked'
  end
  from (select uid as id) u
  left join public.subscriptions s on s.user_id = u.id
  left join public.trial_periods t on t.user_id = u.id;
$$;

create function app.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and app.access_state((select auth.uid())) <> 'locked';
$$;

create function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

revoke all on all functions in schema app from public;
grant execute on function app.access_state(uuid), app.has_access(), app.is_admin(), app.grace_days() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.user_settings       enable row level security;
alter table public.schools             enable row level security;
alter table public.children            enable row level security;
alter table public.subjects            enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.trial_periods       enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.checkout_sessions   enable row level security;
alter table public.billing_events      enable row level security;
alter table public.used_trials         enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.analytics_events    enable row level security;
alter table public.platform_admins     enable row level security;
alter table public.app_config          enable row level security;
-- Tables with RLS on and no policy are closed to every API role.

create policy own_profile_read   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy own_settings_read   on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy own_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Family data: always readable and deletable by its owner (so nothing is ever lost and the
-- parent can export or erase it); creating or changing it needs trial or paid access.
do $$
declare t text;
begin
  foreach t in array array['schools', 'children', 'subjects', 'tasks'] loop
    execute format('create policy own_read on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy own_update on public.%I for update to authenticated
                      using (user_id = (select auth.uid()))
                      with check (user_id = (select auth.uid()) and (select app.has_access()))', t);
  end loop;
end $$;

create policy own_insert on public.schools  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.has_access()));
create policy own_insert on public.children for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.has_access()));
-- Parents create tasks by hand, by paste or by file import; "integration" and "sample"
-- rows only come from server functions.
create policy own_insert on public.tasks    for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.has_access()) and source in ('manual', 'paste', 'import'));

create policy own_read on public.task_status_history for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.trial_periods       for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.subscriptions       for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.notifications       for select to authenticated using (user_id = (select auth.uid()));
create policy own_update on public.notifications     for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Triggers on family data
-- ---------------------------------------------------------------------------
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger children_touch before update on public.children
  for each row execute function app.touch_updated_at();

-- Tasks: resolve the subject text to the family's subject list, keep completed_at honest.
create function app.tasks_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  new.subject := btrim(new.subject);
  new.title   := btrim(new.title);
  if tg_op = 'INSERT' or new.subject is distinct from old.subject or new.subject_id is null then
    insert into public.subjects (user_id, name) values (new.user_id, new.subject)
      on conflict (user_id, lower(btrim(name))) do nothing;
    select id into sid from public.subjects
      where user_id = new.user_id and lower(btrim(name)) = lower(new.subject);
    new.subject_id := sid;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function app.tasks_before_write();

-- Every status change is recorded (append-only; the client cannot write history).
create function app.tasks_status_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.task_status_history (user_id, task_id, from_status, to_status, changed_by)
    values (new.user_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return null;
end $$;

create trigger tasks_status_history after insert or update of status on public.tasks
  for each row execute function app.tasks_status_history();

-- Product analytics: first child, first task, first completed task (sample data excluded).
create function app.track_first_child() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_sample then
    insert into public.analytics_events (user_id, event) values (new.user_id, 'first_child_added') on conflict do nothing;
  end if;
  return null;
end $$;

create function app.track_first_tasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'sample' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.analytics_events (user_id, event, props)
      values (new.user_id, 'first_task_added', jsonb_build_object('source', new.source)) on conflict do nothing;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    insert into public.analytics_events (user_id, event) values (new.user_id, 'first_task_completed') on conflict do nothing;
  end if;
  return null;
end $$;

create trigger children_track_firsts after insert on public.children
  for each row execute function app.track_first_child();
create trigger tasks_track_firsts after insert or update of status on public.tasks
  for each row execute function app.track_first_tasks();
