-- Run once in Supabase > SQL Editor (only if DB_BACKEND=supabase).
-- RLS on with no policies: only the server's service-role key can read/write.
create table if not exists public.sms_leads (
  phone text primary key,
  name text, email text, language text default 'en',
  state text default 'lift', status text default 'screening',
  lift boolean, transport boolean, start_week boolean,
  nudges int default 0, opted_out boolean default false, source text default 'sms',
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_inbound_at timestamptz, last_outbound_at timestamptz
);
create table if not exists public.sms_messages (
  id bigint generated always as identity primary key,
  phone text not null, direction text check (direction in ('in','out')),
  body text, created_at timestamptz default now()
);
create index if not exists sms_messages_phone_idx on public.sms_messages (phone, created_at);
alter table public.sms_leads enable row level security;
alter table public.sms_messages enable row level security;
