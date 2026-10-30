-- LOCAL PROOF ONLY.
-- This migration is outside the canonical Supabase migrations directory.
-- Never apply it to a hosted project.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

grant usage on schema extensions to nova_vault_fn_owner;
grant execute on function extensions.hmac(bytea, bytea, text) to nova_vault_fn_owner;

create table nova_vault_private.assertion_verifier_keys (
  key_id text primary key check (key_id ~ '^[a-z0-9_-]{1,64}$'),
  vault_secret_id uuid not null unique,
  enabled boolean not null default true,
  not_before timestamptz not null default clock_timestamp(),
  not_after timestamptz
);

alter table nova_vault_private.assertion_verifier_keys owner to nova_vault_fn_owner;

create table nova_vault_private.assertion_nonce_consumption (
  key_id text not null,
  nonce uuid not null,
  operation_id uuid not null,
  expires_at bigint not null,
  consumed_at timestamptz not null default clock_timestamp(),
  primary key (key_id, nonce)
);

alter table nova_vault_private.assertion_nonce_consumption owner to nova_vault_fn_owner;

-- One synthetic verifier key for local proof. This is not a production key.
do $seed_verifier$
declare
  v_secret_id uuid;
begin
  v_secret_id := vault.create_secret(
    'LOCAL-ONLY-HMAC-KEY-32-BYTE-0123',
    'nova-vault-local-proof-hmac-v1',
    'Synthetic local proof key only. Never reuse outside this disposable database.'
  );
  perform pg_catalog.set_config(
    'nova_vault_proof.verifier_secret_id',
    v_secret_id::text,
    false
  );
end;
$seed_verifier$;

set role nova_vault_fn_owner;
insert into nova_vault_private.assertion_verifier_keys (
  key_id, vault_secret_id, enabled, not_before, not_after
)
values (
  'local-proof-v1',
  current_setting('nova_vault_proof.verifier_secret_id')::uuid,
  true,
  clock_timestamp() - interval '1 minute',
  null
);
reset role;

create or replace function nova_vault_private.constant_time_equal_32(
  p_left bytea,
  p_right bytea
)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $function$
declare
  v_index integer;
  v_difference integer := 0;
begin
  if pg_catalog.octet_length(p_left) <> 32
     or pg_catalog.octet_length(p_right) <> 32 then
    return false;
  end if;

  for v_index in 0..31 loop
    v_difference := v_difference
      | (pg_catalog.get_byte(p_left, v_index) # pg_catalog.get_byte(p_right, v_index));
  end loop;

  return v_difference = 0;
end;
$function$;

alter function nova_vault_private.constant_time_equal_32(bytea, bytea)
  owner to nova_vault_fn_owner;

create or replace function nova_vault_private.get_secret_for_signed_connection_use(
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
  v_key text;
  v_message text;
  v_expected_mac bytea;
  v_inserted integer;
  v_secret text;
begin
  if p_version is distinct from 1
     or p_issuer is distinct from 'voom-system-hub'
     or p_audience is distinct from 'nova-vault-access'
     or p_key_id is null
     or p_key_id !~ '^[a-z0-9_-]{1,64}$'
     or p_owner_id is null
     or p_tenant_id is null
     or p_connection_id is null
     or p_operation_id is null
     or p_nonce is null
     or p_generation is null
     or p_generation < 1
     or p_mac is null
     or pg_catalog.octet_length(p_mac) <> 32 then
    raise exception 'vault_assertion_invalid' using errcode = '28000';
  end if;

  if p_provider is distinct from 'proof_provider'
     or p_environment is distinct from 'demo'
     or p_capability not in ('account_read', 'market_data_read') then
    raise exception 'vault_assertion_invalid' using errcode = '28000';
  end if;

  v_now := pg_catalog.floor(
    pg_catalog.extract(epoch from pg_catalog.clock_timestamp())
  )::bigint;

  if p_issued_at is null
     or p_expires_at is null
     or p_issued_at > v_now + 10
     or p_expires_at <= v_now
     or p_expires_at <= p_issued_at
     or p_expires_at - p_issued_at > 60 then
    raise exception 'vault_assertion_invalid' using errcode = '28000';
  end if;

  select d.decrypted_secret
    into v_key
    from nova_vault_private.assertion_verifier_keys as k
    join vault.decrypted_secrets as d
      on d.id = k.vault_secret_id
   where k.key_id = p_key_id
     and k.enabled = true
     and k.not_before <= pg_catalog.clock_timestamp()
     and (k.not_after is null or k.not_after > pg_catalog.clock_timestamp());

  if not found or v_key is null or pg_catalog.length(v_key) = 0 then
    raise exception 'vault_assertion_invalid' using errcode = '28000';
  end if;

  v_message :=
      'NOVA-VAULT-ASSERTION-V1' || E'\n'
    || p_issuer || E'\n'
    || p_audience || E'\n'
    || p_key_id || E'\n'
    || pg_catalog.lower(p_owner_id::text) || E'\n'
    || pg_catalog.lower(p_tenant_id::text) || E'\n'
    || pg_catalog.lower(p_connection_id::text) || E'\n'
    || p_provider || E'\n'
    || p_environment || E'\n'
    || p_capability || E'\n'
    || p_generation::text || E'\n'
    || pg_catalog.lower(p_operation_id::text) || E'\n'
    || pg_catalog.lower(p_nonce::text) || E'\n'
    || p_issued_at::text || E'\n'
    || p_expires_at::text;

  v_expected_mac := extensions.hmac(
    pg_catalog.convert_to(v_message, 'UTF8'),
    pg_catalog.convert_to(v_key, 'UTF8'),
    'sha256'
  );

  if not nova_vault_private.constant_time_equal_32(v_expected_mac, p_mac) then
    raise exception 'vault_assertion_invalid' using errcode = '28000';
  end if;

  insert into nova_vault_private.assertion_nonce_consumption (
    key_id, nonce, operation_id, expires_at
  )
  values (p_key_id, p_nonce, p_operation_id, p_expires_at)
  on conflict (key_id, nonce) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'vault_assertion_invalid' using errcode = '28000';
  end if;

  begin
    v_secret := nova_vault_private.get_secret_for_connection_use(
      p_owner_id,
      p_tenant_id,
      p_connection_id,
      p_provider,
      p_environment,
      p_generation
    );
  exception
    when sqlstate 'P0002' then
      raise exception 'vault_assertion_invalid' using errcode = '28000';
  end;

  return v_secret;
end;
$function$;

alter function nova_vault_private.get_secret_for_signed_connection_use(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea
) owner to nova_vault_fn_owner;

-- The unsigned accessor is internal only. Runtime callers must present an HMAC assertion.
revoke all on function nova_vault_private.get_secret_for_connection_use(
  uuid, uuid, uuid, text, text, bigint
) from public, anon, authenticated, service_role, nova_vault_api;

revoke all on function nova_vault_private.constant_time_equal_32(bytea, bytea)
  from public, anon, authenticated, service_role, nova_vault_api;

revoke all on function nova_vault_private.get_secret_for_signed_connection_use(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea
) from public, anon, authenticated, service_role;

revoke all on table nova_vault_private.assertion_verifier_keys
  from public, anon, authenticated, service_role, nova_vault_api;
revoke all on table nova_vault_private.assertion_nonce_consumption
  from public, anon, authenticated, service_role, nova_vault_api;

grant execute on function nova_vault_private.get_secret_for_signed_connection_use(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea
) to nova_vault_api;
