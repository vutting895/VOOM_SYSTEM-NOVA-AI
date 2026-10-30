-- LOCAL PROOF ONLY.
-- This file is intentionally outside the canonical supabase/migrations directory.
-- Never apply it to a hosted Supabase project.

create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'nova_vault_fn_owner') then
    create role nova_vault_fn_owner
      nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'nova_vault_api') then
    create role nova_vault_api
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$roles$;

-- The local migration runner receives SET membership so it can assign object ownership
-- to the dedicated non-login owner. This is local-only proof setup, not a runtime grant.
grant nova_vault_fn_owner to current_user with set true;
-- The disposable proof runner receives one explicit SET-only membership in the
-- runtime role so pgTAP can exercise its effective privileges. Local test only.
grant nova_vault_api to current_user with set true;

create schema nova_vault_private authorization nova_vault_fn_owner;

create table nova_vault_private.secret_bindings (
  tenant_id uuid not null,
  owner_id uuid not null,
  connection_id uuid not null,
  provider text not null,
  environment text not null,
  secret_id uuid not null unique,
  generation bigint not null check (generation > 0),
  status text not null check (status in ('READY', 'ROTATION_REQUIRED', 'REVOKED')),
  primary key (tenant_id, connection_id)
);

alter table nova_vault_private.secret_bindings owner to nova_vault_fn_owner;

-- The function owner may read the encrypted Vault-backed view, but the runtime
-- login receives no direct USAGE on schema vault and no table/view privileges.
grant usage on schema vault to nova_vault_fn_owner;
grant select on table vault.decrypted_secrets to nova_vault_fn_owner;

-- Synthetic fixtures only. These are not real API keys and must never be reused.
insert into nova_vault_private.secret_bindings (
  tenant_id, owner_id, connection_id, provider, environment,
  secret_id, generation, status
)
values
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    vault.create_secret(
      'SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-A',
      'nova-vault-proof-customer-a',
      'Synthetic fixture only; not a provider credential'
    ),
    1, 'READY'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000102',
    'proof_provider', 'demo',
    vault.create_secret(
      'SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-B',
      'nova-vault-proof-customer-b',
      'Synthetic fixture only; not a provider credential'
    ),
    1, 'READY'
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000103',
    'proof_provider', 'demo',
    vault.create_secret(
      'SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-ROTATION-REQUIRED',
      'nova-vault-proof-rotation-required',
      'Synthetic fixture only; deliberately not READY'
    ),
    1, 'ROTATION_REQUIRED'
  );

-- This disposable project proves the directly revocable Vault access
-- boundary for PUBLIC, anon, authenticated, and the dedicated runtime login.
-- Supabase-managed Vault objects are generally owned by supabase_admin.
-- Do not attempt to revoke service_role grants made by that owner: postgres
-- cannot change those platform-managed ACL entries. Instead, the dedicated
-- runtime role must not be a member of service_role and must use only the
-- private accessor granted below.
revoke all on schema vault from public, anon, authenticated, nova_vault_api;
revoke all on all tables in schema vault from public, anon, authenticated, nova_vault_api;

-- The decrypted_secrets view invokes this internal function. Grant exactly this
-- dependency to the non-login function owner, not to nova_vault_api. Resolve the
-- catalog signature instead of assuming a fixed overload on every Vault version.
do $vault_decrypt_grant$
declare
  v_match_count integer;
  v_function_oid oid;
begin
  select count(*)::integer, (array_agg(p.oid order by p.oid))[1]
    into v_match_count, v_function_oid
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'vault'
     and p.proname = '_crypto_aead_det_decrypt';

  if v_match_count <> 1 or v_function_oid is null then
    raise exception 'expected exactly one vault decrypt helper; found %', v_match_count;
  end if;

  execute format(
    'grant execute on function %s to nova_vault_fn_owner',
    v_function_oid::regprocedure
  );
end;
$vault_decrypt_grant$;

-- The runtime login must not call any Vault extension function directly.
do $vault_runtime_function_guard$
declare
  v_function_oid oid;
begin
  for v_function_oid in
    select p.oid
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'vault'
       and p.proname = '_crypto_aead_det_decrypt'
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, nova_vault_api',
      v_function_oid::regprocedure
    );
  end loop;
end;
$vault_runtime_function_guard$;

create or replace function nova_vault_private.get_secret_for_connection_use(
  p_authenticated_owner_id uuid,
  p_authenticated_tenant_id uuid,
  p_connection_id uuid,
  p_provider text,
  p_environment text,
  p_expected_generation bigint
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_secret text;
begin
  select d.decrypted_secret
    into v_secret
    from nova_vault_private.secret_bindings as b
    join vault.decrypted_secrets as d
      on d.id = b.secret_id
   where b.owner_id = p_authenticated_owner_id
     and b.tenant_id = p_authenticated_tenant_id
     and b.connection_id = p_connection_id
     and b.provider = p_provider
     and b.environment = p_environment
     and b.generation = p_expected_generation
     and b.status = 'READY';

  if not found or v_secret is null or length(v_secret) = 0 then
    raise exception 'secret_not_available'
      using errcode = 'P0002';
  end if;

  return v_secret;
end;
$function$;

alter function nova_vault_private.get_secret_for_connection_use(
  uuid, uuid, uuid, text, text, bigint
) owner to nova_vault_fn_owner;

-- Only the trusted Hub runtime role may call this one function.
revoke all on schema nova_vault_private from public, anon, authenticated, service_role;
revoke all on table nova_vault_private.secret_bindings from public, anon, authenticated, service_role, nova_vault_api;
revoke all on function nova_vault_private.get_secret_for_connection_use(
  uuid, uuid, uuid, text, text, bigint
) from public, anon, authenticated, service_role;

grant usage on schema nova_vault_private to nova_vault_api;
grant execute on function nova_vault_private.get_secret_for_connection_use(
  uuid, uuid, uuid, text, text, bigint
) to nova_vault_api;

-- Future functions created by this non-login owner must not inherit PUBLIC EXECUTE.
alter default privileges for role nova_vault_fn_owner
  in schema nova_vault_private
  revoke execute on functions from public;

alter default privileges for role nova_vault_fn_owner
  in schema nova_vault_private
  revoke all on tables from public;


-- Signed identity assertion proof (disposable local project only).
-- This models the candidate in NOVA-VAULT-SIGNED-IDENTITY-ASSERTION.md.
-- It does not provision Worker secrets, configure Hyperdrive, or touch hosted projects.
create extension if not exists pgcrypto with schema extensions;

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

-- Store only a Vault reference in the private registry. This is a synthetic
-- 32-byte key for local tests and is not a deployable or production key.
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

-- Resolve and grant only the exact pgcrypto HMAC overload used by the verifier.
-- Fail closed if pgcrypto is absent or installed into an unexpected schema.
grant usage on schema extensions to nova_vault_fn_owner;
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

  -- Fixed 32-byte accumulation: no early exit on the first differing byte.
  -- This does not claim formally constant-time PostgreSQL execution.
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

-- A raw accessor accepting caller-supplied owner/tenant UUIDs must not be
-- executable by the runtime login. It is now an internal helper for the
-- authenticated SECURITY DEFINER verifier only.
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
  -- Protocol and claim validation precede key lookup or Vault access.
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

  v_now := pg_catalog.floor(
    pg_catalog.extract(epoch from pg_catalog.clock_timestamp())
  )::bigint;

  if p_issued_at < v_now - 60
     or p_issued_at > v_now + 5
     or p_expires_at <= v_now
     or p_expires_at <= p_issued_at
     or p_expires_at > p_issued_at + 60 then
    raise exception 'invalid_assertion'
      using errcode = '28000';
  end if;

  -- Resolve key ID through the private registry. The caller cannot provide
  -- a Vault secret ID or the key bytes.
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

  -- Fixed UTF-8 canonical message. UUIDs and integers are typed and
  -- serialized by PostgreSQL into canonical text; optional tenant is not
  -- permitted in this synthetic owner+tenant proof.
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

  -- Atomic nonce replay guard. A duplicate key_id+nonce is rejected.
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

  -- Keep the existing owner/tenant/provider/environment/generation/state
  -- re-check as a second authorization boundary after cryptographic proof.
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
