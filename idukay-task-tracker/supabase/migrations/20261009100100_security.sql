-- Access control.
--   VIEWER (parents): no table access at all. They call the viewer_* functions with their
--                     link token; those functions return only what the link allows, read-only.
--   ADMIN:            a signed-in user listed in public.admins. Manages classes, students,
--                     links and homework. Homework is never deleted (only withdrawn), and every
--                     correction is versioned.
-- Any other signed-in user (should public sign-up ever be left on) gets nothing.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
revoke all on schema app from public;
grant usage on schema app to authenticated, anon;
grant usage on schema public to authenticated, anon;

create function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function app.is_admin() from public;
grant execute on function app.is_admin() to authenticated;

-- Admin grants (rows still filtered by RLS → admins only).
grant select, update (school_name, grade_label, grade_short, parallel, school_year, timezone, is_active) on public.classes to authenticated;
grant select, insert (class_id, name, language, emoji, sort_order), update (name, language, emoji, sort_order), delete on public.subjects to authenticated;
grant select, insert (class_id, first_name), update (first_name, is_active) on public.students to authenticated;
grant select (id, label, created_at, revoked_at, last_used_at) on public.viewer_links to authenticated;   -- never the token hash
grant select on public.viewer_link_students to authenticated;
grant select,
      insert (class_id, subject, title, instructions, parent_explanation, language, start_date, due_date, teacher, notes, attachments, source),
      update (subject, title, instructions, parent_explanation, language, start_date, due_date, teacher, notes, attachments)
  on public.homework to authenticated;                         -- no DELETE for anyone
grant select on public.homework_revisions, public.sync_runs, public.audit_logs to authenticated;

do $$
declare t text;
begin
  foreach t in array array['classes', 'subjects', 'students', 'viewer_links', 'viewer_link_students', 'homework',
                           'homework_revisions', 'sync_runs', 'admins', 'audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy admin_read   on public.classes   for select to authenticated using ((select app.is_admin()));
create policy admin_update on public.classes   for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy admin_all    on public.subjects  for all    to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy admin_read   on public.students  for select to authenticated using ((select app.is_admin()));
create policy admin_insert on public.students  for insert to authenticated with check ((select app.is_admin()));
create policy admin_update on public.students  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy admin_read   on public.viewer_links         for select to authenticated using ((select app.is_admin()));
create policy admin_read   on public.viewer_link_students for select to authenticated using ((select app.is_admin()));
create policy admin_read   on public.homework  for select to authenticated using ((select app.is_admin()));
create policy admin_insert on public.homework  for insert to authenticated with check ((select app.is_admin()) and source in ('manual', 'idukay_paste'));
create policy admin_update on public.homework  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy admin_read   on public.homework_revisions for select to authenticated using ((select app.is_admin()));
create policy admin_read   on public.sync_runs          for select to authenticated using ((select app.is_admin()));
create policy admin_read   on public.audit_logs         for select to authenticated using ((select app.is_admin()));
-- admins: no policy → nobody reads or writes it through the API.

-- ---------------------------------------------------------------------------
-- Homework integrity
-- ---------------------------------------------------------------------------
create function app.homework_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  new.subject := btrim(new.subject);
  new.title   := btrim(new.title);
  if tg_op = 'UPDATE' then
    if new.class_id <> old.class_id or new.source <> old.source or new.external_id is distinct from old.external_id
       or new.created_at <> old.created_at then
      raise exception 'class, source and origin of homework cannot change' using errcode = '42501';
    end if;
    -- Content changed → keep the previous version and bump the revision.
    if (new.subject, new.title, new.instructions, new.parent_explanation, new.language, new.start_date, new.due_date,
        new.teacher, new.notes, new.attachments)
       is distinct from
       (old.subject, old.title, old.instructions, old.parent_explanation, old.language, old.start_date, old.due_date,
        old.teacher, old.notes, old.attachments) then
      insert into public.homework_revisions (homework_id, revision, data, changed_by)
      values (old.id, old.revision, to_jsonb(old) - 'withdrawn_at' - 'withdrawn_reason', auth.uid());
      new.revision := old.revision + 1;
    end if;
    new.updated_at := now();
  else
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  select id into sid from public.subjects where class_id = new.class_id and lower(btrim(name)) = lower(new.subject);
  if sid is null then
    insert into public.subjects (class_id, name, language, sort_order)
    values (new.class_id, new.subject, new.language, 100) returning id into sid;
  end if;
  new.subject_id := sid;
  return new;
end $$;

create trigger homework_before_write before insert or update on public.homework
  for each row execute function app.homework_before_write();

create function app.homework_touch_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.classes set data_updated_at = now() where id = new.class_id;
  return null;
end $$;

create trigger homework_touch_class after insert or update on public.homework
  for each row execute function app.homework_touch_class();

revoke all on all functions in schema app from public;
grant execute on function app.is_admin() to authenticated;
