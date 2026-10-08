-- Sign-up: when Supabase Auth creates a user, set up profile, settings, trial, subscription
-- and the children typed on the registration form. Runs inside the same transaction as the
-- sign-up, so a half-created account cannot exist.

create function app.email_hash(email text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(lower(btrim(email)), 'sha256'), 'hex');
$$;

create function app.clean(v text, max_len integer) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(v), max_len), '');
$$;

create function app.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  hash        text;
  already     boolean;
  trial_days  integer := coalesce((select (value #>> '{}')::integer from public.app_config where key = 'trial_days'), 7);
  kid         jsonb;
  school_name text;
  sid         uuid;
  palette     text[] := array['#a2542f', '#2f6690', '#3f7d4f', '#8a4fa3', '#c1691f', '#2f6b63'];
  n           integer := 0;
  phone       text := app.clean(meta ->> 'phone', 30);
  country     text := upper(app.clean(meta ->> 'country', 2));
begin
  -- Anonymous or e-mail-less users (not used by this app) get nothing.
  if new.email is null or coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles (id, full_name, phone, country, locale, timezone)
  values (
    new.id,
    coalesce(app.clean(meta ->> 'full_name', 120), split_part(new.email, '@', 1)),
    case when phone ~ '^[0-9+() .-]{6,30}$' then phone end,
    case when country ~ '^[A-Z]{2}$' then country end,
    case when meta ->> 'locale' in ('es', 'en') then meta ->> 'locale' else 'es' end,
    coalesce(app.clean(meta ->> 'timezone', 64), 'America/Guayaquil')
  );
  insert into public.user_settings (user_id) values (new.id);

  -- One free trial per e-mail address, remembered only as a hash.
  hash := app.email_hash(new.email);
  select exists (select 1 from public.used_trials where email_hash = hash) into already;
  insert into public.trial_periods (user_id, started_at, ends_at)
  values (new.id, now(), case when already then now() else now() + make_interval(days => trial_days) end);
  insert into public.used_trials (email_hash) values (hash) on conflict do nothing;
  insert into public.subscriptions (user_id, status) values (new.id, 'TRIAL');

  -- Children from the registration form: [{name, grade, school}], at most 10.
  if jsonb_typeof(meta -> 'children') = 'array' then
    for kid in select value from jsonb_array_elements(meta -> 'children') limit 10 loop
      continue when app.clean(kid ->> 'name', 60) is null;
      sid := null;
      school_name := app.clean(kid ->> 'school', 120);
      if school_name is not null then
        insert into public.schools (user_id, name) values (new.id, school_name)
          on conflict (user_id, lower(btrim(name))) do nothing;
        select id into sid from public.schools where user_id = new.id and lower(btrim(name)) = lower(school_name);
      end if;
      insert into public.children (user_id, name, grade, school_id, color, sort_order)
      values (new.id, app.clean(kid ->> 'name', 60), app.clean(kid ->> 'grade', 60), sid,
              palette[(n % array_length(palette, 1)) + 1], n);
      n := n + 1;
    end loop;
  end if;

  insert into public.analytics_events (user_id, event) values (new.id, 'registration'), (new.id, 'trial_started')
    on conflict do nothing;
  insert into public.audit_logs (user_id, action, detail)
    values (new.id, 'account_created', jsonb_build_object('trial_reused', already));

  -- A Hotmart purchase may have arrived before the account existed: claim it now.
  perform billing.claim_unmatched(new.id, hash);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.on_auth_user_created();
