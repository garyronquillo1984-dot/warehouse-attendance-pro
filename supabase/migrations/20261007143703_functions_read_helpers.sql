-- Warehouse Attendance Pro — server functions (RPC). See README for the security model.

-- Organizations the caller belongs to, with role and license state
-- (works even when the license is inactive, so the app can show the inactive page).
create function public.my_organizations()
returns table (organization_id uuid, name text, role public.member_role,
               license_status public.license_status, can_write boolean, can_read boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, m.role,
         (app.current_license(o.id)).status,
         app.license_ok(o.id),
         app.license_readable(o.id)
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
  order by o.name;
$$;

-- License summary for one organization. Never exposes buyer email or Hotmart ids.
create function public.my_license(org uuid)
returns table (status public.license_status, plan_code text, plan_name text,
               current_period_end timestamptz, cancel_at_period_end boolean,
               grace_until timestamptz, can_write boolean, can_read boolean)
language sql stable security definer set search_path = '' as $$
  select l.status, l.plan_code, p.name, l.current_period_end, l.cancel_at_period_end,
         l.grace_until, app.license_ok(org), app.license_readable(org)
  from app.current_license(org) l
  join public.plans p on p.code = l.plan_code
  where app.is_member(org);
$$;

revoke execute on function public.my_organizations(), public.my_license(uuid) from public, anon;
grant execute on function public.my_organizations(), public.my_license(uuid) to authenticated;
