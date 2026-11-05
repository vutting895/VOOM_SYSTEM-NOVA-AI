-- NOVA Video workspace + immutable preparation/approval records.
-- Forward-only candidate for isolated staging review; DO NOT apply to Production yet.
-- Verified Production migration history currently ends at 20261031070311, while the
-- repository still carries older, un-applied workspace/approval migration files.
-- Reconcile that history and repair the existing Supabase main branch state first.

create table if not exists public.nova_video_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nova_video_projects_id_user_unique unique (id,user_id)
);

create index if not exists nova_video_projects_owner_updated_idx
  on public.nova_video_projects(user_id, updated_at desc);

create table if not exists public.nova_video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  task_type text not null check (task_type in ('video_generation','video_analysis','video_edit_export')),
  status text not null check (status in ('blocked_no_free_gpu','blocked_worker_unavailable')),
  prompt text not null default '' check (char_length(prompt) <= 4000),
  request jsonb not null default '{}'::jsonb check (jsonb_typeof(request) = 'object'),
  execution_mode text not null default 'free_only' check (execution_mode = 'free_only'),
  estimated_cost numeric(12,4) not null default 0 check (estimated_cost = 0),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{12,100}$'),
  created_at timestamptz not null default now(),
  constraint nova_video_jobs_project_owner_fk
    foreign key (project_id,user_id)
    references public.nova_video_projects(id,user_id) on delete cascade,
  constraint nova_video_jobs_owner_idempotency_unique unique (user_id,idempotency_key)
);

-- Required for a composite owner-preserving foreign key from preparation snapshots.
create unique index if not exists nova_video_jobs_id_user_unique
  on public.nova_video_jobs(id,user_id);
create index if not exists nova_video_jobs_owner_created_idx
  on public.nova_video_jobs(user_id, created_at desc);
create index if not exists nova_video_jobs_project_created_idx
  on public.nova_video_jobs(project_id, created_at desc);

create table if not exists public.nova_video_preparations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot jsonb not null
    check (
      jsonb_typeof(snapshot) = 'object'
      and snapshot->>'schemaVersion' = 'nova.video-preparation.v1'
      and snapshot->'job'->>'id' = job_id::text
      and snapshot->'policy'->>'executionEnabled' = 'false'
      and snapshot->'policy'->>'estimatedCost' = '0'
      and snapshot->'productionPlan'->>'executionEnabled' = 'false'
      and snapshot->'productionPlan'->>'status' = 'blocked_no_free_gpu'
    ),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  planner_version text not null check (char_length(planner_version) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint nova_video_preparations_job_owner_fk
    foreign key (job_id,user_id)
    references public.nova_video_jobs(id,user_id),
  constraint nova_video_preparations_id_user_unique unique (id,user_id),
  constraint nova_video_preparations_job_user_unique unique (job_id,user_id)
);

create index if not exists nova_video_preparations_owner_created_idx
  on public.nova_video_preparations(user_id, created_at desc);

create table if not exists public.nova_video_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  preparation_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  decision text not null check (decision in ('approved','rejected')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  constraint nova_video_approval_decisions_owner_preparation_fk
    foreign key (preparation_id,user_id)
    references public.nova_video_preparations(id,user_id),
  constraint nova_video_approval_decisions_one_per_preparation
    unique (preparation_id,user_id)
);

create index if not exists nova_video_approval_decisions_owner_created_idx
  on public.nova_video_approval_decisions(user_id, created_at desc);

alter table public.nova_video_projects enable row level security;
alter table public.nova_video_jobs enable row level security;
alter table public.nova_video_preparations enable row level security;
alter table public.nova_video_approval_decisions enable row level security;

revoke all on table public.nova_video_projects from public, anon, authenticated;
revoke all on table public.nova_video_jobs from public, anon, authenticated;
revoke all on table public.nova_video_preparations from public, anon, authenticated;
revoke all on table public.nova_video_approval_decisions from public, anon, authenticated;

-- No UPDATE or DELETE is granted: job requests, preparation snapshots and decisions
-- are append-only. A changed brief must create a new job and a new snapshot.
grant select, insert on table public.nova_video_projects to authenticated;
grant select, insert on table public.nova_video_jobs to authenticated;
grant select, insert on table public.nova_video_preparations to authenticated;
grant select, insert on table public.nova_video_approval_decisions to authenticated;

drop policy if exists nova_video_projects_select_own on public.nova_video_projects;
create policy nova_video_projects_select_own on public.nova_video_projects
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nova_video_projects_insert_own on public.nova_video_projects;
create policy nova_video_projects_insert_own on public.nova_video_projects
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists nova_video_jobs_select_own on public.nova_video_jobs;
create policy nova_video_jobs_select_own on public.nova_video_jobs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nova_video_jobs_insert_own on public.nova_video_jobs;
create policy nova_video_jobs_insert_own on public.nova_video_jobs
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and execution_mode = 'free_only'
    and estimated_cost = 0
    and status in ('blocked_no_free_gpu','blocked_worker_unavailable')
  );

drop policy if exists nova_video_preparations_select_own on public.nova_video_preparations;
create policy nova_video_preparations_select_own on public.nova_video_preparations
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nova_video_preparations_insert_own on public.nova_video_preparations;
create policy nova_video_preparations_insert_own on public.nova_video_preparations
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.nova_video_jobs j
      where j.id = nova_video_preparations.job_id
        and j.user_id = (select auth.uid())
        and j.task_type = 'video_generation'
        and j.status = 'blocked_no_free_gpu'
    )
  );

drop policy if exists nova_video_approval_decisions_select_own on public.nova_video_approval_decisions;
create policy nova_video_approval_decisions_select_own on public.nova_video_approval_decisions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nova_video_approval_decisions_insert_own on public.nova_video_approval_decisions;
create policy nova_video_approval_decisions_insert_own on public.nova_video_approval_decisions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.nova_video_preparations p
      where p.id = nova_video_approval_decisions.preparation_id
        and p.user_id = (select auth.uid())
        and p.snapshot_hash = nova_video_approval_decisions.snapshot_hash
    )
  );

comment on table public.nova_video_preparations is
  'Owner-scoped immutable production-plan snapshots. They record readiness for human review; they never authorize model execution.';
comment on table public.nova_video_approval_decisions is
  'Append-only, one-time owner decision bound to the exact immutable preparation snapshot hash. Approval never enables rendering.';
