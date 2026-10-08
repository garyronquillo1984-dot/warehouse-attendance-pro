-- Jobs (Supabase's pg_cron). Skipped where pg_cron isn't available (local test databases).
--   every 15 min : in-app reminders in each parent's own time zone
--   daily 05:10  : end paid periods that are over, count trials that ended
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    perform cron.schedule('itt-reminders', '*/15 * * * *', 'select app.generate_reminders()');
    perform cron.schedule('itt-expire-subscriptions', '10 5 * * *', 'select billing.expire_subscriptions()');
  end if;
end $$;
