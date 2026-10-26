-- Data retention for the recruiting module: candidate records nobody has touched for longer
-- than the company's retention period (recruitment_settings.retention_months, default 12)
-- are deleted with their contact log and tasks. People who started working are kept: their
-- record belongs with the employee file. The audit log keeps only field names, never values.
-- Contains DELETE statements, so Supabase asks for a confirmation: apply it from the SQL Editor.
create function app.purge_recruitment()
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.candidates c
   using public.organizations o
   left join public.recruitment_settings s on s.organization_id = o.id
   where c.organization_id = o.id
     and c.stage not in ('started', 'retention')
     and c.updated_at < now() - make_interval(months => coalesce(s.retention_months, 12));
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function app.purge_recruitment() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-recruitment', '40 5 * * *', 'select app.purge_recruitment()');   -- 05:40 UTC daily
  end if;
end $$;
