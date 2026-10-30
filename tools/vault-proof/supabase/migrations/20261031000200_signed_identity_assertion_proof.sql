-- LOCAL PROOF ONLY.
-- Disposable HMAC-SHA-256 signed identity assertion verifier.
-- Never apply this migration to a hosted or production Supabase project.
-- No Worker Secret, Hyperdrive resource, customer key, or runtime route is provisioned.

create extension if not exists pgcrypto with schema extensions;

do $pgcrypto_hmac$
declare
  v_count integer;
  v_hmac_oid oid;
begin
  select count(*)::integer, (array_agg(p.oid order by p.oid))[1]
    into v_count, v_hmac_oid
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'extensions'
     and p.proname = 'hmac'
     and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'bytea, bytea, text';

  if v_count <> 1 or v_hmac_oid is null then
    raise exception 'expected exactly one extensions.hmac(bytea, bytea, text); found %', v_count;
  end if;

  grant usage on schema extensions to nova_vault_fn_owner;
  execute pg_catalog.format(
    'grant execute on function %s to nova_vault_fn_owner',
    v_hmac_oid::regprocedure
  );
  execute pg_catalog.format(
    'revoke execute on function %s from public, anon, authenticated, nova_vault_api',
    v_hmac_oid::regprocedure
  );
end;
$pgcrypto_hmac$;

create table nova_vault_private.assertion_keys (
  key_id text primary key check (key_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  secret_id uuid not null unique,
  key_status text not null check (key_status in ('ACTIVE', 'VERIFY_ONLY', 'REVOKED'))
);

create table nova_vault_private.assertion_nonce_replay (
  key_id text not null references nova_vault_private.assertion_keys(key_id),
  nonce uuid not null,
  operation_id uuid not null,
  expires_at bigint not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (key_id, nonce)
);

alter table nova_vault_private.assertion_keys owner to nova_vault_fn_owner;
alter table nova_vault_private.assertion_nonce_replay owner to nova_vault_fn_owner;

revoke all on table nova_vault_private.assertion_keys
  from public, anon, authenticated, service_role, nova_vault_api;
revoke all on table nova_vault_private.assertion_nonce_replay
  from public, anon, authenticated, service_role, nova_vault_api;

-- This is a synthetic 32-byte test key encoded as Base64. It is local test
-- material, not a generated key for any real environment.
insert into nova_vault_private.assertion_keys(key_id, secret_id, key_status)
values (
  'proof-hmac-v1',
  vault.create_secret(
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    'nova-vault-proof-hmac-v1',
    'Synthetic 32-byte HMAC key for disposable local proof only'
  ),
  'ACTIVE'
);

create or replace function nova_vault_private.constant_time_mac_equal(
  p_expected bytea,
  p_supplied bytea
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  v_difference integer := 0;
  v_index integer;
begin
  if pg_catalog.octet_length(p_expected) <> 32
     or pg_catalog.octet_length(p_supplied) <> 32 then
    return false;
  end if;

  -- Fixed 32-byte accumulation, without an early exit on the first mismatch.
  -- This is not a formal constant-time guarantee for the PostgreSQL runtime.
  for v_index in 0..31 loop
    v_difference := v_difference
      | (pg_catalog.get_byte(p_expected, v_index)
         # pg_catalog.get_byte(p_supplied, v_index));
  end loop;

  return v_difference = 0;
end;
$function$;

alter function nova_vault_private.constant_time_mac_equal(bytea, bytea)
  owner to nova_vault_fn_owner;
revoke all on function nova_vault_private.constant_time_mac_equal(bytea, bytea)
  from public, anon, authenticated, service_role, nova_vault_api;

-- The unsigned accessor is an internal helper only. The runtime login can no
-- longer assert owner/tenant UUIDs directly and must use the signed verifier.
revoke all on function nova_vault_private.get_secret_for_connection_use(
  uuid, uuid, uuid, text, text, bigint
) from public, anon, authenticated, service_role, nova_vault_api;

create or replace function nova_vault_private.get_secret_for_connection_use_signed(
  p_version integer,
  p_issuer text,
  p_audience text,
  p_key_id text,
  p_owner_id uuid,
  p_tenant_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_environment text,
  p_capability text,
  p_generation bigint,
  p_operation_id uuid,
  p_nonce uuid,
  p_issued_at bigint,
  p_expires_at bigint,
  p_mac bytea
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now bigint;
  v_key_base64 text;
  v_key_bytes bytea;
  v_message text;
  v_expected_mac bytea;
  v_inserted integer;
  v_secret text;
begin
  -- Fixed protocol version, issuer, audience, capability and bounded claim shapes.
  if p_version is distinct from 1
     or p_issuer is distinct from 'voom-system-hub'
     or p_audience is distinct from 'nova-vault-access'
     or p_key_id is null
     or p_key_id !~ '^[A-Za-z0-9_-]{1,64}$'
     or p_owner_id is null
     or p_tenant_id is null
     or p_connection_id is null
     or p_provider is null
     or p_provider !~ '^[a-z0-9_-]{1,64}$'
     or p_environment is null
     or p_environment !~ '^[a-z0-9_-]{1,32}$'
     or p_capability is distinct from 'secret.use.readonly'
     or p_generation is null
     or p_generation < 1
     or p_operation_id is null
     or p_nonce is null
     or p_issued_at is null
     or p_expires_at is null
     or p_mac is null
     or pg_catalog.octet_length(p_mac) <> 32 then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  v_now := floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint;
  if p_issued_at < v_now - 60
     or p_issued_at > v_now + 5
     or p_expires_at <= v_now
     or p_expires_at <= p_issued_at
     or p_expires_at > p_issued_at + 60 then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  -- The caller supplies only a key ID. The Vault reference and key bytes stay
  -- inside this non-login SECURITY DEFINER boundary.
  select d.decrypted_secret
    into v_key_base64
    from nova_vault_private.assertion_keys as k
    join vault.decrypted_secrets as d
      on d.id = k.secret_id
   where k.key_id = p_key_id
     and k.key_status in ('ACTIVE', 'VERIFY_ONLY');

  if not found or v_key_base64 is null then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  begin
    v_key_bytes := pg_catalog.decode(v_key_base64, 'base64');
  exception when others then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end;

  if pg_catalog.octet_length(v_key_bytes) <> 32 then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  -- Fixed UTF-8 canonical message and field order from the version-1 design.
  -- This local synthetic proof requires a tenant binding in its fixture model.
  v_message :=
      'NOVA-VAULT-ASSERTION-V1' || E'\n'
    || p_issuer || E'\n'
    || p_audience || E'\n'
    || p_key_id || E'\n'
    || p_owner_id::text || E'\n'
    || p_tenant_id::text || E'\n'
    || p_connection_id::text || E'\n'
    || p_provider || E'\n'
    || p_environment || E'\n'
    || p_capability || E'\n'
    || p_generation::text || E'\n'
    || p_operation_id::text || E'\n'
    || p_nonce::text || E'\n'
    || p_issued_at::text || E'\n'
    || p_expires_at::text;

  v_expected_mac := extensions.hmac(
    pg_catalog.convert_to(v_message, 'UTF8'),
    v_key_bytes,
    'sha256'
  );

  if not nova_vault_private.constant_time_mac_equal(v_expected_mac, p_mac) then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  -- Atomic nonce replay guard, unique on key_id + nonce. Operation-level
  -- idempotency of an external provider call remains a separate Hub concern.
  insert into nova_vault_private.assertion_nonce_replay(
    key_id, nonce, operation_id, expires_at
  )
  values (p_key_id, p_nonce, p_operation_id, p_expires_at)
  on conflict (key_id, nonce) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  -- Re-check authoritative local owner/tenant/connection/provider/environment/
  -- generation/lifecycle registry after the cryptographic assertion validates.
  begin
    v_secret := nova_vault_private.get_secret_for_connection_use(
      p_owner_id,
      p_tenant_id,
      p_connection_id,
      p_provider,
      p_environment,
      p_generation
    );
  exception when sqlstate 'P0002' then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end;

  return v_secret;
end;
$function$;

alter function nova_vault_private.get_secret_for_connection_use_signed(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea
) owner to nova_vault_fn_owner;

revoke all on function nova_vault_private.get_secret_for_connection_use_signed(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea
) from public, anon, authenticated, service_role;

grant execute on function nova_vault_private.get_secret_for_connection_use_signed(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea
) to nova_vault_api;
