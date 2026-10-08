-- Live demo: every visitor gets a private sandbox company with sample data.
-- The visitor signs in anonymously (Supabase anonymous sign-in), then calls start_demo().
-- Nothing is shared between visitors, so nobody can break the demo for anyone else.
-- Demo companies are removed after 24 hours by app.purge_demos() (separate migration).

alter table public.organizations add column if not exists is_demo boolean not null default false;

create function public.start_demo()
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  org  uuid;
  wh   uuid;
  s1   uuid;
  s2   uuid;
  depts uuid[];
  firsts text[] := array['Maria','James','Linh','Carlos','Aisha','David','Rosa','Kevin','Fatima','Luis','Emily','Andre',
                         'Priya','Jose','Hannah','Marcus','Ana','Tyler','Grace','Omar','Sofia','Brandon','Mei','Diego',
                         'Olivia','Samuel','Yesenia','Jamal','Chloe','Victor','Nadia','Ethan','Lucia','Isaac','Keisha',
                         'Mateo','Rachel','Hector','Zoe','Daniel','Amara','Pedro','Lauren','Tomas','Imani','Noah',
                         'Valeria','Eric'];
  lasts  text[] := array['Lopez','Carter','Nguyen','Ramirez','Bello','Kim','Diaz','Brooks','Haddad','Morales','Walsh','Johnson',
                         'Patel','Hernandez','Schmidt','Reed','Torres','Owens','Park','Farouk','Castro','Hughes','Chen','Vargas',
                         'Bennett','Okafor','Ruiz','Washington','Murphy','Alvarez','Petrov','Collins','Mendoza','Grant','Howard',
                         'Rojas','Foster','Silva','Turner','Ortiz','Mensah','Gomez','Price','Santos','Jackson','Rivera',
                         'Navarro','Fischer'];
  reasons text[] := array['personal','no_call_no_show','transportation','family','other'];
  i int;
begin
  if uid is null or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true' then
    raise exception 'demo_only_for_guests' using errcode = '42501';
  end if;

  -- Same visitor coming back (page reload): reuse their sandbox.
  select m.organization_id into org from public.memberships m where m.user_id = uid limit 1;
  if org is not null then
    return org;
  end if;

  insert into public.organizations (name, timezone, plan_code, created_by, is_demo)
  values ('Demo Logistics', 'America/New_York', 'professional', uid, true)
  returning id into org;

  insert into public.licenses (provider, buyer_email, plan_code, status, current_period_end,
                               organization_id, claimed_by, claimed_at)
  values ('demo', 'demo-' || uid || '@demo.invalid', 'professional', 'trial', now() + interval '1 day',
          org, uid, now());

  insert into public.memberships (organization_id, user_id, role) values (org, uid, 'owner');

  insert into public.absence_reasons (organization_id, code, label, sort_order) values
    (org, 'personal', 'Personal', 1), (org, 'no_call_no_show', 'No call / no show', 2),
    (org, 'transportation', 'Transportation', 3), (org, 'family', 'Family', 4), (org, 'other', 'Other', 5);

  insert into public.warehouses (organization_id, name) values (org, 'DC-1 Demo') returning id into wh;
  insert into public.shifts (organization_id, warehouse_id, name, start_time, end_time, days, late_grace_minutes, sort_order)
  values (org, wh, 'First Shift', '06:00', '15:45', '{1,2,3,4,5}', 5, 0) returning id into s1;
  insert into public.shifts (organization_id, warehouse_id, name, start_time, end_time, days, late_grace_minutes, sort_order)
  values (org, wh, 'Second Shift', '16:00', '00:30', '{1,2,3,4,5}', 5, 1) returning id into s2;

  with d as (
    insert into public.departments (organization_id, warehouse_id, name)
    select org, wh, x from unnest(array['Picking','Packing','Receiving','Shipping']) x
    returning id
  ) select array_agg(id) into depts from d;

  -- 48 people: 43 have worked here a while, 2 started this week, 3 haven't had a first day yet.
  for i in 1..48 loop
    insert into public.employees (organization_id, warehouse_id, employee_code, first_name, last_name,
                                  shift_id, department_id, hire_date, created_at)
    values (org, wh, (10000 + i)::text, firsts[i], lasts[i],
            case when i % 2 = 1 then s1 else s2 end, depts[1 + (i % 4)],
            case when i > 45 then current_date
                 when i > 43 then current_date - 5
                 else current_date - 30 - (i % 40) end,
            case when i > 45 then now()
                 when i > 43 then now() - interval '5 days'
                 else now() - interval '35 days' end);
  end loop;

  -- Three weeks of weekday attendance up to yesterday (today is left for the visitor to take).
  -- Mostly present, some late, a few absences with reasons, a few excused.
  insert into public.attendance_records (employee_id, work_date, status, reason_code, source)
  select e.id, d::date,
         (case when r < 84 then 'present' when r < 91 then 'late' when r < 97 then 'absent' else 'excused' end)::public.attendance_status,
         case when r >= 91 then reasons[1 + (abs(hashtext(e.employee_code || d::date)) % 5)] end,
         'manual'
    from public.employees e
    cross join generate_series(current_date - 21, current_date - 1, interval '1 day') d
    cross join lateral (select abs(hashtext(e.employee_code || '-' || d::date)) % 100 as r) x
   where e.organization_id = org
     and extract(isodow from d) between 1 and 5
     and d::date >= coalesce(e.hire_date, current_date)
     and e.hire_date < current_date;

  return org;
end $$;

revoke execute on function public.start_demo() from public, anon;
grant execute on function public.start_demo() to authenticated;

-- The admin panel lists customers only; demo sandboxes are noise there.
create or replace function public.admin_overview()
returns table (organization_id uuid, organization_name text, created_at timestamptz,
               license_status public.license_status, plan_code text, current_period_end timestamptz,
               warehouses bigint, users bigint, active_employees bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.created_at,
         (app.current_license(o.id)).status,
         (app.current_license(o.id)).plan_code,
         (app.current_license(o.id)).current_period_end,
         (select count(*) from public.warehouses w where w.organization_id = o.id),
         (select count(*) from public.memberships m where m.organization_id = o.id),
         (select count(*) from public.employees e where e.organization_id = o.id and e.status = 'active'),
         (select max(a.updated_at) from public.attendance_records a where a.organization_id = o.id)
  from public.organizations o
  where not o.is_demo
  order by o.created_at desc;
end $$;


create or replace function public.admin_list_licenses()
returns table (license_id uuid, organization_id uuid, buyer_email text, status public.license_status,
               plan_code text, current_period_end timestamptz, claimed_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select l.id, l.organization_id, l.buyer_email::text, l.status, l.plan_code,
         l.current_period_end, l.claimed_at, l.updated_at
  from public.licenses l where l.provider <> 'demo' order by l.updated_at desc;
end $$;

