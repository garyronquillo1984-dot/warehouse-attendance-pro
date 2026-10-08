-- Once a day, end licenses whose paid period (or grace) is over: billing.expire_licenses().
-- Uses Supabase's pg_cron. Skipped where pg_cron isn't available (local test databases).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    perform cron.schedule('expire-licenses', '15 5 * * *', 'select billing.expire_licenses()');  -- 05:15 UTC daily
  end if;
end $$;
