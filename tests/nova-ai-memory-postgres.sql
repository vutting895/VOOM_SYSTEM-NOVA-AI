-- Ephemeral PostgreSQL acceptance tests for NOVA memory migration.
-- The workflow supplies mock Supabase auth.users/auth.uid and authenticated roles.
begin;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.nova_ai_update_memory_settings(true, true, 30);
insert into public.nova_ai_memory_threads(id, user_id, title)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'A thread');
insert into public.nova_ai_memory_messages(user_id, thread_id, role, content)
values
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'user', 'Question'),
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'assistant', 'Answer');
do $$
declare v_roles text[];
begin
  select array_agg(role order by sequence_no) into v_roles from public.nova_ai_memory_messages
    where thread_id = '33333333-3333-4333-8333-333333333333';
  if v_roles is distinct from array['user', 'assistant']::text[] then raise exception 'message sequence is not stable: %', v_roles; end if;
end;
$$;
insert into public.nova_ai_memory_facts(user_id, category, content)
values ('11111111-1111-4111-8111-111111111111', 'project', 'NOVA');
insert into public.nova_ai_learning_feedback(user_id, response_id, rating, category, provider, model)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 'helpfulness', 'cloudflare-workers-ai', '@cf/meta/llama-3.2-3b-instruct');

-- Direct Data API writes must not bypass Worker credential screening.
do $
begin
  begin
    insert into public.nova_ai_memory_facts(user_id, category, content)
    values ('11111111-1111-4111-8111-111111111111', 'project', 'api_key=sk_test_123456789');
    raise exception 'secret fact unexpectedly persisted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.nova_ai_memory_threads(user_id, title)
    values ('11111111-1111-4111-8111-111111111111', 'password=supersecretvalue');
    raise exception 'secret thread title unexpectedly persisted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.nova_ai_memory_messages(user_id, thread_id, role, content)
    values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'user', 'Bearer abcdefghijklmnopqrstuvwxyz012345');
    raise exception 'secret message unexpectedly persisted';
  exception when invalid_parameter_value then null;
  end;
end;
$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.nova_ai_update_memory_settings(true, true, 30);
insert into public.nova_ai_memory_threads(id, user_id, title)
values ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'B thread');
do $$
begin
  if (select count(*) from public.nova_ai_memory_threads where id = '33333333-3333-4333-8333-333333333333') <> 0 then raise exception 'User B can read User A thread'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
begin
  if (select count(*) from public.nova_ai_memory_threads where id = '44444444-4444-4444-8444-444444444444') <> 0 then raise exception 'User A can read User B thread'; end if;
  if (select count(*) from public.nova_ai_memory_threads where id = '33333333-3333-4333-8333-333333333333') <> 1 then raise exception 'User A cannot read own thread'; end if;
end;
$$;
-- Direct table updates are also forced through atomic cleanup.
update public.nova_ai_memory_settings set memory_enabled = false, feedback_enabled = false
  where user_id = '11111111-1111-4111-8111-111111111111';
do $
begin
  if (select count(*) from public.nova_ai_memory_threads) <> 0
    or (select count(*) from public.nova_ai_memory_messages) <> 0
    or (select count(*) from public.nova_ai_memory_facts) <> 0
    or (select count(*) from public.nova_ai_learning_feedback) <> 0 then raise exception 'direct settings update did not clean memory'; end if;
end;
$;

-- Re-enable and prove the supported RPC path also removes all data atomically.
select public.nova_ai_update_memory_settings(true, true, 30);
insert into public.nova_ai_memory_threads(id, user_id, title)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'RPC opt-out test');
insert into public.nova_ai_memory_messages(user_id, thread_id, role, content)
values ('11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666', 'user', 'test');
insert into public.nova_ai_memory_facts(user_id, category, content)
values ('11111111-1111-4111-8111-111111111111', 'project', 'test');
insert into public.nova_ai_learning_feedback(user_id, response_id, rating, category, provider)
values ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 5, 'accuracy', 'unknown');
select public.nova_ai_update_memory_settings(false, false, 30);
do $
begin
  if (select count(*) from public.nova_ai_memory_threads) <> 0
    or (select count(*) from public.nova_ai_memory_messages) <> 0
    or (select count(*) from public.nova_ai_memory_facts) <> 0
    or (select count(*) from public.nova_ai_learning_feedback) <> 0 then raise exception 'opt-out did not clear the owner data'; end if;
  begin
    insert into public.nova_ai_memory_threads(user_id, title) values ('11111111-1111-4111-8111-111111111111', 'must be blocked');
    raise exception 'memory write unexpectedly succeeded after opt-out';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select public.nova_ai_update_memory_settings(false, true, 30);
insert into public.nova_ai_learning_feedback(user_id, response_id, rating, category, provider, created_at)
values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 4, 'accuracy', 'unknown', now() - interval '60 days');
select public.nova_ai_purge_expired_memory();
do $$
begin
  if (select count(*) from public.nova_ai_learning_feedback) <> 0 then raise exception 'expired feedback was not purged while memory was disabled'; end if;
end;
$$;
select public.nova_ai_update_memory_settings(true, true, 30);
insert into public.nova_ai_memory_threads(id, user_id, title, updated_at)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Expired', now() - interval '60 days');
insert into public.nova_ai_memory_messages(user_id, thread_id, role, content, created_at)
values ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'user', 'old message', now() - interval '60 days');
insert into public.nova_ai_memory_facts(user_id, category, content, created_at)
values ('11111111-1111-4111-8111-111111111111', 'project', 'old fact', now() - interval '60 days');
select public.nova_ai_purge_expired_memory();
do $$
begin
  if (select count(*) from public.nova_ai_memory_threads where id = '55555555-5555-4555-8555-555555555555') <> 0
    or (select count(*) from public.nova_ai_memory_messages) <> 0
    or (select count(*) from public.nova_ai_memory_facts) <> 0 then raise exception 'expired memory was not purged'; end if;
end;
$$;
rollback;
