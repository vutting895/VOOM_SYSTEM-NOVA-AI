-- ============================================================================
-- NOVA AI — DRAFT MIGRATION. REVIEW BEFORE APPLYING. NOT AUTO-APPLIED.
-- Creates an isolated `nova` schema. Does NOT touch `public` (existing affiliate table).
-- Apply manually after review: psql "$DB_URL" -f this_file.sql  (or supabase db push on a branch first)
-- ============================================================================
begin;

create schema if not exists nova;
revoke all on schema nova from public, anon;
grant usage on schema nova to authenticated, service_role;

-- Role comes from the signed JWT app_metadata (set only by service role / admin API).
create or replace function nova.current_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'nova_role', '')
$$;

create table nova.audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  level text not null default 'info' check (level in ('info','warn','error')),
  detail jsonb not null default '{}'::jsonb
);

create table nova.approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table nova.emergency_stops (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  backend_confirmed boolean not null default false
);

grant select on nova.audit_events, nova.approvals, nova.emergency_stops to authenticated;
grant all on all tables in schema nova to service_role;

alter table nova.audit_events enable row level security;
alter table nova.approvals enable row level security;
alter table nova.emergency_stops enable row level security;

-- Reads: any recognized NOVA role. Writes: service_role only (via the Worker), no client write policies.
create policy "nova roles read audit" on nova.audit_events for select to authenticated
  using (nova.current_role() in ('admin','operator','viewer'));
create policy "nova roles read approvals" on nova.approvals for select to authenticated
  using (nova.current_role() in ('admin','operator','viewer'));
create policy "operators read stops" on nova.emergency_stops for select to authenticated
  using (nova.current_role() in ('admin','operator'));

commit;

-- ROLLBACK (manual):
-- begin; drop schema nova cascade; commit;