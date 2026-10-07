-- Warehouse Attendance Pro — access control
-- Principle: least privilege. Revoke everything Supabase grants by default, then
-- grant back only what each table needs, and let Row Level Security decide which rows.

-- ---------------------------------------------------------------------------
-- 1. Privileges: nothing by default, explicit grants only
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

grant usage on schema public to authenticated;

grant select                                  on public.plans              to authenticated;
grant select                                  on public.organizations      to authenticated;
grant update (name, timezone)                 on public.organizations      to authenticated;
grant select, insert                          on public.profiles           to authenticated;
grant update (full_name)                      on public.profiles           to authenticated;
grant select                                  on public.memberships        to authenticated;
grant select                                  on public.member_warehouses  to authenticated;
grant select, insert                          on public.warehouses         to authenticated;
grant update (name, is_active)                on public.warehouses         to authenticated;
grant select, insert, delete                  on public.shifts             to authenticated;
grant update (name, start_time, end_time, days, late_grace_minutes, is_active, sort_order)
                                              on public.shifts             to authenticated;
grant select, insert, delete                  on public.departments        to authenticated;
grant update (name, is_active)                on public.departments        to authenticated;
grant select, insert                          on public.absence_reasons    to authenticated;
grant update (label, is_active, sort_order)   on public.absence_reasons    to authenticated;
grant select, insert                          on public.employees          to authenticated;
grant update (employee_code, first_name, last_name, shift_id, department_id, status, hire_date)  -- warehouse transfers: later version
                                              on public.employees          to authenticated;
grant select, insert, delete                  on public.attendance_records to authenticated;
grant update (status, reason_code, note, shift_id, source, import_batch_id)
                                              on public.attendance_records to authenticated;
grant select, insert                          on public.import_batches     to authenticated;
grant select                                  on public.invitations        to authenticated;
grant select                                  on public.audit_log          to authenticated;
-- licenses, billing_events, platform_admins: no client access at all.

-- ---------------------------------------------------------------------------
-- 2. Access functions (private schema, not exposed by the API)
-- ---------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

create function app.has_role(org uuid, roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

create function app.is_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(org, '{owner,admin,supervisor}');
$$;

-- The license currently governing an organization (most recent one).
create function app.current_license(org uuid)
returns public.licenses language sql stable security definer set search_path = '' as $$
  select l.* from public.licenses l
  where l.organization_id = org
  order by l.created_at desc
  limit 1;
$$;

-- Active or in grace: may write.
create function app.license_active(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select l.status in ('trial', 'active')
       and greatest(l.current_period_end, coalesce(l.grace_until, l.current_period_end)) > now()
    from app.current_license(org) l
  ), false);
$$;

-- Caller is a member AND the license allows writing.
create function app.license_ok(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_member(org) and app.license_active(org);
$$;

-- Caller may read: license active, or Owner/Admin up to 30 days after it ended (export window).
create function app.license_readable(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.license_ok(org)
      or (app.has_role(org, '{owner,admin}') and coalesce((
            select l.status in ('cancelled', 'expired', 'suspended')
               and coalesce(l.ended_at, l.updated_at) > now() - interval '30 days'
            from app.current_license(org) l
          ), false));
$$;

-- Owner/Admin: every warehouse of the organization. Supervisor: assigned warehouses only.
create function app.in_warehouse(org uuid, wh uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role(org, '{owner,admin}')
      or exists (
        select 1 from public.member_warehouses mw
        where mw.organization_id = org
          and mw.warehouse_id = wh
          and mw.user_id = (select auth.uid())
      );
$$;

-- Two users share at least one organization (to show colleague names).
create function app.shares_org(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.organization_id = a.organization_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

create function app.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()))
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

revoke execute on all functions in schema app from public;
grant execute on function
  app.has_role(uuid, public.member_role[]), app.is_member(uuid), app.license_active(uuid),
  app.license_ok(uuid), app.license_readable(uuid), app.in_warehouse(uuid, uuid),
  app.shares_org(uuid), app.is_platform_admin()
to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Integrity triggers
-- ---------------------------------------------------------------------------
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function app.forbid_org_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

-- Attendance: the server, not the browser, decides company, warehouse, shift default and author.
create function app.attendance_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  emp record;
begin
  select e.organization_id, e.warehouse_id, e.shift_id into emp
  from public.employees e where e.id = new.employee_id;
  if not found then
    raise exception 'employee not found' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'employee_id cannot be changed' using errcode = '42501';
  end if;
  new.organization_id := emp.organization_id;
  new.warehouse_id    := emp.warehouse_id;
  if tg_op = 'INSERT' and new.shift_id is null then
    new.shift_id := emp.shift_id;
  end if;
  new.recorded_by := auth.uid();
  new.updated_at  := now();
  return new;
end $$;

-- Employees: first_attendance_date = first present/late record (drives "NEW EMPLOYEE").
create function app.refresh_first_attendance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  emp_id uuid := coalesce(new.employee_id, old.employee_id);
begin
  update public.employees e
     set first_attendance_date = (
       select min(a.work_date) from public.attendance_records a
       where a.employee_id = emp_id and a.status in ('present', 'late'))
   where e.id = emp_id;
  return null;
end $$;

-- Plan limits, enforced in the database. Advisory lock: two simultaneous inserts
-- cannot both slip under the limit.
create function app.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  n int;
begin
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text));
  select pl.* into p from public.plans pl
  join public.organizations o on o.plan_code = pl.code
  where o.id = new.organization_id;

  if tg_table_name = 'employees' then
    if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') and p.max_employees is not null then
      select count(*) into n from public.employees
       where organization_id = new.organization_id and status = 'active';
      if n >= p.max_employees then
        raise exception 'plan_limit_employees: your plan allows % active employees', p.max_employees using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name = 'warehouses' then
    if p.max_warehouses is not null then
      select count(*) into n from public.warehouses where organization_id = new.organization_id;
      if n >= p.max_warehouses then
        raise exception 'plan_limit_warehouses: your plan allows % warehouses', p.max_warehouses using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name = 'memberships' then
    if p.max_users is not null then
      select count(*) into n from public.memberships where organization_id = new.organization_id;
      if n >= p.max_users then
        raise exception 'plan_limit_users: your plan allows % users', p.max_users using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;

-- An organization must always keep exactly one owner.
create function app.guard_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner' and exists (
      select 1 from public.memberships where organization_id = new.organization_id and role = 'owner') then
      raise exception 'organization already has an owner' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and coalesce(current_setting('app.transferring_ownership', true), '') <> 'on' then
    raise exception 'the owner cannot be removed or demoted; transfer ownership first' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

-- Append-only audit trail.
create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  rec_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_log (organization_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    coalesce(rec_new ->> 'organization_id', rec_old ->> 'organization_id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(rec_new ->> 'id', rec_old ->> 'id', rec_new ->> 'user_id', rec_old ->> 'user_id')::uuid,
    rec_old,
    rec_new
  );
  return null;
end $$;

-- updated_at
create trigger touch before update on public.organizations      for each row execute function app.touch_updated_at();
create trigger touch before update on public.licenses           for each row execute function app.touch_updated_at();
create trigger touch before update on public.profiles           for each row execute function app.touch_updated_at();
create trigger touch before update on public.warehouses         for each row execute function app.touch_updated_at();
create trigger touch before update on public.shifts             for each row execute function app.touch_updated_at();
create trigger touch before update on public.departments        for each row execute function app.touch_updated_at();
create trigger touch before update on public.employees          for each row execute function app.touch_updated_at();

-- organization_id is immutable on every tenant table
create trigger no_org_change before update on public.memberships        for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.member_warehouses  for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.warehouses         for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.shifts             for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.departments        for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.absence_reasons    for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.employees          for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.import_batches     for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.invitations        for each row execute function app.forbid_org_change();

create trigger attendance_defaults before insert or update on public.attendance_records
  for each row execute function app.attendance_defaults();
create trigger first_attendance after insert or update of status, work_date or delete on public.attendance_records
  for each row execute function app.refresh_first_attendance();

create trigger plan_limits before insert or update of status on public.employees  for each row execute function app.enforce_plan_limits();
create trigger plan_limits before insert on public.warehouses                      for each row execute function app.enforce_plan_limits();
create trigger plan_limits before insert on public.memberships                     for each row execute function app.enforce_plan_limits();

create trigger guard_owner before insert or update or delete on public.memberships for each row execute function app.guard_owner();

create trigger audit after insert or update or delete on public.employees          for each row execute function app.audit();
create trigger audit after insert or update or delete on public.attendance_records for each row execute function app.audit();
create trigger audit after insert or update or delete on public.memberships        for each row execute function app.audit();
create trigger audit after insert or update or delete on public.warehouses         for each row execute function app.audit();
create trigger audit after insert or update or delete on public.shifts             for each row execute function app.audit();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security: on for every table
-- ---------------------------------------------------------------------------
alter table public.plans              enable row level security;
alter table public.organizations      enable row level security;
alter table public.licenses           enable row level security;  -- no policies: clients use public.my_license()
alter table public.profiles           enable row level security;
alter table public.memberships        enable row level security;
alter table public.platform_admins    enable row level security;  -- no policies
alter table public.warehouses         enable row level security;
alter table public.member_warehouses  enable row level security;
alter table public.shifts             enable row level security;
alter table public.departments        enable row level security;
alter table public.absence_reasons    enable row level security;
alter table public.employees          enable row level security;
alter table public.import_batches     enable row level security;
alter table public.attendance_records enable row level security;
alter table public.invitations        enable row level security;
alter table public.audit_log          enable row level security;
alter table public.billing_events     enable row level security;  -- no policies

-- plans: public catalogue
create policy plans_read on public.plans for select to authenticated using (is_active);

-- organizations
create policy org_read on public.organizations for select to authenticated
  using (app.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (app.license_ok(id) and app.has_role(id, '{owner,admin}'))
  with check (app.license_ok(id) and app.has_role(id, '{owner,admin}'));

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or app.shares_org(user_id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- memberships / member_warehouses: read only (changes go through server functions)
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(organization_id, '{owner,admin}'));
create policy member_wh_read on public.member_warehouses for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(organization_id, '{owner,admin}'));

-- warehouses
create policy wh_read on public.warehouses for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, id));
create policy wh_insert on public.warehouses for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy wh_update on public.warehouses for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- shifts
create policy shifts_read on public.shifts for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy shifts_insert on public.shifts for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy shifts_update on public.shifts for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy shifts_delete on public.shifts for delete to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- departments
create policy dept_read on public.departments for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy dept_insert on public.departments for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy dept_update on public.departments for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy dept_delete on public.departments for delete to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- absence reasons
create policy reasons_read on public.absence_reasons for select to authenticated
  using (app.license_readable(organization_id));
create policy reasons_insert on public.absence_reasons for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy reasons_update on public.absence_reasons for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- employees: read within your warehouses; write Owner/Admin; never deleted (deactivated)
create policy emp_read on public.employees for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy emp_insert on public.employees for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy emp_update on public.employees for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- import batches
create policy imports_read on public.import_batches for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy imports_insert on public.import_batches for insert to authenticated
  with check (
    app.license_ok(organization_id)
    and (app.has_role(organization_id, '{owner,admin}')
         or (kind = 'attendance' and app.in_warehouse(organization_id, warehouse_id)))
  );

-- attendance: everyone in the warehouse captures; delete = "No Record" (kept in audit_log)
create policy att_read on public.attendance_records for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy att_insert on public.attendance_records for insert to authenticated
  with check (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy att_update on public.attendance_records for update to authenticated
  using (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id))
  with check (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy att_delete on public.attendance_records for delete to authenticated
  using (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id));

-- invitations: Owner/Admin see their organization's invitations
create policy invitations_read on public.invitations for select to authenticated
  using (app.has_role(organization_id, '{owner,admin}'));

-- audit log: Owner/Admin read their organization's history
create policy audit_read on public.audit_log for select to authenticated
  using (app.license_readable(organization_id) and app.has_role(organization_id, '{owner,admin}'));
