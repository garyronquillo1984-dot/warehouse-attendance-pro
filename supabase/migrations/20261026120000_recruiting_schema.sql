-- Recruiting module — schema, access rules and automations.
-- Same principles as the attendance tables: every row carries organization_id, composite
-- foreign keys keep rows inside one company/warehouse, RLS decides who sees what.
--
-- Privacy by design: the candidate record holds only what a first contact needs.
-- No SSN, bank data, ID numbers, date of birth, medical data, photos, or protected
-- characteristics (age, race, religion, national origin, disability, etc.) — there are
-- no columns for them, so they cannot be collected by accident.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.candidate_stage as enum (
  'new',                  -- 1  registered, nobody has looked yet
  'pending_contact',      -- 2  reviewed, first contact pending
  'contacted',            -- 3  reached
  'interested',           -- 4  confirms interest
  'prescreened',          -- 5  meets the opening's real requirements (pre-selected)
  'application',          -- 6  interview or formal application with the employer
  'documents_pending',    -- 7  onboarding paperwork pending
  'checks_pending',       -- 8  authorized checks pending (per employer policy)
  'approved',             -- 9  approved by the hiring process
  'available',            -- 10 approved and waiting for a placement
  'assigned',             -- 11 assigned to a shift
  'first_day_confirmed',  -- 12 first day confirmed by the candidate
  'started',              -- 13 worked the first day
  'retention',            -- 14 in retention follow-up
  'closed'                -- 15 not interested / not available / recontact later
);

-- ---------------------------------------------------------------------------
-- Settings, sources, openings
-- ---------------------------------------------------------------------------
create table public.recruitment_settings (
  organization_id      uuid primary key references public.organizations(id) on delete cascade,
  public_name          text not null default 'Staffing team' check (char_length(public_name) between 1 and 120),
  privacy_contact      text check (char_length(privacy_contact) <= 160),   -- shown on the public form
  stale_days           int not null default 3   check (stale_days between 1 and 60),
  low_pool_threshold   int not null default 3   check (low_pool_threshold between 0 and 500),
  retention_months     int not null default 12  check (retention_months between 1 and 84),
  goal_contacts_day    int not null default 20  check (goal_contacts_day between 0 and 1000),
  goal_prescreens_week int not null default 10  check (goal_prescreens_week between 0 and 1000),
  goal_interviews_week int not null default 5   check (goal_interviews_week between 0 and 1000),
  goal_show_rate       int not null default 85  check (goal_show_rate between 0 and 100),
  goal_retention_30    int not null default 70  check (goal_retention_30 between 0 and 100),
  stage_labels         jsonb not null default '{}'::jsonb,   -- {"prescreened": {"en": "...", "es": "..."}}
  hidden_stages        text[] not null default '{}',
  updated_at           timestamptz not null default now()
);

create table public.recruitment_sources (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  kind             text not null default 'other' check (kind in (
                     'social', 'job_board', 'referral', 'career_center', 'job_fair', 'community_org',
                     'school', 'walk_in', 'messaging', 'digital_ad', 'other')),
  url              text check (char_length(url) <= 300),
  contact_note     text check (char_length(contact_note) <= 300),
  cost_note        text check (char_length(cost_note) <= 200),
  monthly_cost     numeric(10, 2) check (monthly_cost >= 0),   -- only real, known spend
  verified         boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.job_openings (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  warehouse_id      uuid not null,
  shift_id          uuid,
  title             text not null check (char_length(title) between 1 and 120),
  position          text not null default 'other' check (position in (
                      'picking', 'packing', 'order_fulfillment', 'sorting', 'material_handling',
                      'receiving', 'shipping', 'inventory', 'other')),
  headcount         int not null default 1 check (headcount between 1 and 1000),
  status            text not null default 'draft' check (status in ('draft', 'authorized', 'on_hold', 'filled', 'closed')),
  authorized_by     text check (char_length(authorized_by) <= 120),   -- who approved it (name / role)
  authorized_on     date,
  pay_note          text check (char_length(pay_note) <= 200),         -- verified pay only
  schedule_note     text check (char_length(schedule_note) <= 200),
  requirements_note text check (char_length(requirements_note) <= 500), -- real job requirements only
  opened_on         date not null default current_date,
  target_date       date,
  filled_on         date,
  is_sample         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, warehouse_id),
  check (status <> 'authorized' or authorized_on is not null),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade,
  foreign key (shift_id, warehouse_id) references public.shifts(id, warehouse_id)
);
create index job_openings_org_idx on public.job_openings (organization_id, status);

-- ---------------------------------------------------------------------------
-- Activities (90-day calendar), intake forms
-- ---------------------------------------------------------------------------
create table public.recruitment_activities (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 160),
  kind               text not null default 'other' check (kind in (
                       'job_fair', 'community_visit', 'org_contact', 'school_meeting',
                       'digital_campaign', 'interview_day', 'event_follow_up', 'agency_meeting', 'other')),
  status             text not null default 'pending_confirmation' check (status in (
                       'idea', 'pending_confirmation', 'confirmed', 'done', 'cancelled')),
  starts_on          date not null,
  ends_on            date,
  start_time         time,
  location           text check (char_length(location) <= 200),
  owner_name         text check (char_length(owner_name) <= 120),
  partner            text check (char_length(partner) <= 160),
  est_cost           numeric(10, 2) check (est_cost >= 0),
  actual_cost        numeric(10, 2) check (actual_cost >= 0),
  target_candidates  int check (target_candidates between 0 and 10000),
  materials          text check (char_length(materials) <= 500),
  permits            text check (char_length(permits) <= 500),
  verification_url   text check (char_length(verification_url) <= 300),
  results_note       text check (char_length(results_note) <= 1000),
  source_id          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, organization_id),
  check (ends_on is null or ends_on >= starts_on),
  check (status <> 'confirmed' or verification_url is not null or partner is not null),  -- a confirmed event says who/where confirmed it
  foreign key (source_id, organization_id) references public.recruitment_sources(id, organization_id) on delete set null (source_id)
);
create index recruitment_activities_org_idx on public.recruitment_activities (organization_id, starts_on);

create table public.intake_forms (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  warehouse_id        uuid not null,
  source_id           uuid,
  activity_id         uuid,
  title               text not null check (char_length(title) between 1 and 120),
  token               text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  is_active           boolean not null default true,
  submissions         int not null default 0,
  last_submission_at  timestamptz,
  created_at          timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade,
  foreign key (source_id, organization_id) references public.recruitment_sources(id, organization_id) on delete set null (source_id),
  foreign key (activity_id, organization_id) references public.recruitment_activities(id, organization_id) on delete set null (activity_id)
);

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------
create table public.candidates (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  warehouse_id           uuid not null,          -- the site the person is recruited for
  first_name             text not null check (char_length(first_name) between 1 and 80),
  last_name              text not null check (char_length(last_name) between 1 and 80),
  phone                  text check (phone ~ '^[0-9]{10}$'),   -- US 10 digits, normalized by trigger
  email                  extensions.citext check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  city                   text check (char_length(city) <= 80),
  zip                    text check (zip ~ '^[0-9]{5}$'),
  preferred_language     text not null default 'en' check (preferred_language in ('en', 'es', 'other')),
  source_id              uuid,
  source_detail          text check (char_length(source_detail) <= 120),   -- e.g. "referred by badge 1042"
  intake_form_id         uuid,
  owner_id               uuid,                    -- internal person responsible
  registered_at          timestamptz not null default now(),
  experience             text[] not null default '{}' check (experience <@ '{picking,packing,order_fulfillment,sorting,material_handling,receiving,shipping,inventory,rf_scanner,quality_check,none}'),
  experience_note        text check (char_length(experience_note) <= 300),
  equipment              text[] not null default '{}' check (equipment <@ '{rf_scanner,pallet_jack,electric_pallet_jack,forklift,reach_truck,order_picker,label_printer,conveyor}'),
  shifts_available       text[] not null default '{}' check (shifts_available <@ '{first,second,third,weekend,flexible}'),
  available_from         date,
  positions_wanted       text[] not null default '{}' check (positions_wanted <@ '{picking,packing,order_fulfillment,sorting,material_handling,receiving,shipping,inventory,other}'),
  stage                  public.candidate_stage not null default 'new',
  stage_changed_at       timestamptz not null default now(),
  closed_reason          text check (closed_reason in ('not_interested', 'not_available', 'recontact_later', 'no_show', 'did_not_meet_requirements', 'left_assignment', 'other_agency', 'duplicate', 'other')),
  recontact_on           date,
  opening_id             uuid,
  interview_at           timestamptz,
  first_day              date,
  employee_id            uuid,                    -- set when hired: links to attendance
  last_contact_at        timestamptz,
  next_action            text check (char_length(next_action) <= 160),
  next_action_due        date,
  consent_contact        boolean not null default false,   -- may contact about job opportunities
  consent_sms            boolean not null default false,
  consent_whatsapp       boolean not null default false,
  consent_email          boolean not null default false,
  consent_at             timestamptz,
  consent_method         text check (consent_method in ('web_form', 'paper_form', 'verbal', 'other')),
  agency_check           text not null default 'unknown' check (agency_check in ('unknown', 'none', 'other_agency_reported', 'cleared')),
  agency_note            text check (char_length(agency_note) <= 200),
  notes                  text check (char_length(notes) <= 1000),
  possible_duplicate_of  uuid,
  is_sample              boolean not null default false,  -- demonstration rows, always labelled
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, organization_id),
  check (phone is not null or email is not null),
  check (stage <> 'closed' or closed_reason is not null),
  check (not (consent_sms or consent_whatsapp or consent_email) or consent_contact),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade,
  foreign key (source_id, organization_id) references public.recruitment_sources(id, organization_id) on delete set null (source_id),
  foreign key (intake_form_id, organization_id) references public.intake_forms(id, organization_id) on delete set null (intake_form_id),
  foreign key (organization_id, owner_id) references public.memberships(organization_id, user_id) on delete set null (owner_id),
  foreign key (opening_id, warehouse_id) references public.job_openings(id, warehouse_id) on delete set null (opening_id),
  foreign key (employee_id, warehouse_id) references public.employees(id, warehouse_id) on delete set null (employee_id),
  foreign key (possible_duplicate_of, organization_id) references public.candidates(id, organization_id) on delete set null (possible_duplicate_of)
);
create index candidates_org_stage_idx on public.candidates (organization_id, stage);
create index candidates_org_wh_idx on public.candidates (organization_id, warehouse_id);
create index candidates_phone_idx on public.candidates (organization_id, phone) where phone is not null;
create index candidates_email_idx on public.candidates (organization_id, email) where email is not null;
create unique index candidates_employee_idx on public.candidates (employee_id) where employee_id is not null;

-- Contact log and stage history.
create table public.candidate_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  candidate_id     uuid not null,
  kind             text not null check (kind in ('stage_change', 'call', 'sms', 'whatsapp', 'email', 'in_person', 'note', 'message_prepared')),
  outcome          text check (outcome in ('reached', 'no_answer', 'left_message', 'wrong_number', 'replied', 'sent', 'other')),
  body             text check (char_length(body) <= 500),
  stage_from       public.candidate_stage,
  stage_to         public.candidate_stage,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (candidate_id, organization_id) references public.candidates(id, organization_id) on delete cascade
);
create index candidate_events_cand_idx on public.candidate_events (candidate_id, created_at desc);
create index candidate_events_org_idx on public.candidate_events (organization_id, created_at);

create table public.recruitment_tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  warehouse_id     uuid,           -- copied from the candidate by trigger (null = company-wide task)
  candidate_id     uuid,
  kind             text not null default 'other' check (kind in (
                     'first_contact', 'follow_up', 'prescreen', 'interview', 'confirm_first_day',
                     'first_day_check', 'retention_check', 'recontact', 'event_follow_up', 'other')),
  title            text not null check (char_length(title) between 1 and 160),
  due_on           date not null,
  assigned_to      uuid,
  auto_key         text,           -- set by automations, prevents duplicates
  done_at          timestamptz,
  done_by          uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (candidate_id, organization_id) references public.candidates(id, organization_id) on delete cascade,
  foreign key (organization_id, assigned_to) references public.memberships(organization_id, user_id) on delete set null (assigned_to),
  unique (candidate_id, auto_key)
);
create index recruitment_tasks_open_idx on public.recruitment_tasks (organization_id, due_on) where done_at is null;

-- ---------------------------------------------------------------------------
-- Agency coordination
-- ---------------------------------------------------------------------------
create table public.partner_agencies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  rep_name         text check (char_length(rep_name) <= 120),
  phone            text check (char_length(phone) <= 40),
  email            text check (char_length(email) <= 160),
  scope_note       text check (char_length(scope_note) <= 500),   -- positions / shifts they cover
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

create table public.coordination_entries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null default 'note' check (kind in ('meeting', 'client_request', 'escalation', 'handoff', 'agreement', 'note')),
  occurred_on      date not null default current_date,
  title            text not null check (char_length(title) between 1 and 160),
  agency_id        uuid,
  attendees        text check (char_length(attendees) <= 300),
  summary          text check (char_length(summary) <= 2000),   -- operational information only, no candidate personal data
  decisions        text check (char_length(decisions) <= 1000),
  follow_up        text check (char_length(follow_up) <= 500),
  status           text not null default 'open' check (status in ('open', 'resolved')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (agency_id, organization_id) references public.partner_agencies(id, organization_id) on delete set null (agency_id)
);
create index coordination_org_idx on public.coordination_entries (organization_id, occurred_on desc);

create table public.message_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  code             text not null check (code ~ '^[a-z0-9_]{1,40}$'),
  lang             text not null check (lang in ('en', 'es')),
  channel          text not null default 'any' check (channel in ('any', 'sms', 'whatsapp', 'email', 'facebook', 'video_script', 'flyer')),
  title            text not null check (char_length(title) between 1 and 120),
  body             text not null check (char_length(body) between 1 and 3000),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  updated_at       timestamptz not null default now(),
  unique (organization_id, code, lang)
);

-- Exports are recorded in the audit log.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in ('insert', 'update', 'delete', 'export'));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant select, insert                                 on public.recruitment_settings   to authenticated;
grant update (public_name, privacy_contact, stale_days, low_pool_threshold, retention_months,
              goal_contacts_day, goal_prescreens_week, goal_interviews_week, goal_show_rate,
              goal_retention_30, stage_labels, hidden_stages)
                                                     on public.recruitment_settings   to authenticated;
grant select, insert, delete                         on public.recruitment_sources    to authenticated;
grant update (name, kind, url, contact_note, cost_note, monthly_cost, verified, is_active)
                                                     on public.recruitment_sources    to authenticated;
grant select, insert, delete                         on public.job_openings           to authenticated;
grant update (shift_id, title, position, headcount, status, authorized_by, authorized_on, pay_note,
              schedule_note, requirements_note, opened_on, target_date, filled_on)
                                                     on public.job_openings           to authenticated;
grant select, insert, delete                         on public.recruitment_activities to authenticated;
grant update (title, kind, status, starts_on, ends_on, start_time, location, owner_name, partner, est_cost,
              actual_cost, target_candidates, materials, permits, verification_url, results_note, source_id)
                                                     on public.recruitment_activities to authenticated;
grant select, insert                                 on public.intake_forms           to authenticated;
grant update (title, source_id, activity_id, is_active)
                                                     on public.intake_forms           to authenticated;
grant select, insert, delete                         on public.candidates             to authenticated;
grant update (warehouse_id, first_name, last_name, phone, email, city, zip, preferred_language, source_id,
              source_detail, owner_id, experience, experience_note, equipment, shifts_available, available_from,
              positions_wanted, stage, closed_reason, recontact_on, opening_id, interview_at, first_day,
              next_action, next_action_due, consent_contact, consent_sms, consent_whatsapp, consent_email,
              consent_at, consent_method, agency_check, agency_note, notes, possible_duplicate_of)
                                                     on public.candidates             to authenticated;
grant select, insert                                 on public.candidate_events       to authenticated;
grant select, insert, delete                         on public.recruitment_tasks      to authenticated;
grant update (title, due_on, assigned_to, done_at, kind)
                                                     on public.recruitment_tasks      to authenticated;
grant select, insert                                 on public.partner_agencies       to authenticated;
grant update (name, rep_name, phone, email, scope_note, is_active)
                                                     on public.partner_agencies       to authenticated;
grant select, insert                                 on public.coordination_entries   to authenticated;
grant update (kind, occurred_on, title, agency_id, attendees, summary, decisions, follow_up, status)
                                                     on public.coordination_entries   to authenticated;
grant select, insert, delete                         on public.message_templates      to authenticated;
grant update (channel, title, body, is_active, sort_order)
                                                     on public.message_templates      to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity and automation triggers
-- ---------------------------------------------------------------------------
create function app.org_today(org uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select o.timezone from public.organizations o where o.id = org), 'America/New_York'))::date;
$$;
revoke execute on function app.org_today(uuid) from public;
grant execute on function app.org_today(uuid) to authenticated;

-- Normalizes contact data, keeps stage timestamps, flags likely duplicates.
create function app.candidate_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  digits text;
begin
  if new.phone is not null then
    digits := regexp_replace(new.phone, '\D', '', 'g');
    if char_length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;
    new.phone := nullif(digits, '');
  end if;
  new.email      := nullif(lower(btrim(new.email::text)), '');
  new.first_name := btrim(new.first_name);
  new.last_name  := btrim(new.last_name);
  new.city       := nullif(btrim(new.city), '');

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.stage_changed_at := now();
    if new.consent_contact and new.consent_at is null then new.consent_at := now(); end if;
  else
    if new.stage is distinct from old.stage then
      new.stage_changed_at := now();
      if new.stage <> 'closed' then new.closed_reason := null; end if;
    end if;
    if new.is_sample is distinct from old.is_sample or new.registered_at is distinct from old.registered_at then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if new.consent_contact and not old.consent_contact and new.consent_at is null then new.consent_at := now(); end if;
    -- Withdrawn consent: every channel goes with it.
    if not new.consent_contact then
      new.consent_sms := false; new.consent_whatsapp := false; new.consent_email := false;
    end if;
  end if;

  if new.stage = 'closed' and new.closed_reason is null then new.closed_reason := 'other'; end if;

  -- Possible duplicate: same phone, same email, or same full name + ZIP, anywhere in the company.
  if tg_op = 'INSERT' or new.phone is distinct from old.phone or new.email is distinct from old.email then
    if new.possible_duplicate_of is null or tg_op = 'UPDATE' then
      select c.id into new.possible_duplicate_of
        from public.candidates c
       where c.organization_id = new.organization_id
         and c.id <> new.id
         and ((new.phone is not null and c.phone = new.phone)
           or (new.email is not null and c.email = new.email)
           or (new.zip is not null and c.zip = new.zip
               and lower(c.first_name) = lower(new.first_name) and lower(c.last_name) = lower(new.last_name)))
       order by c.registered_at
       limit 1;
    end if;
  end if;
  return new;
end $$;

-- Writes the stage history and creates the follow-up tasks each stage needs.
create function app.candidate_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today date := app.org_today(new.organization_id);
  base  date;
  label text := new.first_name || ' ' || new.last_name;
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.candidate_events (organization_id, candidate_id, kind, stage_from, stage_to, created_by)
    values (new.organization_id, new.id, 'stage_change',
            case when tg_op = 'UPDATE' then old.stage end, new.stage, auth.uid());

    -- Stage reached: the tasks that belonged to earlier stages are finished.
    update public.recruitment_tasks t
       set done_at = now(), done_by = auth.uid()
     where t.candidate_id = new.id and t.done_at is null
       and ((t.auto_key = 'first_contact' and new.stage not in ('new', 'pending_contact'))
         or (t.auto_key = 'prescreen' and new.stage not in ('new', 'pending_contact', 'contacted', 'interested'))
         or (new.stage in ('started', 'retention') and t.kind in ('confirm_first_day', 'first_day_check'))
         or (new.stage = 'closed' and t.auto_key is not null and t.auto_key not like 'recontact%'));

    if new.stage in ('new', 'pending_contact') then
      insert into public.recruitment_tasks (organization_id, candidate_id, kind, title, due_on, assigned_to, auto_key)
      values (new.organization_id, new.id, 'first_contact', 'First contact: ' || label, today, new.owner_id, 'first_contact')
      on conflict (candidate_id, auto_key) do nothing;
    elsif new.stage = 'interested' then
      insert into public.recruitment_tasks (organization_id, candidate_id, kind, title, due_on, assigned_to, auto_key)
      values (new.organization_id, new.id, 'prescreen', 'Pre-screen against the opening: ' || label, today + 1, new.owner_id, 'prescreen')
      on conflict (candidate_id, auto_key) do nothing;
    elsif new.stage = 'started' then
      base := coalesce(new.first_day, today);
      insert into public.recruitment_tasks (organization_id, candidate_id, kind, title, due_on, assigned_to, auto_key)
      values (new.organization_id, new.id, 'retention_check', 'Day-7 check-in: ' || label, base + 7, new.owner_id, 'retention_7'),
             (new.organization_id, new.id, 'retention_check', 'Day-30 check-in: ' || label, base + 30, new.owner_id, 'retention_30'),
             (new.organization_id, new.id, 'retention_check', 'Day-60 check-in: ' || label, base + 60, new.owner_id, 'retention_60')
      on conflict (candidate_id, auto_key) do nothing;
    elsif new.stage = 'closed' and new.recontact_on is not null then
      insert into public.recruitment_tasks (organization_id, candidate_id, kind, title, due_on, assigned_to, auto_key)
      values (new.organization_id, new.id, 'recontact', 'Recontact: ' || label, new.recontact_on, new.owner_id, 'recontact:' || new.recontact_on)
      on conflict (candidate_id, auto_key) do nothing;
    end if;
  end if;

  -- Interview reminder on the interview date.
  if new.interview_at is not null and (tg_op = 'INSERT' or new.interview_at is distinct from old.interview_at) then
    insert into public.recruitment_tasks (organization_id, candidate_id, kind, title, due_on, assigned_to, auto_key)
    values (new.organization_id, new.id, 'interview',
            'Interview ' || to_char(new.interview_at at time zone coalesce((select o.timezone from public.organizations o where o.id = new.organization_id), 'America/New_York'), 'HH12:MI AM') || ': ' || label,
            (new.interview_at at time zone coalesce((select o.timezone from public.organizations o where o.id = new.organization_id), 'America/New_York'))::date,
            new.owner_id, 'interview:' || new.interview_at::text)
    on conflict (candidate_id, auto_key) do nothing;
  end if;

  -- First day: confirm the day before, check attendance on the day.
  if new.first_day is not null and new.stage in ('assigned', 'first_day_confirmed')
     and (tg_op = 'INSERT' or new.first_day is distinct from old.first_day or new.stage is distinct from old.stage) then
    insert into public.recruitment_tasks (organization_id, candidate_id, kind, title, due_on, assigned_to, auto_key)
    values (new.organization_id, new.id, 'confirm_first_day', 'Confirm first day (' || to_char(new.first_day, 'Mon DD') || '): ' || label,
            greatest(new.first_day - 1, today), new.owner_id, 'confirm_first_day:' || new.first_day),
           (new.organization_id, new.id, 'first_day_check', 'Did they show up? First day: ' || label,
            new.first_day, new.owner_id, 'first_day_check:' || new.first_day)
    on conflict (candidate_id, auto_key) do nothing;
  end if;
  return null;
end $$;

-- Contact entries move "last contact" forward.
create function app.candidate_event_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('call', 'sms', 'whatsapp', 'email', 'in_person') then
    update public.candidates c set last_contact_at = greatest(coalesce(c.last_contact_at, new.created_at), new.created_at)
     where c.id = new.candidate_id;
    if new.outcome in ('reached', 'replied') then
      update public.candidates c set stage = 'contacted'
       where c.id = new.candidate_id and c.stage in ('new', 'pending_contact');
    end if;
  end if;
  return null;
end $$;

-- Events: author and company come from the server.
create function app.candidate_event_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select c.organization_id into new.organization_id from public.candidates c where c.id = new.candidate_id;
  new.created_by := auth.uid();
  -- Sample data keeps its backdated timeline; everything else is stamped by the server.
  if coalesce(current_setting('app.loading_samples', true), '') <> 'on' then
    new.created_at := now();
  end if;
  if new.kind = 'stage_change' and auth.uid() is not null and pg_trigger_depth() = 1 then
    raise exception 'stage changes are recorded automatically' using errcode = '42501';
  end if;
  return new;
end $$;

-- Tasks inherit the candidate's warehouse (drives supervisor visibility).
create function app.task_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.candidate_id is not null then
    select c.warehouse_id into new.warehouse_id from public.candidates c where c.id = new.candidate_id;
  elsif tg_op = 'INSERT' then
    new.warehouse_id := null;
  end if;
  if new.done_at is not null and (tg_op = 'INSERT' or old.done_at is null) then
    new.done_by := auth.uid();
  elsif new.done_at is null then
    new.done_by := null;
  end if;
  return new;
end $$;

-- When a hired candidate's first attendance is recorded, the pipeline moves by itself.
create function app.employee_started() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.first_attendance_date is not null and old.first_attendance_date is null then
    update public.candidates c
       set stage = 'started', first_day = coalesce(c.first_day, new.first_attendance_date)
     where c.employee_id = new.id and c.stage in ('approved', 'available', 'assigned', 'first_day_confirmed');
  end if;
  return null;
end $$;

-- Candidate audit without personal data: who changed which fields, never the values.
create function app.audit_candidate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into changed from jsonb_object_keys(n) k
     where k not in ('updated_at', 'stage_changed_at') and n -> k is distinct from o -> k;
    if changed is null then return null; end if;
  end if;
  insert into public.audit_log (organization_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (coalesce(n ->> 'organization_id', o ->> 'organization_id')::uuid, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(n ->> 'id', o ->> 'id')::uuid,
          case when o is not null then jsonb_build_object('stage', o -> 'stage') end,
          case when n is not null then jsonb_build_object('stage', n -> 'stage', 'fields', to_jsonb(changed)) end);
  return null;
end $$;

create trigger touch before update on public.recruitment_settings   for each row execute function app.touch_updated_at();
create trigger touch before update on public.job_openings           for each row execute function app.touch_updated_at();
create trigger touch before update on public.recruitment_activities for each row execute function app.touch_updated_at();
create trigger touch before update on public.candidates             for each row execute function app.touch_updated_at();
create trigger touch before update on public.coordination_entries   for each row execute function app.touch_updated_at();
create trigger touch before update on public.message_templates      for each row execute function app.touch_updated_at();

create trigger no_org_change before update on public.recruitment_sources    for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.job_openings           for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.recruitment_activities for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.intake_forms           for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.candidates             for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.recruitment_tasks      for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.partner_agencies       for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.coordination_entries   for each row execute function app.forbid_org_change();
create trigger no_org_change before update on public.message_templates      for each row execute function app.forbid_org_change();

create trigger candidate_before before insert or update on public.candidates
  for each row execute function app.candidate_before();
create trigger candidate_after after insert or update on public.candidates
  for each row execute function app.candidate_after();
create trigger candidate_event_before before insert on public.candidate_events
  for each row execute function app.candidate_event_before();
create trigger candidate_event_after after insert on public.candidate_events
  for each row execute function app.candidate_event_after();
create trigger task_before before insert or update on public.recruitment_tasks
  for each row execute function app.task_before();
create trigger employee_started after update of first_attendance_date on public.employees
  for each row execute function app.employee_started();

create trigger audit after insert or update or delete on public.candidates             for each row execute function app.audit_candidate();
create trigger audit after insert or update or delete on public.job_openings           for each row execute function app.audit();
create trigger audit after insert or update or delete on public.recruitment_activities for each row execute function app.audit();
create trigger audit after insert or update or delete on public.coordination_entries   for each row execute function app.audit();
create trigger audit after insert or update or delete on public.intake_forms           for each row execute function app.audit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Owner/Admin: the whole company. Supervisor: candidates and tasks of their warehouses,
-- read access to the shared setup (sources, openings, templates, calendar, agencies).
-- Deleting a candidate (erasure request) is Owner/Admin only.
-- ---------------------------------------------------------------------------
alter table public.recruitment_settings   enable row level security;
alter table public.recruitment_sources    enable row level security;
alter table public.job_openings           enable row level security;
alter table public.recruitment_activities enable row level security;
alter table public.intake_forms           enable row level security;
alter table public.candidates             enable row level security;
alter table public.candidate_events       enable row level security;
alter table public.recruitment_tasks      enable row level security;
alter table public.partner_agencies       enable row level security;
alter table public.coordination_entries   enable row level security;
alter table public.message_templates      enable row level security;

create policy rs_read on public.recruitment_settings for select to authenticated
  using (app.license_readable(organization_id));
create policy rs_insert on public.recruitment_settings for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy rs_update on public.recruitment_settings for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- Shared setup tables: everyone reads, Owner/Admin write.
do $$
declare t text;
begin
  foreach t in array array['recruitment_sources', 'recruitment_activities', 'partner_agencies', 'message_templates'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (app.license_readable(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.license_ok(organization_id) and app.has_role(organization_id, ''{owner,admin}''))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (app.license_ok(organization_id) and app.has_role(organization_id, ''{owner,admin}'')) with check (app.license_ok(organization_id) and app.has_role(organization_id, ''{owner,admin}''))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (app.license_ok(organization_id) and app.has_role(organization_id, ''{owner,admin}''))', t);
  end loop;
end $$;

-- Coordination log: everyone reads and adds entries; Owner/Admin edit.
create policy coord_read on public.coordination_entries for select to authenticated
  using (app.license_readable(organization_id));
create policy coord_insert on public.coordination_entries for insert to authenticated
  with check (app.license_ok(organization_id) and created_by = (select auth.uid()));
create policy coord_update on public.coordination_entries for update to authenticated
  using (app.license_ok(organization_id) and (app.has_role(organization_id, '{owner,admin}') or created_by = (select auth.uid())))
  with check (app.license_ok(organization_id) and (app.has_role(organization_id, '{owner,admin}') or created_by = (select auth.uid())));

-- Openings and intake forms: read within your warehouses, Owner/Admin write.
create policy open_read on public.job_openings for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy open_insert on public.job_openings for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy open_update on public.job_openings for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy open_delete on public.job_openings for delete to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

create policy forms_read on public.intake_forms for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy forms_insert on public.intake_forms for insert to authenticated
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
create policy forms_update on public.intake_forms for update to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'))
  with check (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

-- Candidates
create policy cand_read on public.candidates for select to authenticated
  using (app.license_readable(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy cand_insert on public.candidates for insert to authenticated
  with check (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id) and not is_sample);
create policy cand_update on public.candidates for update to authenticated
  using (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id))
  with check (app.license_ok(organization_id) and app.in_warehouse(organization_id, warehouse_id));
create policy cand_delete on public.candidates for delete to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));

create policy cev_read on public.candidate_events for select to authenticated
  using (app.license_readable(organization_id) and exists (
    select 1 from public.candidates c where c.id = candidate_id and app.in_warehouse(c.organization_id, c.warehouse_id)));
create policy cev_insert on public.candidate_events for insert to authenticated
  with check (app.license_ok(organization_id) and exists (
    select 1 from public.candidates c where c.id = candidate_id and app.in_warehouse(c.organization_id, c.warehouse_id)));

-- Tasks: company-wide tasks are Owner/Admin; candidate tasks follow the warehouse.
create policy task_read on public.recruitment_tasks for select to authenticated
  using (app.license_readable(organization_id)
         and (app.has_role(organization_id, '{owner,admin}')
              or assigned_to = (select auth.uid())
              or (warehouse_id is not null and app.in_warehouse(organization_id, warehouse_id))));
create policy task_insert on public.recruitment_tasks for insert to authenticated
  with check (app.license_ok(organization_id)
              and (app.has_role(organization_id, '{owner,admin}')
                   or (candidate_id is not null and exists (
                         select 1 from public.candidates c where c.id = candidate_id and app.in_warehouse(c.organization_id, c.warehouse_id)))));
create policy task_update on public.recruitment_tasks for update to authenticated
  using (app.license_ok(organization_id)
         and (app.has_role(organization_id, '{owner,admin}')
              or assigned_to = (select auth.uid())
              or (warehouse_id is not null and app.in_warehouse(organization_id, warehouse_id))))
  with check (app.license_ok(organization_id));
create policy task_delete on public.recruitment_tasks for delete to authenticated
  using (app.license_ok(organization_id) and app.has_role(organization_id, '{owner,admin}'));
