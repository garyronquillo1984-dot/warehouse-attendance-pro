-- Idukay Task Tracker — tables, constraints, indexes.
-- Every user-owned table carries user_id (the parent who owns the row).
-- Access rules (grants, RLS) are in the next migration.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;      -- access rules and triggers (not exposed by the API)
create schema if not exists billing;  -- subscription state machine (not exposed by the API)

create type public.task_status   as enum ('pending', 'in_progress', 'completed');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.task_source   as enum ('manual', 'paste', 'import', 'integration', 'sample');
create type public.subscription_status as enum
  ('TRIAL', 'ACTIVE', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED');

-- ---------------------------------------------------------------------------
-- Parents
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null check (char_length(full_name) between 1 and 120),
  phone         text check (phone is null or phone ~ '^[0-9+() .-]{6,30}$'),
  country       text check (country is null or country ~ '^[A-Z]{2}$'),
  locale        text not null default 'es' check (locale in ('es', 'en')),
  timezone      text not null default 'America/Guayaquil' check (char_length(timezone) between 1 and 64),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table public.user_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  morning_enabled    boolean not null default true,
  morning_time       time    not null default '06:30',
  evening_enabled    boolean not null default true,
  evening_time       time    not null default '18:30',
  tomorrow_enabled   boolean not null default true,
  tomorrow_time      time    not null default '20:00',
  email_reminders    boolean not null default false,   -- channel not wired yet
  push_reminders     boolean not null default false,   -- channel not wired yet
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Family data
-- ---------------------------------------------------------------------------
create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create unique index schools_user_name on public.schools (user_id, lower(btrim(name)));

create table public.children (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  grade       text check (grade is null or char_length(grade) <= 60),
  school_id   uuid,
  classroom   text check (classroom is null or char_length(classroom) <= 60),
  teacher     text check (teacher is null or char_length(teacher) <= 120),
  color       text not null default '#2f6b63' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active   boolean not null default true,
  is_sample   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  -- a child can only point at a school of the same parent
  foreign key (school_id, user_id) references public.schools (id, user_id) on delete set null (school_id)
);
create index children_user on public.children (user_id, sort_order);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create unique index subjects_user_name on public.subjects (user_id, lower(btrim(name)));

create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  child_id           uuid not null,
  subject_id         uuid,                       -- set by trigger from "subject"
  subject            text not null check (char_length(btrim(subject)) between 1 and 80),
  title              text not null check (char_length(btrim(title)) between 1 and 200),
  description        text check (description is null or char_length(description) <= 4000),
  assigned_date      date,
  due_date           date,
  due_time           time,
  priority           public.task_priority not null default 'normal',
  status             public.task_status   not null default 'pending',
  estimated_minutes  integer check (estimated_minutes is null or estimated_minutes between 1 and 600),
  teacher            text check (teacher is null or char_length(teacher) <= 120),
  notes              text check (notes is null or char_length(notes) <= 2000),
  source             public.task_source not null default 'manual',
  external_id        text check (external_id is null or char_length(external_id) <= 200),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  foreign key (child_id, user_id)   references public.children (id, user_id) on delete cascade,
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);
create index tasks_user_due      on public.tasks (user_id, due_date);
create index tasks_child_due     on public.tasks (child_id, due_date);
create index tasks_user_open     on public.tasks (user_id, due_date) where status <> 'completed';
create index tasks_user_done     on public.tasks (user_id, completed_at desc) where status = 'completed';
-- a future authorized integration upserts by its own id
create unique index tasks_external on public.tasks (user_id, source, external_id) where external_id is not null;

create table public.task_status_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  task_id      uuid not null,
  from_status  public.task_status,
  to_status    public.task_status not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index task_status_history_task on public.task_status_history (task_id, changed_at);

-- ---------------------------------------------------------------------------
-- Trial and subscription
-- ---------------------------------------------------------------------------
create table public.trial_periods (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null
);

create table public.subscriptions (
  user_id                   uuid primary key references auth.users (id) on delete cascade,
  status                    public.subscription_status not null default 'TRIAL',
  provider                  text not null default 'hotmart',
  provider_subscriber_code  text unique,
  last_transaction          text,
  current_period_end        timestamptz,
  cancelled_at              timestamptz,
  last_event_at             timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index subscriptions_status on public.subscriptions (status, current_period_end);

-- Opaque token sent to Hotmart as "sck" so the payment can be matched back to the parent.
create table public.checkout_sessions (
  token       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index checkout_sessions_user on public.checkout_sessions (user_id);

-- Every webhook event, deduplicated. Buyer e-mail is kept only as a hash.
create table public.billing_events (
  id                bigint generated always as identity primary key,
  provider          text not null default 'hotmart',
  event_id          text not null,
  event_type        text not null,
  event_time        timestamptz,
  received_at       timestamptz not null default now(),
  user_id           uuid references auth.users (id) on delete set null,
  buyer_email_hash  text,
  subscriber_code   text,
  transaction       text,
  checkout_token    text,
  period_end        timestamptz,
  amount            numeric(12, 2),
  currency          text,
  outcome           text,
  payload           jsonb not null default '{}'::jsonb,
  unique (provider, event_id)
);
create index billing_events_unmatched on public.billing_events (buyer_email_hash) where user_id is null;

-- E-mails that already used a trial, as SHA-256 only (survives account deletion).
create table public.used_trials (
  email_hash  text primary key,
  used_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications, audit, analytics, admins
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('morning', 'evening', 'tomorrow', 'trial', 'billing', 'system')),
  channel     text not null default 'in_app' check (channel in ('in_app', 'email', 'push')),
  title       text not null,
  body        text,
  local_date  date,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  sent_at     timestamptz       -- for email/push delivery workers (later)
);
create index notifications_user on public.notifications (user_id, created_at desc);
create unique index notifications_once_a_day on public.notifications (user_id, kind, channel, local_date)
  where kind in ('morning', 'evening', 'tomorrow');

create table public.audit_logs (
  id       bigint generated always as identity primary key,
  user_id  uuid,               -- plain id (no FK): the trail outlives a deleted account
  action   text not null,
  detail   jsonb not null default '{}'::jsonb,
  at       timestamptz not null default now()
);
create index audit_logs_user on public.audit_logs (user_id, at desc);

create table public.analytics_events (
  id       bigint generated always as identity primary key,
  user_id  uuid references auth.users (id) on delete set null,
  event    text not null check (event in (
             'registration', 'trial_started', 'first_child_added', 'first_task_added',
             'first_task_completed', 'trial_expired', 'checkout_clicked',
             'subscription_activated', 'subscription_cancelled', 'payment_failed',
             'subscription_expired', 'app_opened', 'onboarding_completed', 'paste_parsed')),
  day      date not null default current_date,
  at       timestamptz not null default now(),
  props    jsonb not null default '{}'::jsonb    -- never personal data
);
create index analytics_events_event on public.analytics_events (event, day);
create unique index analytics_once_per_user on public.analytics_events (user_id, event)
  where event in ('registration', 'trial_started', 'first_child_added', 'first_task_added',
                  'first_task_completed', 'trial_expired', 'onboarding_completed');
create unique index analytics_once_per_day on public.analytics_events (user_id, event, day)
  where event in ('app_opened');

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Prices shown by the admin dashboard (the real charge is whatever Hotmart charges).
create table public.app_config (
  key    text primary key,
  value  jsonb not null
);
insert into public.app_config (key, value) values
  ('monthly_price_usd', '2.99'::jsonb),
  ('trial_days', '7'::jsonb),
  ('payment_grace_days', '3'::jsonb);
