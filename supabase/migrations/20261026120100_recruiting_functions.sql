-- Recruiting module — server functions (RPC).

-- ---------------------------------------------------------------------------
-- Defaults: settings, the usual sources and bilingual message templates.
-- Safe to run again: it only adds what is missing and never overwrites edits.
-- ---------------------------------------------------------------------------
create function public.seed_recruitment_defaults(org uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.license_ok(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.recruitment_settings (organization_id) values (org) on conflict do nothing;

  insert into public.recruitment_sources (organization_id, name, kind, url, cost_note, verified) values
    (org, 'Facebook (page / job post)',       'social',        null, 'Organic posts: free. Paid boosts: set your own budget.', false),
    (org, 'Facebook community groups',        'social',        null, 'Free. Follow each group''s rules; ask the admin before posting.', false),
    (org, 'Instagram',                        'social',        null, 'Organic: free.', false),
    (org, 'TikTok',                           'social',        null, 'Organic: free.', false),
    (org, 'Indeed',                           'job_board',     'https://www.indeed.com/hire', 'Free and sponsored posts; confirm current pricing with Indeed.', false),
    (org, 'LinkedIn',                         'job_board',     'https://www.linkedin.com/talent/post-a-job', 'Confirm current pricing with LinkedIn.', false),
    (org, 'Kentucky Career Center – Focus Talent', 'career_center', 'https://apps.kcc.ky.gov/employer/focustalent.aspx', 'Free job posting for employers (state job bank).', true),
    (org, 'Kentucky Career Center – Florence', 'career_center', null, '8020 Veterans Memorial Dr, Florence, KY 41042 · (859) 372-8400 (confirm).', false),
    (org, 'Employee referral',                'referral',      null, 'Only under the referral program your employer has approved.', false),
    (org, 'Walk-in / on site',                'walk_in',       null, null, false),
    (org, 'WhatsApp (opt-in)',                'messaging',     null, 'Only people who gave consent.', false),
    (org, 'Job fair',                         'job_fair',      null, null, false),
    (org, 'Community organization',           'community_org', null, null, false),
    (org, 'School / training program',        'school',        null, null, false),
    (org, 'Flyer / QR code',                  'other',         null, null, false),
    (org, 'Other',                            'other',         null, null, false)
  on conflict (organization_id, name) do nothing;

  -- Placeholders: {first_name} {my_name} {my_phone} {company} {position} {shift} {date} {time} {place} {apply_link}
  insert into public.message_templates (organization_id, code, lang, channel, title, body, sort_order) values
    (org, 'ack_registration', 'en', 'sms', 'Registration received',
     'Hi {first_name}, this is {my_name} with {company}. We received your registration for warehouse jobs. We''ll contact you when there is an opening that matches your availability. Registering does not guarantee a job. Reply STOP to stop messages.', 1),
    (org, 'ack_registration', 'es', 'sms', 'Registro recibido',
     'Hola {first_name}, soy {my_name} de {company}. Recibimos tu registro para trabajos de almacén. Te contactaremos cuando haya una vacante que coincida con tu disponibilidad. Registrarte no garantiza empleo. Responde STOP para no recibir más mensajes.', 1),
    (org, 'first_contact', 'en', 'any', 'First contact',
     'Hi {first_name}, this is {my_name} with {company}. Thanks for your interest in warehouse work ({position}). Is this a good time to talk for 5 minutes about your availability? You can also call me at {my_phone}.', 2),
    (org, 'first_contact', 'es', 'any', 'Primer contacto',
     'Hola {first_name}, soy {my_name} de {company}. Gracias por tu interés en trabajo de almacén ({position}). ¿Tienes 5 minutos para hablar sobre tu disponibilidad? También puedes llamarme al {my_phone}.', 2),
    (org, 'no_answer', 'en', 'sms', 'Follow-up (no answer)',
     'Hi {first_name}, {my_name} from {company} again. I tried to reach you about warehouse openings. If you are still interested, reply with the best time to call. If not, just reply NO and I won''t contact you again.', 3),
    (org, 'no_answer', 'es', 'sms', 'Seguimiento (sin respuesta)',
     'Hola {first_name}, {my_name} de {company} otra vez. Intenté comunicarme contigo sobre vacantes de almacén. Si sigues interesado/a, respóndeme con la mejor hora para llamarte. Si no, responde NO y no te volveré a contactar.', 3),
    (org, 'apply_cta', 'en', 'any', 'Complete the official application',
     'Next step, {first_name}: please complete the official application here: {apply_link}. Let me know when you finish so I can help with the next step. Questions? {my_phone}', 4),
    (org, 'apply_cta', 'es', 'any', 'Completar la solicitud oficial',
     'Siguiente paso, {first_name}: completa la solicitud oficial aquí: {apply_link}. Avísame cuando termines para ayudarte con el siguiente paso. ¿Preguntas? {my_phone}', 4),
    (org, 'interview_reminder', 'en', 'sms', 'Interview reminder',
     'Reminder, {first_name}: your appointment with {company} is on {date} at {time}, {place}. Please reply YES to confirm or call {my_phone} if you need to change it.', 5),
    (org, 'interview_reminder', 'es', 'sms', 'Recordatorio de entrevista',
     'Recordatorio, {first_name}: tu cita con {company} es el {date} a las {time}, en {place}. Responde SÍ para confirmar o llama al {my_phone} si necesitas cambiarla.', 5),
    (org, 'confirm_availability', 'en', 'sms', 'Confirm availability',
     'Hi {first_name}, {my_name} from {company}. Are you still available for {shift}? Please reply YES or NO so I can keep your information up to date.', 6),
    (org, 'confirm_availability', 'es', 'sms', 'Confirmar disponibilidad',
     'Hola {first_name}, {my_name} de {company}. ¿Sigues disponible para {shift}? Responde SÍ o NO para mantener tu información al día.', 6),
    (org, 'first_day', 'en', 'sms', 'First-day reminder',
     'Hi {first_name}! Reminder: your first day is {date} at {time}, {place}. Please bring what your onboarding instructions list. Reply YES to confirm. Any problem getting there? Call {my_phone} before your shift.', 7),
    (org, 'first_day', 'es', 'sms', 'Recordatorio del primer día',
     '¡Hola {first_name}! Recordatorio: tu primer día es el {date} a las {time}, en {place}. Trae lo que indican tus instrucciones de incorporación. Responde SÍ para confirmar. ¿Algún problema para llegar? Llama al {my_phone} antes de tu turno.', 7),
    (org, 'checkin_7', 'en', 'any', 'Day-7 check-in',
     'Hi {first_name}, it''s {my_name}. How is your first week going? Anything I can help with (schedule, training, questions)? I''m here: {my_phone}.', 8),
    (org, 'checkin_7', 'es', 'any', 'Seguimiento día 7',
     'Hola {first_name}, soy {my_name}. ¿Cómo va tu primera semana? ¿Hay algo en lo que pueda ayudarte (horario, entrenamiento, dudas)? Aquí estoy: {my_phone}.', 8),
    (org, 'recontact', 'en', 'sms', 'Recontact',
     'Hi {first_name}, {my_name} from {company}. You asked us to check back with you. There are warehouse openings right now. Are you interested? Reply YES or NO.', 9),
    (org, 'recontact', 'es', 'sms', 'Recontacto',
     'Hola {first_name}, {my_name} de {company}. Nos pediste que te volviéramos a contactar. Hay vacantes de almacén en este momento. ¿Te interesa? Responde SÍ o NO.', 9),
    (org, 'kept_on_file', 'en', 'any', 'Kept on file',
     'Hi {first_name}, thank you for your time. The current opening has been filled, but we kept your information (with your permission) and will reach out when something matches your availability.', 10),
    (org, 'kept_on_file', 'es', 'any', 'Información guardada',
     'Hola {first_name}, gracias por tu tiempo. La vacante actual ya se cubrió, pero guardamos tu información (con tu permiso) y te contactaremos cuando haya algo que coincida con tu disponibilidad.', 10),
    (org, 'reply_interested', 'en', 'facebook', 'Reply to a comment / message',
     'Thanks for your interest! To be considered, please register here (2 minutes): {apply_link}. Registering does not guarantee a job; we contact people when an opening matches their availability.', 11),
    (org, 'reply_interested', 'es', 'facebook', 'Respuesta a un comentario / mensaje',
     '¡Gracias por tu interés! Para ser considerado/a, regístrate aquí (2 minutos): {apply_link}. Registrarte no garantiza empleo; contactamos a las personas cuando una vacante coincide con su disponibilidad.', 11),
    (org, 'facebook_post', 'en', 'facebook', 'Facebook post (short)',
     'Warehouse jobs in Florence, KY — {position}. Now taking registrations for authorized openings. Pay, shifts and start dates: shared by the recruiter once confirmed for each opening. Register in 2 minutes: {apply_link}. Registering does not guarantee a job.', 12),
    (org, 'facebook_post', 'es', 'facebook', 'Publicación de Facebook (corta)',
     'Trabajos de almacén en Florence, KY — {position}. Recibiendo registros para vacantes autorizadas. Pago, turnos y fechas de inicio: el reclutador los comparte una vez confirmados para cada vacante. Regístrate en 2 minutos: {apply_link}. Registrarte no garantiza empleo.', 12),
    (org, 'video_script', 'en', 'video_script', 'TikTok / Reels script (30 s)',
     '[0–3 s] Hook, on camera: "Looking for warehouse work in Florence, Kentucky?"\n[3–12 s] What the work is: "{position}: picking and packing orders, sorting, keeping the line moving. Training is provided by the employer for each role." (Only say what is confirmed.)\n[12–22 s] How it works: "Register in 2 minutes with the link in bio. I personally call everyone back and tell you the confirmed pay, shift and start date for each opening."\n[22–30 s] CTA + disclaimer on screen: "Link in bio · Hablamos español · Registering does not guarantee a job."', 13),
    (org, 'video_script', 'es', 'video_script', 'Guion TikTok / Reels (30 s)',
     '[0–3 s] Gancho, a cámara: "¿Buscas trabajo de almacén en Florence, Kentucky?"\n[3–12 s] Qué es el trabajo: "{position}: preparar y empacar pedidos, clasificar, mantener la línea en movimiento. El empleador da el entrenamiento de cada puesto." (Di solo lo confirmado.)\n[12–22 s] Cómo funciona: "Regístrate en 2 minutos con el enlace del perfil. Yo llamo personalmente a cada persona y le digo el pago, turno y fecha de inicio confirmados de cada vacante."\n[22–30 s] Llamado a la acción + aviso en pantalla: "Enlace en el perfil · We speak English · Registrarte no garantiza empleo."', 13)
  on conflict (organization_id, code, lang) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Public pre-registration form (QR code / link). Callable without signing in.
-- ---------------------------------------------------------------------------
create function public.intake_form_public(tok text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'title', f.title,
           'public_name', coalesce(s.public_name, 'Staffing team'),
           'privacy_contact', s.privacy_contact)
    from public.intake_forms f
    left join public.recruitment_settings s on s.organization_id = f.organization_id
   where f.token = tok and f.is_active and app.license_active(f.organization_id);
$$;

create function public.submit_intake(tok text, d jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  f      public.intake_forms;
  cid    uuid;
  digits text := regexp_replace(coalesce(d ->> 'phone', ''), '\D', '', 'g');
  mail   text := nullif(lower(btrim(coalesce(d ->> 'email', ''))), '');
  avail  date;
  arr    text[];
  pick   jsonb := '{}'::jsonb;
  k      text;
  allowed jsonb := jsonb_build_object(
    'experience', '["picking","packing","order_fulfillment","sorting","material_handling","receiving","shipping","inventory","rf_scanner","quality_check","none"]'::jsonb,
    'equipment', '["rf_scanner","pallet_jack","electric_pallet_jack","forklift","reach_truck","order_picker","label_printer","conveyor"]'::jsonb,
    'shifts_available', '["first","second","third","weekend","flexible"]'::jsonb,
    'positions_wanted', '["picking","packing","order_fulfillment","sorting","material_handling","receiving","shipping","inventory","other"]'::jsonb);
begin
  select * into f from public.intake_forms where token = tok and is_active;
  if not found or not app.license_active(f.organization_id) then
    raise exception 'intake_form_closed' using errcode = 'P0002';
  end if;

  -- Bots fill the hidden field; they get a normal-looking answer and nothing is stored.
  if coalesce(d ->> 'website', '') <> '' then
    return upper(substr(md5(random()::text), 1, 8));
  end if;

  if (select count(*) from public.candidates c
       where c.intake_form_id = f.id and c.registered_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.candidates c
       where c.organization_id = f.organization_id and c.intake_form_id is not null
         and c.registered_at > now() - interval '1 hour') >= 300 then
    raise exception 'intake_busy' using errcode = 'P0001';
  end if;

  if char_length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;
  if btrim(coalesce(d ->> 'first_name', '')) = '' or btrim(coalesce(d ->> 'last_name', '')) = '' then
    raise exception 'intake_missing_name' using errcode = 'P0001';
  end if;
  if digits = '' and mail is null then
    raise exception 'intake_missing_contact' using errcode = 'P0001';
  end if;
  if digits <> '' and digits !~ '^[0-9]{10}$' then
    raise exception 'intake_bad_phone' using errcode = 'P0001';
  end if;
  if coalesce((d ->> 'consent_contact')::boolean, false) is not true then
    raise exception 'intake_consent_required' using errcode = 'P0001';
  end if;

  -- The same person sending the form twice in a day gets the same reference back.
  select c.id into cid from public.candidates c
   where c.intake_form_id = f.id and c.registered_at > now() - interval '24 hours'
     and ((digits <> '' and c.phone = digits) or (mail is not null and c.email = mail))
   limit 1;
  if cid is not null then
    return upper(substr(cid::text, 1, 8));
  end if;

  -- Multiple-choice answers: keep only known values.
  foreach k in array array['experience', 'equipment', 'shifts_available', 'positions_wanted'] loop
    select coalesce(array_agg(distinct v), '{}') into arr
      from jsonb_array_elements_text(case when jsonb_typeof(d -> k) = 'array' then d -> k else '[]'::jsonb end) v
     where allowed -> k ? v;
    pick := pick || jsonb_build_object(k, to_jsonb(arr));
  end loop;

  begin
    avail := nullif(d ->> 'available_from', '')::date;
  exception when others then
    avail := null;
  end;
  if avail is not null and (avail < current_date - 1 or avail > current_date + 365) then avail := null; end if;

  insert into public.candidates (
    organization_id, warehouse_id, first_name, last_name, phone, email, city, zip, preferred_language,
    source_id, intake_form_id, experience, experience_note, equipment, shifts_available, available_from,
    positions_wanted, consent_contact, consent_sms, consent_whatsapp, consent_email, consent_at, consent_method)
  values (
    f.organization_id, f.warehouse_id,
    left(btrim(d ->> 'first_name'), 80), left(btrim(d ->> 'last_name'), 80),
    nullif(digits, ''), mail,
    nullif(left(btrim(coalesce(d ->> 'city', '')), 80), ''),
    case when coalesce(d ->> 'zip', '') ~ '^[0-9]{5}$' then d ->> 'zip' end,
    case when d ->> 'preferred_language' in ('en', 'es', 'other') then d ->> 'preferred_language' else 'en' end,
    f.source_id, f.id,
    array(select jsonb_array_elements_text(pick -> 'experience')),
    nullif(left(btrim(coalesce(d ->> 'experience_note', '')), 300), ''),
    array(select jsonb_array_elements_text(pick -> 'equipment')),
    array(select jsonb_array_elements_text(pick -> 'shifts_available')),
    avail,
    array(select jsonb_array_elements_text(pick -> 'positions_wanted')),
    true,
    coalesce((d ->> 'consent_sms')::boolean, false) and digits <> '',
    coalesce((d ->> 'consent_whatsapp')::boolean, false) and digits <> '',
    coalesce((d ->> 'consent_email')::boolean, false) and mail is not null,
    now(), 'web_form')
  returning id into cid;

  update public.intake_forms set submissions = submissions + 1, last_submission_at = now() where id = f.id;
  return upper(substr(cid::text, 1, 8));
end $$;

-- ---------------------------------------------------------------------------
-- Hiring: a candidate becomes an employee, so the first day and retention
-- are measured from real attendance, not from memory.
-- ---------------------------------------------------------------------------
create function public.hire_candidate(cand uuid, badge text, shift uuid, start_on date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c   public.candidates;
  emp uuid;
begin
  select * into c from public.candidates where id = cand;
  if not found or not (app.license_ok(c.organization_id) and app.has_role(c.organization_id, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if c.employee_id is not null then
    raise exception 'candidate_already_hired' using errcode = 'P0001';
  end if;
  if btrim(coalesce(badge, '')) = '' then
    raise exception 'badge_required' using errcode = 'P0001';
  end if;

  select e.id into emp from public.employees e
   where e.organization_id = c.organization_id and e.employee_code = btrim(badge);
  if emp is not null then
    if exists (select 1 from public.candidates x where x.employee_id = emp) then
      raise exception 'badge_linked_to_another_candidate' using errcode = 'P0001';
    end if;
    if (select e.warehouse_id from public.employees e where e.id = emp) <> c.warehouse_id then
      raise exception 'badge_in_other_warehouse' using errcode = 'P0001';
    end if;
    update public.employees set status = 'active', shift_id = coalesce(shift, shift_id), hire_date = coalesce(start_on, hire_date)
     where id = emp;
  else
    insert into public.employees (organization_id, warehouse_id, employee_code, first_name, last_name, shift_id, hire_date)
    values (c.organization_id, c.warehouse_id, btrim(badge), c.first_name, c.last_name, shift, start_on)
    returning id into emp;
  end if;

  update public.candidates
     set employee_id = emp,
         first_day = coalesce(start_on, first_day),
         stage = case when stage in ('first_day_confirmed', 'started', 'retention') then stage else 'assigned' end
   where id = cand;
  return emp;
end $$;

-- Hire outcomes for the dashboard: first day and last day worked, from attendance.
create function public.recruitment_outcomes(org uuid)
returns table (candidate_id uuid, employee_status public.employee_status,
               first_attendance_date date, last_worked_date date)
language sql stable security invoker set search_path = '' as $$
  select c.id, e.status, e.first_attendance_date,
         (select max(a.work_date) from public.attendance_records a
           where a.employee_id = e.id and a.status in ('present', 'late'))
    from public.candidates c
    join public.employees e on e.id = c.employee_id
   where c.organization_id = org;
$$;

-- Every export of candidate data leaves a trace (who, what, how many rows).
create function public.record_export(org uuid, what text, row_count int)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.license_readable(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (organization_id, actor_id, action, table_name, new_data)
  values (org, auth.uid(), 'export', left(coalesce(what, 'export'), 60), jsonb_build_object('rows', row_count));
end $$;

-- ---------------------------------------------------------------------------
-- Sample data: clearly labelled demonstration rows ("SAMPLE" in every name,
-- fictional 555-01xx phone numbers, example.com emails), removable in one click.
-- ---------------------------------------------------------------------------
create function public.load_recruitment_samples(org uuid, wh uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  today date := app.org_today(org);
  op    uuid;
  src   uuid[];
  firsts text[] := array['Sample Ana','Sample Ben','Sample Carla','Sample Dev','Sample Elena','Sample Femi','Sample Gabe',
                         'Sample Hana','Sample Ivan','Sample Jade','Sample Kofi','Sample Luz','Sample Mo','Sample Nia',
                         'Sample Omar','Sample Paz','Sample Quinn','Sample Rosa','Sample Sam','Sample Tere','Sample Uri',
                         'Sample Vera','Sample Wes','Sample Xio'];
  stages public.candidate_stage[] := array['new','new','new','pending_contact','pending_contact','contacted','contacted',
                         'interested','interested','prescreened','prescreened','application','documents_pending',
                         'checks_pending','approved','available','assigned','first_day_confirmed','started','started',
                         'retention','closed','closed','closed']::public.candidate_stage[];
  shifts_opts text[] := array['first','second','third','weekend'];
  pos_opts    text[] := array['picking','packing','sorting','material_handling','order_fulfillment'];
  i int;
  cid uuid;
  reg timestamptz;
begin
  if not (app.license_ok(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = wh and w.organization_id = org) then
    raise exception 'warehouse_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.candidates c where c.organization_id = org and c.is_sample) then
    raise exception 'samples_already_loaded' using errcode = 'P0001';
  end if;
  perform public.seed_recruitment_defaults(org);
  perform set_config('app.loading_samples', 'on', true);

  select array_agg(s.id order by s.name) into src from public.recruitment_sources s
   where s.organization_id = org and s.name in ('Facebook (page / job post)', 'Indeed', 'Employee referral',
                                                'Kentucky Career Center – Florence', 'Job fair', 'Flyer / QR code');

  insert into public.job_openings (organization_id, warehouse_id, title, position, headcount, status,
                                   authorized_by, authorized_on, opened_on, target_date, is_sample)
  values (org, wh, 'SAMPLE – Picker / Packer', 'picking', 8, 'authorized', 'SAMPLE DATA', today - 14, today - 14, today + 7, true)
  returning id into op;

  for i in 1 .. array_length(firsts, 1) loop
    reg := (today - ((i * 37) % 28))::timestamptz + interval '10 hours';
    insert into public.candidates (organization_id, warehouse_id, first_name, last_name, phone, email, city, zip,
      preferred_language, source_id, registered_at, experience, equipment, shifts_available, available_from,
      positions_wanted, stage, closed_reason, opening_id, first_day, last_contact_at, consent_contact, consent_sms,
      consent_at, consent_method, agency_check, is_sample, next_action, next_action_due)
    values (org, wh, firsts[i], 'Candidate', '85955501' || lpad(i::text, 2, '0'), 'sample' || i || '@example.com',
      (array['Florence','Erlanger','Burlington','Covington','Independence','Hebron'])[1 + i % 6],
      (array['41042','41018','41005','41011','41051','41048'])[1 + i % 6],
      case when i % 3 = 0 then 'es' else 'en' end,
      src[1 + i % greatest(array_length(src, 1), 1)], reg,
      case when i % 4 = 0 then '{none}'::text[] else array[pos_opts[1 + i % 5], 'rf_scanner'] end,
      case when i % 5 = 0 then '{pallet_jack}'::text[] else '{}'::text[] end,
      array[shifts_opts[1 + i % 4]], today + (i % 10),
      array[pos_opts[1 + (i + 1) % 5]],
      stages[i],
      case when stages[i] = 'closed' then (array['not_interested','recontact_later','not_available'])[1 + i % 3] end,
      case when stages[i] >= 'prescreened' and stages[i] <> 'closed' then op end,
      case when stages[i] in ('assigned','first_day_confirmed') then today + 2
           when stages[i] in ('started','retention') then today - (i % 20) end,
      case when stages[i] > 'pending_contact' then reg + interval '1 day' end,
      true, i % 2 = 0, reg, 'web_form', 'none', true,
      case when stages[i] < 'started' then 'Sample next step' end,
      case when stages[i] < 'started' then today + (i % 5) - 2 end)
    returning id into cid;

    if stages[i] > 'pending_contact' then
      insert into public.candidate_events (organization_id, candidate_id, kind, outcome, body, created_at)
      values (org, cid, 'call', 'reached', 'SAMPLE: first call', reg + interval '1 day');
    end if;
  end loop;
  return array_length(firsts, 1);
end $$;

create function public.remove_recruitment_samples(org uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not (app.license_ok(org) and app.has_role(org, '{owner,admin}')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.candidates where organization_id = org and is_sample;
  get diagnostics n = row_count;
  delete from public.job_openings where organization_id = org and is_sample;
  return n;
end $$;

revoke execute on function
  public.seed_recruitment_defaults(uuid), public.intake_form_public(text), public.submit_intake(text, jsonb),
  public.hire_candidate(uuid, text, uuid, date), public.recruitment_outcomes(uuid), public.record_export(uuid, text, int),
  public.load_recruitment_samples(uuid, uuid), public.remove_recruitment_samples(uuid)
from public, anon;
grant execute on function
  public.seed_recruitment_defaults(uuid), public.hire_candidate(uuid, text, uuid, date), public.recruitment_outcomes(uuid),
  public.record_export(uuid, text, int), public.load_recruitment_samples(uuid, uuid), public.remove_recruitment_samples(uuid),
  public.intake_form_public(text), public.submit_intake(text, jsonb)
to authenticated;
-- The public form is the only part of the module reachable without signing in.
grant execute on function public.intake_form_public(text), public.submit_intake(text, jsonb) to anon;
