-- Parent Homework Tracker (free) — tables.
-- Homework belongs to a CLASS (grade + parallel), published by the administrator or by an
-- authorized source. Parents are read-only viewers who open a private link; they have no
-- account and no row in any table except the link that an admin created for them.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;   -- access rules (not exposed by the API)

create type public.hw_language as enum ('en', 'es', 'other');
create type public.hw_source   as enum ('manual', 'idukay_paste', 'idukay_api');

-- ---------------------------------------------------------------------------
-- Classes, subjects, students
-- ---------------------------------------------------------------------------
create table public.classes (
  id               uuid primary key default gen_random_uuid(),
  school_name      text check (school_name is null or char_length(school_name) <= 120),
  grade_label      text not null check (char_length(grade_label) between 1 and 120),
  grade_short      text not null check (char_length(grade_short) between 1 and 40),
  parallel         text not null check (char_length(parallel) between 1 and 10),
  school_year      text check (school_year is null or char_length(school_year) <= 20),
  timezone         text not null default 'America/Guayaquil',
  is_active        boolean not null default true,
  last_sync_at     timestamptz,          -- last successful automatic synchronization
  data_updated_at  timestamptz,          -- last change to this class's homework (any source)
  created_at       timestamptz not null default now(),
  unique (grade_label, parallel, school_year)
);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  language    public.hw_language not null default 'es',   -- language the homework is DONE in
  emoji       text check (emoji is null or char_length(emoji) <= 8),
  sort_order  integer not null default 0
);
create unique index subjects_class_name on public.subjects (class_id, lower(btrim(name)));

-- Only what a parent needs to recognise their child. No surnames, no IDs, no contact data.
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id),
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 60),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index students_class on public.students (class_id);

-- ---------------------------------------------------------------------------
-- Viewer links (the VIEWER role): a secret token → one or more students
-- ---------------------------------------------------------------------------
create table public.viewer_links (
  id            uuid primary key default gen_random_uuid(),
  label         text not null check (char_length(label) between 1 and 80),   -- e.g. "Familia de Gael"
  token_hash    text not null unique,                                        -- sha256 of the token; the token itself is never stored
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  last_used_at  timestamptz
);

create table public.viewer_link_students (
  link_id     uuid not null references public.viewer_links (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  primary key (link_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Homework (the official record)
-- ---------------------------------------------------------------------------
create table public.homework (
  id                  uuid primary key default gen_random_uuid(),
  class_id            uuid not null references public.classes (id),
  subject_id          uuid references public.subjects (id) on delete set null,
  subject             text not null check (char_length(btrim(subject)) between 1 and 80),
  title               text not null check (char_length(btrim(title)) between 1 and 300),
  instructions        text check (instructions is null or char_length(instructions) <= 6000),        -- ORIGINAL, authoritative
  parent_explanation  text check (parent_explanation is null or char_length(parent_explanation) <= 6000), -- optional help for parents (e.g. Spanish)
  language            public.hw_language not null,                                                   -- language the student must use
  start_date          date not null,
  due_date            date not null,
  teacher             text check (teacher is null or char_length(teacher) <= 120),
  notes               text check (notes is null or char_length(notes) <= 2000),
  attachments         jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  source              public.hw_source not null default 'manual',
  external_id         text check (external_id is null or char_length(external_id) <= 200),
  revision            integer not null default 1,
  withdrawn_at        timestamptz,        -- hidden from parents (e.g. a duplicate entered by mistake); never deleted
  withdrawn_reason    text check (withdrawn_reason is null or char_length(withdrawn_reason) <= 300),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (due_date >= start_date)
);
create index homework_class_dates on public.homework (class_id, due_date, start_date) where withdrawn_at is null;
-- No duplicates: an authorized source is matched by its own id …
create unique index homework_external on public.homework (class_id, source, external_id) where external_id is not null;
-- … and pasted / typed homework by its content.
create unique index homework_fingerprint on public.homework (class_id, lower(btrim(subject)), lower(btrim(title)), start_date, due_date)
  where withdrawn_at is null;

-- Every correction keeps the previous version (the archive is a historical record).
create table public.homework_revisions (
  id           bigint generated always as identity primary key,
  homework_id  uuid not null references public.homework (id),
  revision     integer not null,
  data         jsonb not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid
);
create index homework_revisions_hw on public.homework_revisions (homework_id, revision);

-- ---------------------------------------------------------------------------
-- Synchronization, administration, audit
-- ---------------------------------------------------------------------------
create table public.sync_runs (
  id           bigint generated always as identity primary key,
  class_id     uuid references public.classes (id) on delete cascade,
  source       text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null check (status in ('running', 'ok', 'error', 'not_configured')),
  added        integer not null default 0,
  updated      integer not null default 0,
  unchanged    integer not null default 0,
  message      text
);
create index sync_runs_class on public.sync_runs (class_id, started_at desc);

-- The ADMIN role. Viewers (parents) never have a row here: they do not even have an account.
create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.audit_logs (
  id       bigint generated always as identity primary key,
  user_id  uuid,
  action   text not null,
  detail   jsonb not null default '{}'::jsonb,
  at       timestamptz not null default now()
);
