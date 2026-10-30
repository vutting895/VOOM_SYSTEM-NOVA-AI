-- pgTAP assertions for the disposable local Vault proof only.
-- Assertions hash fixture values; the test output never prints the synthetic secret.

select extensions.plan(43);

select extensions.ok(
  exists (select 1 from pg_catalog.pg_roles where rolname = 'nova_vault_fn_owner'),
  'dedicated function owner role exists'
);

select extensions.is(
  (select rolcanlogin from pg_catalog.pg_roles where rolname = 'nova_vault_fn_owner'),
  false,
  'function owner cannot log in'
);

select extensions.ok(
  (select not rolsuper and not rolcreatedb and not rolcreaterole
          and not rolreplication and not rolbypassrls and not rolinherit
     from pg_catalog.pg_roles where rolname = 'nova_vault_fn_owner'),
  'function owner has no elevated role attributes'
);

select extensions.is(
  (select rolcanlogin from pg_catalog.pg_roles where rolname = 'nova_vault_api'),
  true,
  'dedicated runtime role is a login role'
);

select extensions.ok(
  (select not rolsuper and not rolcreatedb and not rolcreaterole
          and not rolreplication and not rolbypassrls and not rolinherit
     from pg_catalog.pg_roles where rolname = 'nova_vault_api'),
  'runtime role has no elevated role attributes'
);

select extensions.is(
  pg_catalog.pg_has_role('nova_vault_api', 'service_role', 'MEMBER'),
  false,
  'runtime role is not a member of service_role'
);

select extensions.is(
  pg_catalog.pg_has_role('nova_vault_api', 'postgres', 'MEMBER'),
  false,
  'runtime role is not a member of postgres'
);

select extensions.is(
  pg_catalog.pg_has_role('nova_vault_api', 'nova_vault_fn_owner', 'MEMBER'),
  false,
  'runtime role cannot assume function-owner authority'
);

select extensions.is(
  pg_catalog.pg_has_role('nova_vault_fn_owner', 'service_role', 'MEMBER'),
  false,
  'function owner is not a member of service_role'
);

select extensions.ok(
  has_table_privilege('nova_vault_fn_owner', 'vault.decrypted_secrets', 'SELECT'),
  'non-login function owner has the view read needed by this proof'
);

select extensions.is(
  has_table_privilege('nova_vault_fn_owner', 'vault.secrets', 'SELECT'),
  false,
  'function owner cannot read encrypted Vault base rows directly'
);

select extensions.ok(
  (
    select count(*) = 1
       and bool_and(has_function_privilege('nova_vault_fn_owner', p.oid, 'EXECUTE'))
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'vault'
       and p.proname = '_crypto_aead_det_decrypt'
  ),
  'function owner can execute the single decrypt helper required by the view'
);

select extensions.ok(
  not exists (
    select 1
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'vault'
       and p.proname <> '_crypto_aead_det_decrypt'
       and has_function_privilege('nova_vault_fn_owner', p.oid, 'EXECUTE')
  ),
  'function owner cannot execute unrelated Vault extension functions'
);

select extensions.ok(
  not exists (
    select 1
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'vault'
       and has_function_privilege('nova_vault_api', p.oid, 'EXECUTE')
  ),
  'runtime login cannot execute any Vault extension function directly'
);

select extensions.ok(
  has_schema_privilege('nova_vault_api', 'nova_vault_private', 'USAGE'),
  'runtime role can use the private function schema'
);

select extensions.is(
  has_function_privilege(
    'nova_vault_api',
    'nova_vault_private.get_secret_for_connection_use(uuid,uuid,uuid,text,text,bigint)',
    'EXECUTE'
  ),
  false,
  'runtime role cannot execute the unsigned internal accessor'
);

select extensions.ok(
  has_function_privilege(
    'nova_vault_api',
    'nova_vault_private.get_secret_for_signed_connection_use(integer,text,text,text,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid,bigint,bigint,bytea)',
    'EXECUTE'
  ),
  'runtime role can execute the signed assertion accessor'
);

select extensions.is(
  has_schema_privilege('nova_vault_api', 'vault', 'USAGE'),
  false,
  'runtime role cannot access the Vault schema directly'
);

select extensions.is(
  has_table_privilege('nova_vault_api', 'vault.secrets', 'SELECT'),
  false,
  'runtime role cannot read the encrypted Vault table'
);

select extensions.is(
  has_table_privilege('nova_vault_api', 'vault.decrypted_secrets', 'SELECT'),
  false,
  'runtime role cannot read the decrypted Vault view directly'
);

select extensions.is(
  (
    select count(*)::integer
      from pg_catalog.pg_namespace as n
      cross join lateral pg_catalog.aclexplode(
        coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
      ) as acl
     where n.nspname = 'vault'
       and acl.grantee = 0
       and acl.privilege_type = 'USAGE'
  ),
  0,
  'PUBLIC has no direct USAGE on the Vault schema'
);

select extensions.is(
  (
    select count(*)::integer
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
      ) as acl
     where n.nspname = 'vault'
       and c.relkind in ('r', 'v', 'm', 'p')
       and acl.grantee = 0
       and acl.privilege_type = 'SELECT'
  ),
  0,
  'PUBLIC has no direct SELECT on Vault tables or views'
);

select extensions.ok(
  not has_schema_privilege('anon', 'vault', 'USAGE')
  and not has_table_privilege('anon', 'vault.secrets', 'SELECT')
  and not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'),
  'anon cannot access Vault schema, encrypted table, or decrypted view directly'
);

select extensions.ok(
  not has_schema_privilege('authenticated', 'vault', 'USAGE')
  and not has_table_privilege('authenticated', 'vault.secrets', 'SELECT')
  and not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT'),
  'authenticated cannot access Vault schema, encrypted table, or decrypted view directly'
);

select extensions.ok(
  (
    select count(*) = 1
       and bool_and(has_function_privilege('nova_vault_fn_owner', p.oid, 'EXECUTE'))
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'vault'
       and p.proname = '_crypto_aead_det_decrypt'
  ),
  'non-login function owner has the exact decrypt dependency required by the Vault view'
);

select extensions.is(
  has_schema_privilege('anon', 'nova_vault_private', 'USAGE'),
  false,
  'anon cannot use the private schema'
);

select extensions.is(
  has_function_privilege(
    'anon',
    'nova_vault_private.get_secret_for_connection_use(uuid,uuid,uuid,text,text,bigint)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the secret function'
);

select extensions.is(
  has_schema_privilege('authenticated', 'nova_vault_private', 'USAGE'),
  false,
  'authenticated cannot use the private schema'
);

select extensions.is(
  has_function_privilege(
    'authenticated',
    'nova_vault_private.get_secret_for_connection_use(uuid,uuid,uuid,text,text,bigint)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute the secret function'
);

select extensions.is(
  has_schema_privilege('service_role', 'nova_vault_private', 'USAGE'),
  false,
  'service_role cannot use the private schema'
);

select extensions.is(
  has_function_privilege(
    'service_role',
    'nova_vault_private.get_secret_for_connection_use(uuid,uuid,uuid,text,text,bigint)',
    'EXECUTE'
  ),
  false,
  'service_role cannot execute the private secret function'
);

select extensions.is(
  (select p.prosecdef
     from pg_catalog.pg_proc as p
     join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'nova_vault_private'
      and p.proname = 'get_secret_for_connection_use'),
  true,
  'secret accessor runs with its dedicated function owner'
);

select extensions.ok(
  (select p.proowner = r.oid
     from pg_catalog.pg_proc as p
     join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     cross join pg_catalog.pg_roles as r
    where n.nspname = 'nova_vault_private'
      and p.proname = 'get_secret_for_connection_use'
      and r.rolname = 'nova_vault_fn_owner'),
  'secret accessor is owned by the non-login function owner'
);

select extensions.ok(
  (select p.proconfig @> array['search_path=""']
     from pg_catalog.pg_proc as p
     join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'nova_vault_private'
      and p.proname = 'get_secret_for_connection_use'),
  'SECURITY DEFINER function pins an empty search_path'
);

set role nova_vault_fn_owner;
select pg_catalog.set_config(
  'nova_vault_proof.customer_a_hash',
  md5(nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 1
  )),
  false
);
reset role;

select extensions.is(
  current_setting('nova_vault_proof.customer_a_hash', true),
  md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-A'),
  'function owner internal lookup resolves Customer A for A connection'
);

set role nova_vault_fn_owner;
select pg_catalog.set_config(
  'nova_vault_proof.customer_b_hash',
  md5(nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000102',
    'proof_provider', 'demo', 1
  )),
  false
);
reset role;

select extensions.is(
  current_setting('nova_vault_proof.customer_b_hash', true),
  md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-B'),
  'function owner internal lookup resolves Customer B for B connection'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000102',
    'proof_provider', 'demo', 1
  );
  perform pg_catalog.set_config('nova_vault_proof.cross_owner_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.cross_owner_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.cross_owner_denied', true),
  'true',
  'internal accessor rejects an owner mismatch even when the other connection UUID is known'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 1
  );
  perform pg_catalog.set_config('nova_vault_proof.reverse_owner_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.reverse_owner_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.reverse_owner_denied', true),
  'true',
  'internal accessor rejects reverse owner mismatch'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 1
  );
  perform pg_catalog.set_config('nova_vault_proof.tenant_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.tenant_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.tenant_denied', true),
  'true',
  'connection lookup rejects a tenant mismatch'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'another_provider', 'demo', 1
  );
  perform pg_catalog.set_config('nova_vault_proof.provider_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.provider_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.provider_denied', true),
  'true',
  'connection lookup rejects a provider mismatch'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'production', 1
  );
  perform pg_catalog.set_config('nova_vault_proof.environment_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.environment_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.environment_denied', true),
  'true',
  'connection lookup rejects an environment mismatch'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 2
  );
  perform pg_catalog.set_config('nova_vault_proof.generation_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.generation_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.generation_denied', true),
  'true',
  'connection lookup rejects a stale generation'
);

set role nova_vault_fn_owner;
do $test$
begin
  perform nova_vault_private.get_secret_for_connection_use(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000103',
    'proof_provider', 'demo', 1
  );
  perform pg_catalog.set_config('nova_vault_proof.lifecycle_denied', 'false',
  false
);
exception when sqlstate 'P0002' then
  perform pg_catalog.set_config('nova_vault_proof.lifecycle_denied', 'true',
  false
);
end;
$test$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.lifecycle_denied', true),
  'true',
  'connection lookup rejects ROTATION_REQUIRED state'
);

select * from extensions.finish();
