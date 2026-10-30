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
