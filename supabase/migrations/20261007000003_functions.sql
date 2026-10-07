-- Warehouse Attendance Pro — server functions (RPC)
-- Every function that changes roles, memberships or licenses lives here, runs with
-- server privileges, and checks who is calling before doing anything.

-- ---------------------------------------------------------------------------
-- Profiles: created automatically on sign up
-- ---------------------------------------------------------------------------
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Read helpers for the app
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Claim a purchased license: create the company and become its owner
-- ---------------------------------------------------------------------------
create function public.claim_license(org_name text, org_timezone text default 'America/New_York')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  email extensions.citext;
  lic   public.licenses;
  org   uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- Email comes from the auth database, never from the browser, and must be confirmed.
  select u.email into email from auth.users u
   where u.id = uid and u.email_confirmed_at is not null;
  if email is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  select l.* into lic from public.licenses l
   where l.organization_id is null
     and l.buyer_email = email
     and l.status in ('trial', 'active')
   order by l.created_at
   limit 1
   for update skip locked;
  if lic.id is null then
    raise exception 'no_license_for_this_email' using errcode = 'P0002';
  end if;

  insert into public.organizations (name, timezone, plan_code, created_by)
  values (trim(org_name), coalesce(nullif(trim(org_timezone), ''), 'America/New_York'), lic.plan_code, uid)
  returning id into org;

  insert into public.memberships (organization_id, user_id, role) values (org, uid, 'owner');

  update public.licenses
     set organization_id = org, claimed_by = uid, claimed_at = now()
   where id = lic.id and organization_id is null;
  if not found then
    raise exception 'license_already_claimed' using errcode = '40001';
  end if;

  insert into public.absence_reasons (organization_id, code, label, sort_order) values
    (org, 'personal',        'Personal',         1),
    (org, 'no_call_no_show', 'No call / no show', 2),
    (org, 'transportation',  'Transportation',   3),
    (org, 'family',          'Family',           4),
    (org, 'other',           'Other',            5);

  return org;
end $$;

-- ---------------------------------------------------------------------------
-- Team management
-- ---------------------------------------------------------------------------
-- Returns the plain token once; only its hash is stored.
create function public.create_invitation(org uuid, invite_email text, invite_role public.member_role,
                                         warehouse_ids uuid[] default '{}')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text;
begin
  if not (app.license_ok(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if invite_role = 'owner' then
    raise exception 'cannot_invite_owner' using errcode = '42501';
  end if;
  if invite_role = 'admin' and not app.has_role(org, '{owner}') then
    raise exception 'only_owner_can_invite_admins' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(warehouse_ids, '{}')) w(id)
             where not exists (select 1 from public.warehouses x where x.id = w.id and x.organization_id = org)) then
    raise exception 'warehouse_not_in_organization' using errcode = '42501';
  end if;

  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (organization_id, email, role, warehouse_ids, token_hash, invited_by)
  values (org, lower(trim(invite_email)), invite_role, coalesce(warehouse_ids, '{}'),
          encode(extensions.digest(token, 'sha256'), 'hex'), auth.uid());
  return token;
end $$;

create function public.accept_invitation(token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  email extensions.citext;
  inv   public.invitations;
begin
  select u.email into email from auth.users u
   where u.id = uid and u.email_confirmed_at is not null;
  if email is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  select i.* into inv from public.invitations i
   where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
   for update;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invitation_invalid_or_expired' using errcode = 'P0002';
  end if;
  if inv.email <> email then
    raise exception 'invitation_for_another_email' using errcode = '42501';
  end if;
  if not app.license_active(inv.organization_id) then
    raise exception 'license_inactive' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;

  if inv.role = 'supervisor' then
    insert into public.member_warehouses (organization_id, user_id, warehouse_id)
    select inv.organization_id, uid, w from unnest(inv.warehouse_ids) w
    on conflict do nothing;
  end if;

  update public.invitations set accepted_at = now() where id = inv.id;
  return inv.organization_id;
end $$;

-- Change a member's role (admin/supervisor) and warehouses.
create function public.update_member(org uuid, member uuid, new_role public.member_role,
                                     warehouse_ids uuid[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  existing_role public.member_role;
begin
  if not (app.license_ok(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select m.role into existing_role from public.memberships m
   where m.organization_id = org and m.user_id = member;
  if existing_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  if existing_role = 'owner' or new_role = 'owner' then
    raise exception 'use_transfer_ownership' using errcode = '42501';
  end if;
  if (existing_role = 'admin' or new_role = 'admin') and not app.has_role(org, '{owner}') then
    raise exception 'only_owner_can_manage_admins' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(warehouse_ids, '{}')) w(id)
             where not exists (select 1 from public.warehouses x where x.id = w.id and x.organization_id = org)) then
    raise exception 'warehouse_not_in_organization' using errcode = '42501';
  end if;

  update public.memberships set role = new_role where organization_id = org and user_id = member;
  delete from public.member_warehouses where organization_id = org and user_id = member;
  if new_role = 'supervisor' then
    insert into public.member_warehouses (organization_id, user_id, warehouse_id)
    select org, member, w from unnest(warehouse_ids) w;
  end if;
end $$;

create function public.remove_member(org uuid, member uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  existing_role public.member_role;
  is_self boolean := member = auth.uid();
begin
  select m.role into existing_role from public.memberships m
   where m.organization_id = org and m.user_id = member;
  if existing_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  if existing_role = 'owner' then
    raise exception 'owner_cannot_be_removed' using errcode = '42501';
  end if;
  if not is_self then
    if not app.has_role(org, '{owner,admin}') then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if existing_role = 'admin' and not app.has_role(org, '{owner}') then
      raise exception 'only_owner_can_manage_admins' using errcode = '42501';
    end if;
  end if;
  delete from public.memberships where organization_id = org and user_id = member;
end $$;

create function public.transfer_ownership(org uuid, new_owner uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_role(org, '{owner}') then
    raise exception 'only_owner' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships where organization_id = org and user_id = new_owner) then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  perform set_config('app.transferring_ownership', 'on', true);
  update public.memberships set role = 'admin' where organization_id = org and user_id = auth.uid();
  delete from public.member_warehouses where organization_id = org and user_id = new_owner;
  update public.memberships set role = 'owner' where organization_id = org and user_id = new_owner;
  perform set_config('app.transferring_ownership', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- Platform owner (Super Admin): totals and statuses only, never employee data.
-- Requires platform_admins membership AND an MFA (aal2) session.
-- ---------------------------------------------------------------------------
create function public.admin_overview()
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
  order by o.created_at desc;
end $$;

create function public.admin_list_licenses()
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
  from public.licenses l order by l.updated_at desc;
end $$;

-- Manual grant (support, pilots, trials) or correction of a license.
create function public.admin_upsert_license(target_license uuid, buyer text, plan text,
                                            new_status public.license_status, period_end timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lic_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if target_license is null then
    insert into public.licenses (provider, buyer_email, plan_code, status, current_period_end)
    values ('manual', lower(trim(buyer)), plan, new_status, period_end)
    returning id into lic_id;
  else
    update public.licenses
       set status = new_status,
           plan_code = coalesce(plan, plan_code),
           current_period_end = coalesce(period_end, current_period_end),
           ended_at = case when new_status in ('cancelled', 'expired') then now() else null end
     where id = target_license
     returning id into lic_id;
    update public.organizations o set plan_code = l.plan_code
      from public.licenses l where l.id = lic_id and o.id = l.organization_id;
  end if;
  return lic_id;
end $$;

-- ---------------------------------------------------------------------------
-- Billing (Hotmart). Only the server (service_role) can run these.
-- ---------------------------------------------------------------------------
create schema if not exists billing;
revoke all on schema billing from public;
grant usage on schema billing to service_role;

create function billing.apply_hotmart_event(
  p_event_id text, p_event_type text, p_event_time timestamptz,
  p_subscriber_code text, p_transaction text, p_buyer_email text,
  p_plan_code text, p_period_end timestamptz, p_payload jsonb default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  ev_id   uuid;
  lic     public.licenses;
  v_outcome text;
begin
  -- 1. Idempotency: each Hotmart event is processed once.
  insert into public.billing_events (provider_event_id, event_type, event_time, subscriber_code,
                                     transaction_code, buyer_email, payload)
  values (p_event_id, p_event_type, p_event_time, p_subscriber_code, p_transaction,
          lower(trim(p_buyer_email)), p_payload)
  on conflict (provider_event_id) do nothing
  returning id into ev_id;
  if ev_id is null then
    return 'duplicate';
  end if;

  -- 2. Find the license: by subscriber code (subscriptions) or transaction (one-time).
  --    A claimed license is never looked up by email.
  if p_subscriber_code is not null then
    select l.* into lic from public.licenses l where l.provider_subscriber_code = p_subscriber_code for update;
  elsif p_transaction is not null then
    select l.* into lic from public.licenses l
     where l.provider_transaction = p_transaction and l.provider = 'hotmart' for update;
  end if;

  -- 3. Out-of-order protection.
  if lic.id is not null and lic.last_event_at is not null and p_event_time is not null
     and p_event_time < lic.last_event_at then
    v_outcome := 'stale';
  elsif p_event_type in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE') then
    if lic.id is null then
      insert into public.licenses (provider, buyer_email, provider_subscriber_code, provider_transaction,
                                   plan_code, status, current_period_end, last_event_at)
      values ('hotmart', lower(trim(p_buyer_email)), p_subscriber_code, p_transaction,
              p_plan_code, 'active', coalesce(p_period_end, now() + interval '1 month'), p_event_time);
      v_outcome := 'license_created';
    else
      update public.licenses
         set status = 'active',
             plan_code = coalesce(p_plan_code, plan_code),
             current_period_end = greatest(coalesce(p_period_end, now() + interval '1 month'),
                                           coalesce(current_period_end, now())),
             grace_until = null, ended_at = null, cancel_at_period_end = false,
             last_event_at = coalesce(p_event_time, last_event_at)
       where id = lic.id;
      v_outcome := 'license_activated';
    end if;
  elsif lic.id is null then
    v_outcome := 'no_license';
  elsif p_event_type = 'PURCHASE_DELAYED' then
    update public.licenses set grace_until = now() + interval '7 days',
           last_event_at = coalesce(p_event_time, last_event_at) where id = lic.id;
    v_outcome := 'grace_started';
  elsif p_event_type in ('PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK') then
    update public.licenses set status = 'cancelled', ended_at = now(),
           last_event_at = coalesce(p_event_time, last_event_at) where id = lic.id;
    v_outcome := 'license_cancelled';
  elsif p_event_type = 'SUBSCRIPTION_CANCELLATION' then
    update public.licenses set cancel_at_period_end = true,
           last_event_at = coalesce(p_event_time, last_event_at) where id = lic.id;
    v_outcome := 'cancel_at_period_end';
  elsif p_event_type = 'SWITCH_PLAN' and p_plan_code is not null then
    update public.licenses set plan_code = p_plan_code,
           last_event_at = coalesce(p_event_time, last_event_at) where id = lic.id;
    v_outcome := 'plan_changed';
  elsif p_event_type = 'UPDATE_SUBSCRIPTION_CHARGE_DATE' and p_period_end is not null then
    update public.licenses set current_period_end = p_period_end,
           last_event_at = coalesce(p_event_time, last_event_at) where id = lic.id;
    v_outcome := 'period_updated';
  elsif p_event_type in ('PURCHASE_CANCELED', 'PURCHASE_EXPIRED') then
    v_outcome := 'ignored_unpaid';
  elsif p_event_type = 'PURCHASE_PROTEST' then
    v_outcome := 'needs_review';
  else
    v_outcome := 'ignored';
  end if;

  -- Keep the organization's plan in step with its license.
  if lic.id is not null and lic.organization_id is not null then
    update public.organizations o set plan_code = l.plan_code
      from public.licenses l where l.id = lic.id and o.id = l.organization_id and o.plan_code <> l.plan_code;
  end if;

  update public.billing_events set processed_at = now(), outcome = v_outcome where id = ev_id;
  return v_outcome;
end $$;

-- Daily job: end of paid periods and of grace.
create function billing.expire_licenses()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  k int;
begin
  update public.licenses set status = 'expired', ended_at = now()
   where status in ('trial', 'active') and cancel_at_period_end and current_period_end < now();
  get diagnostics k = row_count; n := n + k;

  update public.licenses set status = 'suspended', ended_at = now()
   where status = 'active' and not cancel_at_period_end
     and current_period_end < now() and (grace_until is null or grace_until < now());
  get diagnostics k = row_count; n := n + k;

  update public.licenses set status = 'expired', ended_at = now()
   where status = 'trial' and current_period_end < now();
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

revoke execute on all functions in schema billing from public;
grant execute on all functions in schema billing to service_role;

-- ---------------------------------------------------------------------------
-- Function privileges: authenticated users may call only the app-facing RPCs.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.my_organizations(),
  public.my_license(uuid),
  public.claim_license(text, text),
  public.create_invitation(uuid, text, public.member_role, uuid[]),
  public.accept_invitation(text),
  public.update_member(uuid, uuid, public.member_role, uuid[]),
  public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid),
  public.admin_overview(),
  public.admin_list_licenses(),
  public.admin_upsert_license(uuid, text, text, public.license_status, timestamptz)
to authenticated;
revoke execute on function app.handle_new_user() from public;
