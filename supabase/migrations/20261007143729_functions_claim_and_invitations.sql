-- Warehouse Attendance Pro — server functions (RPC). See README for the security model.

-- Claim a purchased license: create the company and become its owner
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

revoke execute on function public.claim_license(text, text), public.create_invitation(uuid, text, public.member_role, uuid[]),
  public.accept_invitation(text) from public, anon;
grant execute on function public.claim_license(text, text), public.create_invitation(uuid, text, public.member_role, uuid[]),
  public.accept_invitation(text) to authenticated;
