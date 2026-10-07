-- Team screen, invitation revoke, super admin extras, and the Hotmart webhook entry point.

-- Owner/Admin: the people in their company, with emails (auth.users is not reachable from the app).
create function public.team_members(org uuid)
returns table (user_id uuid, full_name text, email text, role public.member_role,
               warehouse_ids uuid[], joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.license_readable(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select m.user_id, p.full_name, u.email::text, m.role,
         coalesce((select array_agg(mw.warehouse_id) from public.member_warehouses mw
                    where mw.organization_id = org and mw.user_id = m.user_id), '{}'),
         m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
   where m.organization_id = org
   order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at;
end $$;

-- Owner/Admin: cancel a pending invitation (it simply expires now; the row stays as history).
create function public.revoke_invitation(invitation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  select i.organization_id into org from public.invitations i
   where i.id = invitation and i.accepted_at is null;
  if org is null or not app.has_role(org, '{owner,admin}') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.invitations set expires_at = now() where id = invitation;
end $$;

-- Tells the app whether to show the Admin link. Answers only about the caller.
create function public.am_platform_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()));
$$;

-- Super admin: the latest Hotmart deliveries, to check the webhook works. No customer data.
create function public.admin_billing_events(max_rows int default 50)
returns table (received_at timestamptz, event_type text, outcome text, buyer_email text,
               subscriber_code text, transaction_code text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select b.received_at, b.event_type, b.outcome, b.buyer_email::text, b.subscriber_code, b.transaction_code
    from public.billing_events b
   order by b.received_at desc
   limit least(greatest(max_rows, 1), 500);
end $$;

-- Entry point for the Hotmart webhook Edge Function (service role only).
create function public.hotmart_apply_event(
  p_event_id text, p_event_type text, p_event_time timestamptz,
  p_subscriber_code text, p_transaction text, p_buyer_email text,
  p_plan_code text, p_period_end timestamptz, p_payload jsonb)
returns text
language sql security definer set search_path = '' as $$
  select billing.apply_hotmart_event(p_event_id, p_event_type, p_event_time, p_subscriber_code,
                                     p_transaction, p_buyer_email, p_plan_code, p_period_end, p_payload);
$$;

revoke execute on function public.team_members(uuid), public.revoke_invitation(uuid),
  public.am_platform_admin(), public.admin_billing_events(int) from public, anon;
grant execute on function public.team_members(uuid), public.revoke_invitation(uuid),
  public.am_platform_admin(), public.admin_billing_events(int) to authenticated;

revoke execute on function public.hotmart_apply_event(text, text, timestamptz, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.hotmart_apply_event(text, text, timestamptz, text, text, text, text, timestamptz, jsonb)
  to service_role;
