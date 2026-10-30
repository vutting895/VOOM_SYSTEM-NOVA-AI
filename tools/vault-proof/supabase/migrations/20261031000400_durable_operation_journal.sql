-- LOCAL PROOF ONLY. Never apply to a hosted or production Supabase project.
-- Durable operation journal for at-most-once provider dispatch and safe reconciliation.
-- A lease expiry is NOT permission to retry an external side effect: it becomes OUTCOME_UNKNOWN.

create table nova_vault_private.operation_journal (
  key_id text not null references nova_vault_private.assertion_keys(key_id),
  operation_id uuid not null,
  owner_id uuid not null,
  tenant_id uuid not null,
  connection_id uuid not null,
  provider text not null check (provider ~ '^[a-z0-9_-]{1,64}$'),
  environment text not null check (environment ~ '^[a-z0-9_-]{1,32}$'),
  request_fingerprint bytea not null check (pg_catalog.octet_length(request_fingerprint) = 32),
  state text not null check (state in ('IN_PROGRESS', 'SUCCEEDED', 'OUTCOME_UNKNOWN', 'FAILED_FINAL')),
  lease_token uuid,
  lease_expires_at timestamptz,
  sanitized_result jsonb,
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tenant_id, operation_id),
  check (
    (state = 'IN_PROGRESS' and lease_token is not null and lease_expires_at is not null and sanitized_result is null)
    or (state = 'SUCCEEDED' and lease_token is null and lease_expires_at is null and sanitized_result is not null)
    or (state in ('OUTCOME_UNKNOWN', 'FAILED_FINAL') and lease_token is null and lease_expires_at is null)
  ),
  check (
    sanitized_result is null or (
      pg_catalog.jsonb_typeof(sanitized_result) = 'object'
      and sanitized_result ? 'outcome'
      and sanitized_result->>'outcome' = 'succeeded'
      and (sanitized_result - array['outcome','provider_reference','completed_at']::text[]) = '{}'::jsonb
    )
  )
);
alter table nova_vault_private.operation_journal owner to nova_vault_fn_owner;
revoke all on table nova_vault_private.operation_journal from public, anon, authenticated, service_role, nova_vault_api;

create or replace function nova_vault_private.claim_operation(
  p_key_id text,
  p_operation_id uuid,
  p_owner_id uuid,
  p_tenant_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_environment text,
  p_request_fingerprint bytea,
  p_lease_token uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row nova_vault_private.operation_journal%rowtype;
  v_inserted integer;
begin
  if p_key_id is null or p_operation_id is null or p_owner_id is null
     or p_tenant_id is null or p_connection_id is null
     or p_provider is null or p_environment is null
     or p_request_fingerprint is null
     or pg_catalog.octet_length(p_request_fingerprint) <> 32
     or p_lease_token is null then
    raise exception 'invalid_operation_claim' using errcode = '22023';
  end if;

  insert into nova_vault_private.operation_journal (
    key_id, operation_id, owner_id, tenant_id, connection_id,
    provider, environment, request_fingerprint, state,
    lease_token, lease_expires_at
  ) values (
    p_key_id, p_operation_id, p_owner_id, p_tenant_id, p_connection_id,
    p_provider, p_environment, p_request_fingerprint, 'IN_PROGRESS',
    p_lease_token, pg_catalog.clock_timestamp() + interval '30 seconds'
  ) on conflict (tenant_id, operation_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return 'CLAIMED';
  end if;

  select * into strict v_row
    from nova_vault_private.operation_journal
   where tenant_id = p_tenant_id and operation_id = p_operation_id
   for update;

  if v_row.owner_id <> p_owner_id
     or v_row.tenant_id <> p_tenant_id
     or v_row.connection_id <> p_connection_id
     or v_row.provider <> p_provider
     or v_row.environment <> p_environment
     or v_row.request_fingerprint <> p_request_fingerprint then
    raise exception 'operation_identity_or_fingerprint_conflict'
      using errcode = '22023';
  end if;

  if v_row.state = 'SUCCEEDED' then return 'REPLAY_SUCCEEDED'; end if;
  if v_row.state = 'FAILED_FINAL' then return 'FAILED_FINAL'; end if;
  if v_row.state = 'OUTCOME_UNKNOWN' then return 'RECONCILIATION_REQUIRED'; end if;

  if v_row.lease_expires_at <= pg_catalog.clock_timestamp() then
    update nova_vault_private.operation_journal
       set state = 'OUTCOME_UNKNOWN',
           lease_token = null,
           lease_expires_at = null,
           updated_at = pg_catalog.clock_timestamp(),
           safe_error_code = 'LEASE_EXPIRED_OUTCOME_UNKNOWN'
     where tenant_id = p_tenant_id and operation_id = p_operation_id;
    return 'RECONCILIATION_REQUIRED';
  end if;

  return 'IN_PROGRESS';
end;
$function$;
alter function nova_vault_private.claim_operation(text,uuid,uuid,uuid,uuid,text,text,bytea,uuid)
  owner to nova_vault_fn_owner;

create or replace function nova_vault_private.complete_operation(
  p_key_id text,
  p_operation_id uuid,
  p_lease_token uuid,
  p_sanitized_result jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if p_sanitized_result is null
     or pg_catalog.jsonb_typeof(p_sanitized_result) <> 'object'
     or p_sanitized_result->>'outcome' <> 'succeeded'
     or (p_sanitized_result - array['outcome','provider_reference','completed_at']::text[]) <> '{}'::jsonb
     or (p_sanitized_result ? 'provider_reference' and pg_catalog.jsonb_typeof(p_sanitized_result->'provider_reference') <> 'string')
     or (p_sanitized_result ? 'completed_at' and pg_catalog.jsonb_typeof(p_sanitized_result->'completed_at') <> 'string') then
    raise exception 'unsafe_operation_result' using errcode = '22023';
  end if;

  update nova_vault_private.operation_journal
     set state = 'SUCCEEDED',
         lease_token = null,
         lease_expires_at = null,
         sanitized_result = p_sanitized_result,
         safe_error_code = null,
         updated_at = pg_catalog.clock_timestamp()
   where key_id = p_key_id
     and operation_id = p_operation_id
     and state = 'IN_PROGRESS'
     and lease_token = p_lease_token;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'operation_lease_fenced' using errcode = '40001';
  end if;
end;
$function$;
alter function nova_vault_private.complete_operation(text,uuid,uuid,jsonb)
  owner to nova_vault_fn_owner;

create or replace function nova_vault_private.mark_operation_unknown(
  p_key_id text,
  p_operation_id uuid,
  p_lease_token uuid,
  p_safe_error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if p_safe_error_code is null or p_safe_error_code !~ '^[A-Z0-9_]{1,64}$' then
    raise exception 'invalid_safe_error_code' using errcode = '22023';
  end if;
  update nova_vault_private.operation_journal
     set state = 'OUTCOME_UNKNOWN',
         lease_token = null,
         lease_expires_at = null,
         safe_error_code = p_safe_error_code,
         updated_at = pg_catalog.clock_timestamp()
   where key_id = p_key_id
     and operation_id = p_operation_id
     and state = 'IN_PROGRESS'
     and lease_token = p_lease_token;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'operation_lease_fenced' using errcode = '40001';
  end if;
end;
$function$;
alter function nova_vault_private.mark_operation_unknown(text,uuid,uuid,text)
  owner to nova_vault_fn_owner;

create or replace function nova_vault_private.resolve_operation_unknown(
  p_key_id text,
  p_operation_id uuid,
  p_request_fingerprint bytea,
  p_resolution text,
  p_sanitized_result jsonb,
  p_safe_error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  if p_request_fingerprint is null or pg_catalog.octet_length(p_request_fingerprint) <> 32
     or p_resolution not in ('SUCCEEDED','FAILED_FINAL') then
    raise exception 'invalid_reconciliation_resolution' using errcode = '22023';
  end if;
  if p_resolution = 'SUCCEEDED' then
    if p_sanitized_result is null
       or pg_catalog.jsonb_typeof(p_sanitized_result) <> 'object'
       or p_sanitized_result->>'outcome' <> 'succeeded'
       or (p_sanitized_result - array['outcome','provider_reference','completed_at']::text[]) <> '{}'::jsonb then
      raise exception 'unsafe_operation_result' using errcode = '22023';
    end if;
  elsif p_sanitized_result is not null
     or p_safe_error_code is null
     or p_safe_error_code !~ '^[A-Z0-9_]{1,64}$' then
    raise exception 'invalid_final_failure' using errcode = '22023';
  end if;

  update nova_vault_private.operation_journal
     set state = p_resolution,
         sanitized_result = p_sanitized_result,
         safe_error_code = p_safe_error_code,
         updated_at = pg_catalog.clock_timestamp()
   where key_id = p_key_id
     and operation_id = p_operation_id
     and request_fingerprint = p_request_fingerprint
     and state = 'OUTCOME_UNKNOWN';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'operation_reconciliation_conflict' using errcode = '40001';
  end if;
end;
$function$;
alter function nova_vault_private.resolve_operation_unknown(text,uuid,bytea,text,jsonb,text)
  owner to nova_vault_fn_owner;

create or replace function nova_vault_private.get_operation_result(
  p_operation_id uuid,
  p_owner_id uuid,
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select j.sanitized_result
    from nova_vault_private.operation_journal as j
   where j.operation_id = p_operation_id
     and j.owner_id = p_owner_id
     and j.tenant_id = p_tenant_id
     and j.state = 'SUCCEEDED';
$function$;
alter function nova_vault_private.get_operation_result(uuid,uuid,uuid)
  owner to nova_vault_fn_owner;

revoke all on function nova_vault_private.claim_operation(text,uuid,uuid,uuid,uuid,text,text,bytea,uuid) from public, anon, authenticated, service_role;
revoke all on function nova_vault_private.complete_operation(text,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function nova_vault_private.mark_operation_unknown(text,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function nova_vault_private.resolve_operation_unknown(text,uuid,bytea,text,jsonb,text) from public, anon, authenticated, service_role, nova_vault_api;
revoke all on function nova_vault_private.get_operation_result(uuid,uuid,uuid) from public, anon, authenticated, service_role;

grant execute on function nova_vault_private.claim_operation(text,uuid,uuid,uuid,uuid,text,text,bytea,uuid) to nova_vault_api;
grant execute on function nova_vault_private.complete_operation(text,uuid,uuid,jsonb) to nova_vault_api;
grant execute on function nova_vault_private.mark_operation_unknown(text,uuid,uuid,text) to nova_vault_api;
grant execute on function nova_vault_private.get_operation_result(uuid,uuid,uuid) to nova_vault_api;

alter default privileges for role nova_vault_fn_owner
  in schema nova_vault_private
  revoke execute on functions from public;
