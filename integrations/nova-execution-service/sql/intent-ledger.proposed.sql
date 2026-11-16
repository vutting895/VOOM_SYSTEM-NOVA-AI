-- PROPOSAL ONLY — NOT AN APPLIED SUPABASE MIGRATION.
-- Review this SQL, generate a real migration through the Supabase CLI, and apply
-- only to an isolated Supabase development branch after explicit review.
-- No production database has been changed.

create table if not exists public.nova_execution_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  environment text not null default 'demo' check (environment = 'demo'),
  symbol text not null check (symbol ~ '^[A-Z0-9._/-]{2,32}$'),
  side text not null check (side in ('BUY', 'SELL')),
  volume numeric(18,8) not null check (volume > 0),
  stop_loss numeric(20,8) not null check (stop_loss > 0),
  take_profit numeric(20,8) not null check (take_profit > 0),
  status text not null default 'received'
    check (status in (
      'received', 'risk_rejected', 'risk_approved', 'queued',
      'dispatching', 'submitted', 'acknowledged', 'partially_filled',
      'filled', 'cancelled', 'expired', 'failed', 'blocked'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nova_execution_intents_user_idempotency_uq unique (user_id, idempotency_key),
  constraint nova_execution_intents_id_user_uq unique (id, user_id)
);

create index if not exists nova_execution_intents_user_created_idx
  on public.nova_execution_intents (user_id, created_at desc);
create index if not exists nova_execution_intents_status_created_idx
  on public.nova_execution_intents (status, created_at)
  where status in ('received', 'risk_approved', 'queued', 'dispatching');

create table if not exists public.nova_execution_audit_events (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null
    check (event_type in (
      'intent_received', 'idempotency_replay', 'idempotency_conflict',
      'risk_rejected', 'risk_approved', 'dispatch_started',
      'broker_submitted', 'broker_acknowledged', 'partial_fill',
      'filled', 'cancelled', 'expired', 'failed', 'kill_switch_activated'
    )),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  constraint nova_execution_audit_intent_owner_fk
    foreign key (intent_id, user_id)
    references public.nova_execution_intents (id, user_id) on delete restrict
);

create index if not exists nova_execution_audit_owner_created_idx
  on public.nova_execution_audit_events (user_id, created_at desc);
create index if not exists nova_execution_audit_intent_created_idx
  on public.nova_execution_audit_events (intent_id, created_at);

-- Backend-only: no browser role can read or write these records.
alter table public.nova_execution_intents enable row level security;
alter table public.nova_execution_audit_events enable row level security;
revoke all on table public.nova_execution_intents from anon, authenticated;
revoke all on table public.nova_execution_audit_events from anon, authenticated;
grant select, insert, update on table public.nova_execution_intents to service_role;
grant select, insert on table public.nova_execution_audit_events to service_role;

-- SECURITY INVOKER only. The service-role secret must remain in Worker secrets.
create or replace function public.nova_create_execution_intent(
  p_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_symbol text,
  p_side text,
  p_volume numeric,
  p_stop_loss numeric,
  p_take_profit numeric
)
returns table (intent_id uuid, outcome text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intent_id uuid;
  v_existing_hash text;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id_required';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if p_symbol is null or p_symbol !~ '^[A-Z0-9._/-]{2,32}$' then
    raise exception using errcode = '22023', message = 'invalid_symbol';
  end if;
  if p_side is null or p_side not in ('BUY', 'SELL') then
    raise exception using errcode = '22023', message = 'invalid_side';
  end if;
  if p_volume is null or p_volume <= 0
     or p_stop_loss is null or p_stop_loss <= 0
     or p_take_profit is null or p_take_profit <= 0 then
    raise exception using errcode = '22023', message = 'invalid_order_parameters';
  end if;

  insert into public.nova_execution_intents (
    user_id, idempotency_key, request_hash, environment,
    symbol, side, volume, stop_loss, take_profit, status
  ) values (
    p_user_id, p_idempotency_key, p_request_hash, 'demo',
    p_symbol, p_side, p_volume, p_stop_loss, p_take_profit, 'received'
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_intent_id;

  if v_intent_id is not null then
    insert into public.nova_execution_audit_events (intent_id, user_id, event_type, details)
    values (v_intent_id, p_user_id, 'intent_received',
      jsonb_build_object('request_hash', p_request_hash, 'environment', 'demo'));
    return query select v_intent_id, 'created'::text;
    return;
  end if;

  select i.id, i.request_hash into v_intent_id, v_existing_hash
    from public.nova_execution_intents as i
   where i.user_id = p_user_id and i.idempotency_key = p_idempotency_key;

  if v_intent_id is null then
    raise exception using errcode = '40001', message = 'idempotency_claim_retry';
  end if;

  if v_existing_hash <> p_request_hash then
    insert into public.nova_execution_audit_events (intent_id, user_id, event_type, details)
    values (v_intent_id, p_user_id, 'idempotency_conflict',
      jsonb_build_object('incoming_request_hash', p_request_hash));
    return query select v_intent_id, 'conflict'::text;
    return;
  end if;

  insert into public.nova_execution_audit_events (intent_id, user_id, event_type, details)
  values (v_intent_id, p_user_id, 'idempotency_replay',
    jsonb_build_object('request_hash', p_request_hash));
  return query select v_intent_id, 'replayed'::text;
end;
$function$;

revoke all on function public.nova_create_execution_intent(
  uuid, text, text, text, text, numeric, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.nova_create_execution_intent(
  uuid, text, text, text, text, numeric, numeric, numeric
) to service_role;

comment on table public.nova_execution_intents is
  'Backend-only, Demo-only idempotent trade intent ledger. A row does not authorize or prove broker execution.';
comment on table public.nova_execution_audit_events is
  'Backend-only audit events for NOVA execution intents; contains no credentials.';
