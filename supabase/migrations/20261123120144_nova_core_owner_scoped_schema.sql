-- NOVA Core owner-scoped metadata schema.
-- Applied to canonical Supabase project by migration nova_core_owner_scoped_schema.
-- No client-side writes, no broker writes, no trading execution.
begin;
create schema if not exists nova;
revoke all on schema nova from public, anon;
grant usage on schema nova to authenticated, service_role;

create or replace function nova.current_role()
returns text language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'nova_role', '')
$$;
revoke all on function nova.current_role() from public, anon;
grant execute on function nova.current_role() to authenticated, service_role;

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

revoke all on all tables in schema nova from public, anon, authenticated;
grant select on nova.audit_events, nova.approvals, nova.emergency_stops to authenticated;
grant all on all tables in schema nova to service_role;

alter table nova.audit_events enable row level security;
alter table nova.approvals enable row level security;
alter table nova.emergency_stops enable row level security;

create policy nova_audit_read_own on nova.audit_events for select to authenticated
using (actor = (select auth.uid()) and nova.current_role() in ('admin','operator','viewer'));
create policy nova_approvals_read_own on nova.approvals for select to authenticated
using ((requested_by = (select auth.uid()) or decided_by = (select auth.uid()))
and nova.current_role() in ('admin','operator','viewer'));
create policy nova_emergency_stops_read_own on nova.emergency_stops for select to authenticated
using (requested_by = (select auth.uid()) and nova.current_role() in ('admin','operator'));

create index nova_approvals_requested_by_idx on nova.approvals(requested_by);
create index nova_approvals_decided_by_idx on nova.approvals(decided_by);
create index nova_audit_events_actor_idx on nova.audit_events(actor);
create index nova_emergency_stops_requested_by_idx on nova.emergency_stops(requested_by);

comment on schema nova is 'NOVA operational metadata; owner-scoped read policies; writes restricted to trusted service role.';
comment on table nova.audit_events is 'Owner-scoped audit events; authenticated clients have SELECT only.';
comment on table nova.approvals is 'Owner-scoped approval metadata; authenticated clients have SELECT only.';
comment on table nova.emergency_stops is 'Owner-scoped emergency-stop requests; authenticated clients have SELECT only.';
commit;
