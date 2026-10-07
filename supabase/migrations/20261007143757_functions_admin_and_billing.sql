-- Warehouse Attendance Pro — server functions (RPC). See README for the security model.

-- Platform owner (Super Admin): totals and statuses only, never employee data.
-- Requires platform_admins membership AND an MFA (aal2) session.
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

revoke execute on function public.admin_overview(), public.admin_list_licenses(),
  public.admin_upsert_license(uuid, text, text, public.license_status, timestamptz) from public, anon;
grant execute on function public.admin_overview(), public.admin_list_licenses(),
  public.admin_upsert_license(uuid, text, text, public.license_status, timestamptz) to authenticated;

-- Billing (Hotmart). Only the server (service_role) can run these.
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

revoke execute on function billing.apply_hotmart_event(text, text, timestamptz, text, text, text, text, timestamptz, jsonb),
  billing.expire_licenses() from public, anon, authenticated;
grant execute on function billing.apply_hotmart_event(text, text, timestamptz, text, text, text, text, timestamptz, jsonb),
  billing.expire_licenses() to service_role;
