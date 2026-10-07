-- Warehouse Attendance Pro — server functions (RPC). See README for the security model.

-- Team management (role changes, removals, ownership transfer).
-- Contains DELETE statements inside functions, so Supabase asks for confirmation:
-- apply it from the Supabase SQL Editor (see README).
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

revoke execute on function public.update_member(uuid, uuid, public.member_role, uuid[]),
  public.remove_member(uuid, uuid), public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.update_member(uuid, uuid, public.member_role, uuid[]),
  public.remove_member(uuid, uuid), public.transfer_ownership(uuid, uuid) to authenticated;
