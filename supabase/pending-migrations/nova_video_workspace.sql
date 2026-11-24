-- Free-first NOVA Video Workspace metadata. No media binaries or worker execution are stored here.
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

create index if not exists nova_video_jobs_owner_created_idx
  on public.nova_video_jobs(user_id, created_at desc);
create index if not exists nova_video_jobs_project_created_idx
  on public.nova_video_jobs(project_id, created_at desc);

alter table public.nova_video_projects enable row level security;
alter table public.nova_video_jobs enable row level security;

revoke all on table public.nova_video_projects from public, anon, authenticated;
revoke all on table public.nova_video_jobs from public, anon, authenticated;
grant select, insert on table public.nova_video_projects to authenticated;
grant select, insert on table public.nova_video_jobs to authenticated;

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

comment on table public.nova_video_projects is
  'Tenant-owned NOVA Video Workspace project metadata. Media binaries live in a separately approved private object store.';
comment on table public.nova_video_jobs is
  'Tenant-owned free-only video job requests. This initial slice records blocked requests only; it does not dispatch or execute work.';
