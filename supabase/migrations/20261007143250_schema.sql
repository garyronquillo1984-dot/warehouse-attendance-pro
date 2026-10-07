-- Warehouse Attendance Pro — schema
-- Every customer-owned row carries organization_id. Composite foreign keys
-- (id, organization_id) / (id, warehouse_id) make it impossible for a row of one
-- company (or warehouse) to point at another, even if application code has a bug.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role       as enum ('owner', 'admin', 'supervisor');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.employee_status   as enum ('active', 'inactive');
create type public.license_status    as enum ('trial', 'active', 'suspended', 'cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- Commercial tables
-- ---------------------------------------------------------------------------
create table public.plans (
  code            text primary key,
  name            text not null,
  max_warehouses  int,            -- null = unlimited
  max_employees   int,            -- active employees per organization
  max_users       int,            -- memberships per organization
  features        jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  sort_order      int not null default 0
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  timezone    text not null default 'America/New_York',
  plan_code   text not null references public.plans(code),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A company can hold several licenses over its life; the current one is the most recent.
create table public.licenses (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid references public.organizations(id) on delete set null, -- null until claimed
  provider                  text not null default 'hotmart',
  buyer_email               extensions.citext not null,
  provider_subscriber_code  text unique,
  provider_transaction      text,
  plan_code                 text not null references public.plans(code),
  status                    public.license_status not null,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  grace_until               timestamptz,   -- late payment grace
  ended_at                  timestamptz,   -- when it became cancelled / expired
  claimed_by                uuid references auth.users(id) on delete set null,
  claimed_at                timestamptz,
  last_event_at             timestamptz,   -- ignore out-of-order webhook events
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (status not in ('trial', 'active') or current_period_end is not null)
);
create index licenses_unclaimed_email_idx on public.licenses (buyer_email) where organization_id is null;
create index licenses_org_idx on public.licenses (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  updated_at  timestamptz not null default now()
);

create table public.memberships (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             public.member_role not null,
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create table public.warehouses (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id)
);
create index warehouses_org_idx on public.warehouses (organization_id);

create table public.member_warehouses (
  organization_id  uuid not null,
  user_id          uuid not null,
  warehouse_id     uuid not null,
  primary key (user_id, warehouse_id),
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id) on delete cascade,
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade
);
create index member_warehouses_org_user_idx on public.member_warehouses (organization_id, user_id);

create table public.shifts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  warehouse_id        uuid not null,
  name                text not null check (char_length(name) between 1 and 60),
  start_time          time not null,
  end_time            time not null,         -- earlier than start_time = crosses midnight
  days                smallint[] not null default '{1,2,3,4,5}', -- ISO weekday, 1 = Monday
  late_grace_minutes  int not null default 5 check (late_grace_minutes between 0 and 240),
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, warehouse_id),
  check (days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade
);
create index shifts_wh_idx on public.shifts (organization_id, warehouse_id);

create table public.departments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  warehouse_id     uuid not null,
  name             text not null check (char_length(name) between 1 and 80),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, warehouse_id),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade
);
create index departments_wh_idx on public.departments (organization_id, warehouse_id);

-- Absence categories. Deliberately no free-text medical detail.
create table public.absence_reasons (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  code             text not null check (code ~ '^[a-z0-9_]{1,40}$'),
  label            text not null check (char_length(label) between 1 and 60),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  unique (organization_id, code)
);

create table public.employees (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  warehouse_id           uuid not null,
  employee_code          text not null check (char_length(employee_code) between 1 and 40), -- badge
  first_name             text not null check (char_length(first_name) between 1 and 80),
  last_name              text not null check (char_length(last_name) between 1 and 80),
  shift_id               uuid,
  department_id          uuid,
  status                 public.employee_status not null default 'active',
  hire_date              date,
  first_attendance_date  date,   -- maintained by trigger: first present/late record
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, employee_code),   -- one badge per company; rehire = reactivate the same row
  unique (id, organization_id),
  unique (id, warehouse_id),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id),
  foreign key (shift_id, warehouse_id) references public.shifts(id, warehouse_id),
  foreign key (department_id, warehouse_id) references public.departments(id, warehouse_id)
);
create index employees_org_wh_status_idx on public.employees (organization_id, warehouse_id, status);
create index employees_first_att_idx on public.employees (organization_id, first_attendance_date);

create table public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  warehouse_id     uuid not null,
  kind             text not null check (kind in ('employees', 'attendance')),
  file_name        text check (char_length(file_name) <= 255),
  rows_total       int not null default 0,
  rows_new         int not null default 0,
  rows_updated     int not null default 0,
  rows_duplicate   int not null default 0,
  rows_error       int not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id) on delete cascade
);

-- "No Record" is the absence of a row.
create table public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,   -- set by trigger from the employee
  warehouse_id     uuid not null,   -- set by trigger from the employee
  employee_id      uuid not null,
  work_date        date not null,   -- night shifts: the date the shift started
  shift_id         uuid,            -- shift on that date (history is never rewritten)
  status           public.attendance_status not null,
  reason_code      text,
  note             text check (char_length(note) <= 200),
  source           text not null default 'manual' check (source in ('manual', 'import')),
  import_batch_id  uuid,
  recorded_by      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, work_date),
  foreign key (employee_id, warehouse_id) references public.employees(id, warehouse_id),
  foreign key (warehouse_id, organization_id) references public.warehouses(id, organization_id),
  foreign key (shift_id, warehouse_id) references public.shifts(id, warehouse_id),
  foreign key (organization_id, reason_code) references public.absence_reasons(organization_id, code),
  foreign key (import_batch_id, organization_id) references public.import_batches(id, organization_id)
);
create index attendance_org_wh_date_idx on public.attendance_records (organization_id, warehouse_id, work_date);
create index attendance_date_shift_idx on public.attendance_records (work_date, shift_id);

create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  email            extensions.citext not null,
  role             public.member_role not null check (role <> 'owner'),
  warehouse_ids    uuid[] not null default '{}',
  token_hash       text not null unique,
  invited_by       uuid references auth.users(id) on delete set null,
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index invitations_org_idx on public.invitations (organization_id);

-- Append-only change history, written only by security-definer triggers.
create table public.audit_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null,
  actor_id         uuid,
  action           text not null check (action in ('insert', 'update', 'delete')),
  table_name       text not null,
  record_id        uuid,
  old_data         jsonb,
  new_data         jsonb,
  created_at       timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);

-- Every Hotmart webhook event, stored once (idempotency + replay protection).
-- Only the server (service role) reads or writes this table.
create table public.billing_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'hotmart',
  provider_event_id  text not null unique,
  event_type         text not null,
  event_time         timestamptz,
  subscriber_code    text,
  transaction_code   text,
  buyer_email        extensions.citext,
  payload            jsonb,   -- redacted by the edge function (no phone, no document)
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  outcome            text
);
