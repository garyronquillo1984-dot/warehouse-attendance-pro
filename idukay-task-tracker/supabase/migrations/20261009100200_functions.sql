-- Functions.
--   viewer_*  : the VIEWER role — read-only, scoped to the students of one link (callable without an account)
--   admin_*   : the ADMIN role — checked inside every function
--   svc_*     : the automatic synchronization (service role only)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- The live link for a token, or null (unknown or revoked). Short or huge input is rejected early.
create function app.link_for(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.id from public.viewer_links l
  where p_token is not null and char_length(p_token) between 20 and 200
    and l.token_hash = app.token_hash(p_token) and l.revoked_at is null;
$$;

-- The class of a student, only if that student belongs to the link.
create function app.class_for(p_token text, p_student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.class_id
  from public.viewer_link_students ls
  join public.students s on s.id = ls.student_id and s.is_active
  join public.classes c on c.id = s.class_id and c.is_active
  where ls.link_id = app.link_for(p_token) and ls.student_id = p_student;
$$;

create function app.class_today(p_class uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone timezone)::date from public.classes where id = p_class;
$$;

-- What a parent sees of one homework. Lifecycle: upcoming → active → archived (computed from the
-- dates, so archiving is automatic and never touches the record). "NEW" = added in the last 24 h.
create function app.homework_view(h public.homework, today date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', h.id, 'subject', h.subject, 'emoji', s.emoji, 'title', h.title,
    'instructions', h.instructions, 'parent_explanation', h.parent_explanation, 'language', h.language,
    'start_date', h.start_date, 'due_date', h.due_date, 'teacher', h.teacher, 'notes', h.notes,
    'attachments', h.attachments, 'source', h.source,
    'status', case when h.due_date < today then 'archived' when h.start_date > today then 'upcoming' else 'active' end,
    'is_new', h.created_at > now() - interval '24 hours',
    'revised', h.revision > 1, 'updated_at', h.updated_at, 'created_at', h.created_at)
  from (select 1) x left join public.subjects s on s.id = h.subject_id;
$$;

-- ---------------------------------------------------------------------------
-- VIEWER (read-only)
-- ---------------------------------------------------------------------------
-- Opens a link: the students it covers (first name and class only) and the freshness of the data.
create function public.viewer_open(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lid uuid := app.link_for(p_token); r jsonb;
begin
  if lid is null then return null; end if;
  update public.viewer_links set last_used_at = now()
    where id = lid and (last_used_at is null or last_used_at < now() - interval '1 hour');
  select jsonb_build_object(
    'link', jsonb_build_object('label', l.label),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'first_name', s.first_name, 'class_id', c.id,
        'grade_label', c.grade_label, 'grade_short', c.grade_short, 'parallel', c.parallel, 'school_name', c.school_name,
        'timezone', c.timezone, 'today', (now() at time zone c.timezone)::date,
        'last_updated_at', greatest(c.last_sync_at, c.data_updated_at), 'last_sync_at', c.last_sync_at)
        order by s.first_name)
      from public.viewer_link_students ls
      join public.students s on s.id = ls.student_id and s.is_active
      join public.classes c on c.id = s.class_id and c.is_active
      where ls.link_id = lid), '[]'::jsonb),
    'server_now', now())
  into r from public.viewer_links l where l.id = lid;
  return r;
end $$;

-- Homework of one student between two dates. A parent can look back 14 days and ahead 14 days
-- ("upcoming"); older homework is in the archive.
create function public.viewer_homework(p_token text, p_student uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.class_for(p_token, p_student); today date; f date; t date;
begin
  if cid is null then return null; end if;
  today := app.class_today(cid);
  f := greatest(coalesce(p_from, today), today - 14);
  t := least(coalesce(p_to, today), today + 14);
  return coalesce((
    select jsonb_agg(app.homework_view(h, today) order by h.due_date, h.subject, h.created_at)
    from public.homework h
    where h.class_id = cid and h.withdrawn_at is null and h.start_date <= t and h.due_date >= f), '[]'::jsonb);
end $$;

-- Months that have archived homework (for the archive navigation).
create function public.viewer_archive_months(p_token text, p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.class_for(p_token, p_student); today date;
begin
  if cid is null then return null; end if;
  today := app.class_today(cid);
  return coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'count', n) order by m desc)
    from (select date_trunc('month', h.due_date)::date as m, count(*) as n
          from public.homework h
          where h.class_id = cid and h.withdrawn_at is null and h.due_date < today
          group by 1) x), '[]'::jsonb);
end $$;

-- Archived homework of one month, optionally filtered by subject and text.
create function public.viewer_archive(p_token text, p_student uuid, p_month date, p_subject text default null, p_query text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := app.class_for(p_token, p_student); today date; m date := date_trunc('month', p_month)::date;
        q text := nullif(btrim(left(p_query, 100)), '');
begin
  if cid is null or p_month is null then return null; end if;
  today := app.class_today(cid);
  return coalesce((
    select jsonb_agg(app.homework_view(h, today) order by h.due_date desc, h.subject)
    from public.homework h
    where h.class_id = cid and h.withdrawn_at is null and h.due_date < today
      and h.due_date >= m and h.due_date < (m + interval '1 month')::date
      and (p_subject is null or lower(h.subject) = lower(p_subject))
      and (q is null or strpos(lower(h.subject || ' ' || h.title || ' ' || coalesce(h.instructions, '') || ' ' || coalesce(h.parent_explanation, '')), lower(q)) > 0)
    limit 500), '[]'::jsonb);
end $$;

-- One homework (any date, including the archive) — only if it is in the student's class.
create function public.viewer_homework_detail(p_token text, p_student uuid, p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.homework_view(h, app.class_today(h.class_id))
  from public.homework h
  where h.id = p_id and h.withdrawn_at is null and h.class_id = app.class_for(p_token, p_student);
$$;

-- ---------------------------------------------------------------------------
-- ADMIN
-- ---------------------------------------------------------------------------
create function app.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
end $$;

-- Creates a private link for one or more students. The token is returned ONCE; only its hash is kept.
create function public.admin_create_link(p_label text, p_students uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tok text; lid uuid;
begin
  perform app.require_admin();
  if coalesce(array_length(p_students, 1), 0) = 0 then raise exception 'choose at least one student' using errcode = '22023'; end if;
  tok := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  insert into public.viewer_links (label, token_hash, created_by) values (btrim(p_label), app.token_hash(tok), auth.uid()) returning id into lid;
  insert into public.viewer_link_students (link_id, student_id) select lid, s.id from public.students s where s.id = any (p_students);
  insert into public.audit_logs (user_id, action, detail) values (auth.uid(), 'link_created', jsonb_build_object('link', lid, 'students', p_students));
  return jsonb_build_object('id', lid, 'token', tok);
end $$;

create function public.admin_revoke_link(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.viewer_links set revoked_at = coalesce(revoked_at, now()) where id = p_id;
  insert into public.audit_logs (user_id, action, detail) values (auth.uid(), 'link_revoked', jsonb_build_object('link', p_id));
end $$;

-- Hides homework from parents (e.g. a duplicate entered by mistake) without deleting it.
create function public.admin_withdraw_homework(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.homework set withdrawn_at = now(), withdrawn_reason = left(p_reason, 300) where id = p_id and withdrawn_at is null;
  insert into public.audit_logs (user_id, action, detail) values (auth.uid(), 'homework_withdrawn', jsonb_build_object('homework', p_id, 'reason', p_reason));
end $$;

create function public.admin_restore_homework(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.homework set withdrawn_at = null, withdrawn_reason = null where id = p_id;
  insert into public.audit_logs (user_id, action, detail) values (auth.uid(), 'homework_restored', jsonb_build_object('homework', p_id));
end $$;

-- Saves reviewed rows (paste from Idukay or several typed at once). Duplicates are skipped.
create function public.admin_import_homework(p_class uuid, p_rows jsonb, p_source public.hw_source default 'idukay_paste') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; added integer := 0; dup integer := 0; n integer;
begin
  perform app.require_admin();
  if p_source = 'idukay_api' then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select value from jsonb_array_elements(p_rows) limit 300 loop
    insert into public.homework (class_id, subject, title, instructions, parent_explanation, language, start_date, due_date, teacher, notes, attachments, source)
    values (p_class, r ->> 'subject', r ->> 'title', nullif(r ->> 'instructions', ''), nullif(r ->> 'parent_explanation', ''),
            (r ->> 'language')::public.hw_language, (r ->> 'start_date')::date, (r ->> 'due_date')::date,
            nullif(r ->> 'teacher', ''), nullif(r ->> 'notes', ''), coalesce(r -> 'attachments', '[]'::jsonb), p_source)
    on conflict do nothing;
    get diagnostics n = row_count;
    if n = 1 then added := added + 1; else dup := dup + 1; end if;
  end loop;
  insert into public.sync_runs (class_id, source, finished_at, status, added, unchanged, message)
  values (p_class, p_source::text, now(), 'ok', added, dup, 'entered by administrator');
  return jsonb_build_object('added', added, 'duplicates', dup);
end $$;

-- Overview for the admin console.
create function public.admin_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'class_id', c.id, 'grade_label', c.grade_label, 'grade_short', c.grade_short, 'parallel', c.parallel,
      'school_name', c.school_name, 'school_year', c.school_year, 'timezone', c.timezone,
      'today', (now() at time zone c.timezone)::date,
      'last_sync_at', c.last_sync_at, 'data_updated_at', c.data_updated_at,
      'students', (select count(*) from public.students s where s.class_id = c.id and s.is_active),
      'active_links', (select count(distinct l.id) from public.viewer_links l join public.viewer_link_students ls on ls.link_id = l.id
                       join public.students s on s.id = ls.student_id where s.class_id = c.id and l.revoked_at is null),
      'homework_total', (select count(*) from public.homework h where h.class_id = c.id and h.withdrawn_at is null),
      'homework_active', (select count(*) from public.homework h where h.class_id = c.id and h.withdrawn_at is null
                            and h.start_date <= (now() at time zone c.timezone)::date and h.due_date >= (now() at time zone c.timezone)::date),
      'last_run', (select to_jsonb(r) - 'class_id' from public.sync_runs r where r.class_id = c.id order by r.started_at desc limit 1))
      order by c.created_at, c.grade_label, c.parallel)
    from public.classes c), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Automatic synchronization (service role; called by the sync-homework Edge Function)
-- ---------------------------------------------------------------------------
-- Upserts by the source's own id: new → added, changed → updated (old version kept), same → unchanged.
create function public.svc_sync_apply(p_class uuid, p_source text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; cur public.homework; a integer := 0; u integer := 0; s integer := 0; lang public.hw_language;
begin
  for r in select value from jsonb_array_elements(p_items) limit 2000 loop
    lang := coalesce((r ->> 'language')::public.hw_language,
                     (select language from public.subjects where class_id = p_class and lower(name) = lower(r ->> 'subject')), 'es');
    select * into cur from public.homework where class_id = p_class and source = 'idukay_api' and external_id = r ->> 'external_id';
    if not found then
      insert into public.homework (class_id, subject, title, instructions, parent_explanation, language, start_date, due_date, teacher, attachments, source, external_id)
      values (p_class, r ->> 'subject', r ->> 'title', r ->> 'instructions', r ->> 'parent_explanation', lang,
              (r ->> 'start_date')::date, (r ->> 'due_date')::date, r ->> 'teacher', coalesce(r -> 'attachments', '[]'::jsonb), 'idukay_api', r ->> 'external_id');
      a := a + 1;
    elsif (cur.subject, cur.title, cur.instructions, cur.start_date, cur.due_date, cur.teacher, cur.attachments)
          is distinct from (r ->> 'subject', r ->> 'title', r ->> 'instructions', (r ->> 'start_date')::date, (r ->> 'due_date')::date,
                            r ->> 'teacher', coalesce(r -> 'attachments', '[]'::jsonb)) then
      update public.homework set subject = r ->> 'subject', title = r ->> 'title', instructions = r ->> 'instructions',
        start_date = (r ->> 'start_date')::date, due_date = (r ->> 'due_date')::date, teacher = r ->> 'teacher',
        attachments = coalesce(r -> 'attachments', '[]'::jsonb)
      where id = cur.id;
      u := u + 1;
    else
      s := s + 1;
    end if;
  end loop;
  update public.classes set last_sync_at = now() where id = p_class;
  insert into public.sync_runs (class_id, source, finished_at, status, added, updated, unchanged)
  values (p_class, p_source, now(), 'ok', a, u, s);
  return jsonb_build_object('added', a, 'updated', u, 'unchanged', s);
end $$;

create function public.svc_sync_record(p_class uuid, p_source text, p_status text, p_message text) returns void
language sql security definer set search_path = '' as $$
  insert into public.sync_runs (class_id, source, finished_at, status, message) values (p_class, p_source, now(), p_status, left(p_message, 500));
$$;

create function public.svc_sync_classes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'grade_label', grade_label, 'parallel', parallel, 'school_year', school_year)), '[]'::jsonb)
  from public.classes where is_active;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app from public;
grant execute on function public.viewer_open(text), public.viewer_homework(text, uuid, date, date),
  public.viewer_archive_months(text, uuid), public.viewer_archive(text, uuid, date, text, text),
  public.viewer_homework_detail(text, uuid, uuid) to anon, authenticated;
grant execute on function public.admin_create_link(text, uuid[]), public.admin_revoke_link(uuid),
  public.admin_withdraw_homework(uuid, text), public.admin_restore_homework(uuid),
  public.admin_import_homework(uuid, jsonb, public.hw_source), public.admin_status() to authenticated;
grant execute on function public.svc_sync_apply(uuid, text, jsonb), public.svc_sync_record(uuid, text, text, text),
  public.svc_sync_classes() to service_role;
grant execute on function app.is_admin() to authenticated;

-- Lets the app (and the sync function) ask "is the signed-in user an admin?".
create function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select app.is_admin(); $$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
