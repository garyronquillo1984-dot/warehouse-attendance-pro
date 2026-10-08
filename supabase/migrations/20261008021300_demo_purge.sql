-- Removes demo sandboxes older than 24 hours and guest (anonymous) sign-ins older than 2 days.
-- Contains DELETE statements, so Supabase asks for a confirmation: apply it from the SQL Editor.
create function app.purge_demos()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  old_orgs uuid[];
  n int;
begin
  select coalesce(array_agg(id), '{}') into old_orgs
    from public.organizations where is_demo and created_at < now() - interval '24 hours';
  n := cardinality(old_orgs);

  if n > 0 then
    perform set_config('app.transferring_ownership', 'on', true);   -- lets the owner membership go
    delete from public.attendance_records where organization_id = any (old_orgs);
    delete from public.employees          where organization_id = any (old_orgs);
    delete from public.import_batches     where organization_id = any (old_orgs);
    delete from public.memberships        where organization_id = any (old_orgs);
    delete from public.licenses           where organization_id = any (old_orgs) and provider = 'demo';
    delete from public.organizations      where id = any (old_orgs);   -- warehouses, shifts, departments, reasons cascade
    delete from public.audit_log          where organization_id = any (old_orgs);
  end if;

  -- Guests who no longer belong to any company.
  delete from auth.users u
   where u.is_anonymous and u.created_at < now() - interval '2 days'
     and not exists (select 1 from public.memberships m where m.user_id = u.id);
  return n;
end $$;

revoke execute on function app.purge_demos() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-demos', '20 * * * *', 'select app.purge_demos()');   -- every hour at :20
  end if;
end $$;
