-- NOVA opt-in AI memory and user feedback. No service-role key is used.

create table if not exists public.nova_ai_memory_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory_enabled boolean not null default false,
  feedback_enabled boolean not null default false,
  retention_days integer not null default 90 check (retention_days in (30, 90, 365)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_ai_memory_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'NOVA conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.nova_ai_memory_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.nova_ai_memory_threads(id, user_id) on delete cascade
);

create table if not exists public.nova_ai_memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('preference', 'project', 'workflow')),
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.nova_ai_learning_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  response_id uuid not null,
  thread_id uuid,
  rating smallint not null check (rating between 1 and 5),
  category text not null check (category in ('accuracy', 'helpfulness', 'relevance', 'safety')),
  provider text not null check (provider in ('cloudflare-workers-ai', 'gemini', 'openai', 'anthropic', 'ollama', 'unknown')),
  model text check (model is null or char_length(model) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, response_id)
);

create index if not exists nova_ai_memory_threads_owner_updated_idx on public.nova_ai_memory_threads(user_id, updated_at desc);
create index if not exists nova_ai_memory_messages_owner_thread_created_idx on public.nova_ai_memory_messages(user_id, thread_id, created_at desc);
create index if not exists nova_ai_memory_facts_owner_created_idx on public.nova_ai_memory_facts(user_id, created_at desc);
create index if not exists nova_ai_learning_feedback_owner_created_idx on public.nova_ai_learning_feedback(user_id, created_at desc);
create index if not exists nova_ai_learning_feedback_model_idx on public.nova_ai_learning_feedback(provider, model, category);

alter table public.nova_ai_memory_settings enable row level security;
alter table public.nova_ai_memory_threads enable row level security;
alter table public.nova_ai_memory_messages enable row level security;
alter table public.nova_ai_memory_facts enable row level security;
alter table public.nova_ai_learning_feedback enable row level security;

drop policy if exists nova_ai_memory_settings_select_own on public.nova_ai_memory_settings;
create policy nova_ai_memory_settings_select_own on public.nova_ai_memory_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nova_ai_memory_settings_insert_own on public.nova_ai_memory_settings;
create policy nova_ai_memory_settings_insert_own on public.nova_ai_memory_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists nova_ai_memory_settings_update_own on public.nova_ai_memory_settings;
create policy nova_ai_memory_settings_update_own on public.nova_ai_memory_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists nova_ai_memory_threads_select_own on public.nova_ai_memory_threads;
create policy nova_ai_memory_threads_select_own on public.nova_ai_memory_threads for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nova_ai_memory_threads_insert_opted_in on public.nova_ai_memory_threads;
create policy nova_ai_memory_threads_insert_opted_in on public.nova_ai_memory_threads for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.nova_ai_memory_settings s where s.user_id = (select auth.uid()) and s.memory_enabled = true));
drop policy if exists nova_ai_memory_threads_update_own on public.nova_ai_memory_threads;
create policy nova_ai_memory_threads_update_own on public.nova_ai_memory_threads for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nova_ai_memory_threads_delete_own on public.nova_ai_memory_threads;
create policy nova_ai_memory_threads_delete_own on public.nova_ai_memory_threads for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists nova_ai_memory_messages_select_own on public.nova_ai_memory_messages;
create policy nova_ai_memory_messages_select_own on public.nova_ai_memory_messages for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nova_ai_memory_messages_insert_opted_in on public.nova_ai_memory_messages;
create policy nova_ai_memory_messages_insert_opted_in on public.nova_ai_memory_messages for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.nova_ai_memory_settings s where s.user_id = (select auth.uid()) and s.memory_enabled = true));
drop policy if exists nova_ai_memory_messages_delete_own on public.nova_ai_memory_messages;
create policy nova_ai_memory_messages_delete_own on public.nova_ai_memory_messages for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists nova_ai_memory_facts_select_own on public.nova_ai_memory_facts;
create policy nova_ai_memory_facts_select_own on public.nova_ai_memory_facts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nova_ai_memory_facts_insert_opted_in on public.nova_ai_memory_facts;
create policy nova_ai_memory_facts_insert_opted_in on public.nova_ai_memory_facts for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.nova_ai_memory_settings s where s.user_id = (select auth.uid()) and s.memory_enabled = true));
drop policy if exists nova_ai_memory_facts_delete_own on public.nova_ai_memory_facts;
create policy nova_ai_memory_facts_delete_own on public.nova_ai_memory_facts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists nova_ai_learning_feedback_select_own on public.nova_ai_learning_feedback;
create policy nova_ai_learning_feedback_select_own on public.nova_ai_learning_feedback for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists nova_ai_learning_feedback_insert_opted_in on public.nova_ai_learning_feedback;
create policy nova_ai_learning_feedback_insert_opted_in on public.nova_ai_learning_feedback for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.nova_ai_memory_settings s where s.user_id = (select auth.uid()) and s.feedback_enabled = true));
drop policy if exists nova_ai_learning_feedback_update_own on public.nova_ai_learning_feedback;
create policy nova_ai_learning_feedback_update_own on public.nova_ai_learning_feedback for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.nova_ai_memory_settings s where s.user_id = (select auth.uid()) and s.feedback_enabled = true));
drop policy if exists nova_ai_learning_feedback_delete_own on public.nova_ai_learning_feedback;
create policy nova_ai_learning_feedback_delete_own on public.nova_ai_learning_feedback for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update on public.nova_ai_memory_settings to authenticated;
grant select, insert, update, delete on public.nova_ai_memory_threads to authenticated;
grant select, insert, delete on public.nova_ai_memory_messages to authenticated;
grant select, insert, delete on public.nova_ai_memory_facts to authenticated;
grant select, insert, update, delete on public.nova_ai_learning_feedback to authenticated;

create or replace function public.nova_ai_purge_expired_memory() returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_retention_days integer;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select retention_days into v_retention_days from public.nova_ai_memory_settings
    where user_id = v_user_id and memory_enabled = true;
  if v_retention_days is null then return; end if;
  delete from public.nova_ai_memory_messages where user_id = v_user_id
    and created_at < now() - make_interval(days => v_retention_days);
  delete from public.nova_ai_memory_threads where user_id = v_user_id
    and updated_at < now() - make_interval(days => v_retention_days);
  delete from public.nova_ai_memory_facts where user_id = v_user_id
    and created_at < now() - make_interval(days => v_retention_days);
end;
$$;

revoke all on function public.nova_ai_purge_expired_memory() from public, anon;
grant execute on function public.nova_ai_purge_expired_memory() to authenticated;

comment on table public.nova_ai_memory_settings is 'Explicit per-user opt-in for NOVA memory and feedback.';
comment on table public.nova_ai_memory_messages is 'Opt-in owner-scoped chat history; never store credentials.';
comment on table public.nova_ai_memory_facts is 'Facts explicitly saved by the user; never silently extracted by a model.';
comment on table public.nova_ai_learning_feedback is 'Owner feedback for offline evaluation only; not a training label by itself.';
