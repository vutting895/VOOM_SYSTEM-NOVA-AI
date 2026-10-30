-- pgTAP proof for the disposable local signed-identity assertion verifier.
-- Uses synthetic local-only HMAC key material and records only hashes/booleans.
select extensions.plan(25);

-- RFC 4231 Test Case 1: shared HMAC-SHA-256 known-answer vector.
select extensions.is(
  pg_catalog.encode(
    extensions.hmac(
      pg_catalog.decode('4869205468657265', 'hex'),
      pg_catalog.decode(pg_catalog.repeat('0b', 20), 'hex'),
      'sha256'
    ),
    'hex'
  ),
  'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  'PostgreSQL pgcrypto HMAC-SHA-256 matches RFC 4231 known-answer vector'
);

select extensions.is(
  pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(
          'NOVA-VAULT-ASSERTION-V1' || E'\n'
        || 'voom-system-hub' || E'\n'
        || 'nova-vault-access' || E'\n'
        || 'proof-hmac-v1' || E'\n'
        || '00000000-0000-4000-8000-000000000001' || E'\n'
        || '00000000-0000-4000-8000-000000000011' || E'\n'
        || '00000000-0000-4000-8000-000000000101' || E'\n'
        || 'proof_provider' || E'\n'
        || 'demo' || E'\n'
        || 'secret.use.readonly' || E'\n'
        || '1' || E'\n'
        || '00000000-0000-4000-8000-000000000901' || E'\n'
        || '00000000-0000-4000-8000-000000000a01' || E'\n'
        || '1761800000' || E'\n'
        || '1761800060',
        'UTF8'
      ),
      pg_catalog.decode('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=', 'base64'),
      'sha256'
    ),
    'hex'
  ),
  'ecfd257bb3dfff3d0fa34e8d1d01506b2e063a2dbeb4284c3737bb283602a001',
  'PostgreSQL pgcrypto matches the Web Crypto canonical assertion known-answer vector'
);

select extensions.ok(
  has_function_privilege(
    'nova_vault_fn_owner',
    'extensions.hmac(bytea,bytea,text)',
    'EXECUTE'
  ),
  'non-login function owner can execute the exact pgcrypto HMAC overload'
);

select extensions.is(
  has_function_privilege(
    'nova_vault_api',
    'extensions.hmac(bytea,bytea,text)',
    'EXECUTE'
  ),
  false,
  'runtime login cannot execute pgcrypto HMAC directly'
);

select extensions.is(
  has_function_privilege(
    'nova_vault_api',
    'nova_vault_private.get_secret_for_connection_use(uuid,uuid,uuid,text,text,bigint)',
    'EXECUTE'
  ),
  false,
  'runtime login cannot call the unsigned owner-parameter accessor'
);

select extensions.ok(
  has_function_privilege(
    'nova_vault_api',
    'nova_vault_private.get_secret_for_connection_use_signed(integer,text,text,text,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid,bigint,bigint,bytea)',
    'EXECUTE'
  ),
  'runtime login can execute only the signed Vault accessor'
);

select extensions.is(
  has_table_privilege('nova_vault_api', 'nova_vault_private.assertion_keys', 'SELECT'),
  false,
  'runtime login cannot read the private assertion key registry'
);

select extensions.is(
  has_table_privilege('nova_vault_api', 'nova_vault_private.assertion_nonce_replay', 'SELECT'),
  false,
  'runtime login cannot enumerate assertion nonce replay records'
);

select extensions.ok(
  (
    select p.prosecdef
       and p.proowner = r.oid
       and p.proconfig @> array['search_path=""']
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      cross join pg_catalog.pg_roles as r
     where n.nspname = 'nova_vault_private'
       and p.proname = 'get_secret_for_connection_use_signed'
       and r.rolname = 'nova_vault_fn_owner'
  ),
  'signed accessor is SECURITY DEFINER, function-owner-owned, and pins an empty search_path'
);

-- Test-only signer helper. It is owned by the migration runner and deliberately
-- unavailable to the runtime role. The key is a synthetic 32-byte fixture.
create function nova_vault_private._test_make_mac(
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
  p_expires_at bigint
)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $function$
  select extensions.hmac(
    pg_catalog.convert_to(
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
      || p_expires_at::text,
      'UTF8'
    ),
    pg_catalog.decode('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=', 'base64'),
    'sha256'
  );
$function$;

revoke all on function nova_vault_private._test_make_mac(
  text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint
) from public, anon, authenticated, service_role, nova_vault_api;

-- Test-only invoker helper: executes the signed accessor as nova_vault_api and
-- writes either an MD5 comparison digest or a denial boolean to a private GUC.
-- It never returns or prints secret material.

select pg_catalog.set_config(
  'nova_vault_proof.now',
  floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint::text,
  false
);

-- Generate signatures as the privileged disposable test runner. All invocations
-- below are then made after SET ROLE nova_vault_api.
select pg_catalog.set_config(
  'nova_vault_proof.mac_a',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_b',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000102',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_tenant_mismatch',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_provider_mismatch',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'other_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000004',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_environment_mismatch',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'production', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000005',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_bad_audience',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'wrong-audience', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000006',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_expired',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000007',
    current_setting('nova_vault_proof.now')::bigint - 120,
    current_setting('nova_vault_proof.now')::bigint - 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_future',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000008',
    current_setting('nova_vault_proof.now')::bigint + 30,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_long_lifetime',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 61
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_bad_capability',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'trade.submit', 1,
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_unknown_key',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-unknown',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_stale_generation',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 2,
    '10000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000012',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

select pg_catalog.set_config(
  'nova_vault_proof.mac_unknown_key_format',
  pg_catalog.encode(nova_vault_private._test_make_mac(
    'voom-system-hub', 'nova-vault-access', E'bad\nkey-id',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'secret.use.readonly', 1,
    '10000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60
  ), 'hex'),
  false
);

-- Exercise all calls as the restricted runtime login. The helper is temporary
-- test harness only, SECURITY INVOKER, returns no secret value and is dropped.
create function nova_vault_private._test_try_signed(
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
  p_mac bytea,
  p_expect_denied boolean,
  p_result_name text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_secret text;
begin
  if p_result_name !~ '^nova_vault_proof\.[a-z0-9_]+$' then
    raise exception 'invalid test result setting';
  end if;

  if p_expect_denied then
    begin
      v_secret := nova_vault_private.get_secret_for_connection_use_signed(
        p_version, p_issuer, p_audience, p_key_id,
        p_owner_id, p_tenant_id, p_connection_id,
        p_provider, p_environment, p_capability, p_generation,
        p_operation_id, p_nonce, p_issued_at, p_expires_at, p_mac
      );
      perform pg_catalog.set_config(p_result_name, 'false', false);
    exception when sqlstate '28000' then
      perform pg_catalog.set_config(p_result_name, 'true', false);
    end;
  else
    v_secret := nova_vault_private.get_secret_for_connection_use_signed(
      p_version, p_issuer, p_audience, p_key_id,
      p_owner_id, p_tenant_id, p_connection_id,
      p_provider, p_environment, p_capability, p_generation,
      p_operation_id, p_nonce, p_issued_at, p_expires_at, p_mac
    );
    perform pg_catalog.set_config(p_result_name, pg_catalog.md5(v_secret), false);
  end if;
end;
$function$;

grant execute on function nova_vault_private._test_try_signed(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea, boolean, text
) to nova_vault_api;

set role nova_vault_api;

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_a'), 'hex'),
  false, 'nova_vault_proof.customer_a'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000102',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_b'), 'hex'),
  false, 'nova_vault_proof.customer_b'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000102',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_a'), 'hex'),
  true, 'nova_vault_proof.cross_customer_spoof'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000003',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_tenant_mismatch'), 'hex'),
  true, 'nova_vault_proof.tenant_mismatch'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'other_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000004',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_provider_mismatch'), 'hex'),
  true, 'nova_vault_proof.provider_mismatch'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'production', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000005',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_environment_mismatch'), 'hex'),
  true, 'nova_vault_proof.environment_mismatch'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'wrong-audience', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000006',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_bad_audience'), 'hex'),
  true, 'nova_vault_proof.bad_audience'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000007',
  '20000000-0000-4000-8000-000000000007',
  current_setting('nova_vault_proof.now')::bigint - 120,
  current_setting('nova_vault_proof.now')::bigint - 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_expired'), 'hex'),
  true, 'nova_vault_proof.expired'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000008',
  '20000000-0000-4000-8000-000000000008',
  current_setting('nova_vault_proof.now')::bigint + 30,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_future'), 'hex'),
  true, 'nova_vault_proof.future_dated'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000009',
  '20000000-0000-4000-8000-000000000009',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 61,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_long_lifetime'), 'hex'),
  true, 'nova_vault_proof.long_lifetime'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'trade.submit', 1,
  '10000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000010',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_bad_capability'), 'hex'),
  true, 'nova_vault_proof.bad_capability'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-unknown',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000011',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_unknown_key'), 'hex'),
  true, 'nova_vault_proof.unknown_key'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000013',
  '20000000-0000-4000-8000-000000000013',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_unknown_key_format'), 'hex'),
  true, 'nova_vault_proof.bad_key_id_format'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000014',
  '20000000-0000-4000-8000-000000000014',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(repeat('00', 32), 'hex'),
  true, 'nova_vault_proof.invalid_mac'
);

select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 2,
  '10000000-0000-4000-8000-000000000012',
  '20000000-0000-4000-8000-000000000012',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_stale_generation'), 'hex'),
  true, 'nova_vault_proof.stale_generation'
);

-- Reuse the exact previously accepted Customer A assertion and nonce.
select nova_vault_private._test_try_signed(
  1, 'voom-system-hub', 'nova-vault-access', 'proof-hmac-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000101',
  'proof_provider', 'demo', 'secret.use.readonly', 1,
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  current_setting('nova_vault_proof.now')::bigint,
  current_setting('nova_vault_proof.now')::bigint + 60,
  pg_catalog.decode(current_setting('nova_vault_proof.mac_a'), 'hex'),
  true, 'nova_vault_proof.nonce_replay'
);

reset role;

select extensions.is(
  current_setting('nova_vault_proof.customer_a', true),
  md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-A'),
  'valid signed Customer A assertion returns only A synthetic secret'
);

select extensions.is(
  current_setting('nova_vault_proof.customer_b', true),
  md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-B'),
  'valid signed Customer B assertion returns only B synthetic secret'
);

select extensions.is(current_setting('nova_vault_proof.cross_customer_spoof', true), 'true',
  'Customer A cannot forge Customer B claims with Customer A MAC');
select extensions.is(current_setting('nova_vault_proof.tenant_mismatch', true), 'true',
  'valid MAC cannot override owner/tenant registry mismatch');
select extensions.is(current_setting('nova_vault_proof.provider_mismatch', true), 'true',
  'valid MAC cannot override provider registry mismatch');
select extensions.is(current_setting('nova_vault_proof.environment_mismatch', true), 'true',
  'valid MAC cannot override environment registry mismatch');
select extensions.is(current_setting('nova_vault_proof.bad_audience', true), 'true',
  'wrong audience is rejected');
select extensions.is(current_setting('nova_vault_proof.expired', true), 'true',
  'expired assertion is rejected');
select extensions.is(current_setting('nova_vault_proof.future_dated', true), 'true',
  'materially future-dated assertion is rejected');
select extensions.is(current_setting('nova_vault_proof.long_lifetime', true), 'true',
  'assertion lifetime over 60 seconds is rejected');
select extensions.is(current_setting('nova_vault_proof.bad_capability', true), 'true',
  'unsupported write capability is rejected');
select extensions.is(current_setting('nova_vault_proof.unknown_key', true), 'true',
  'unknown key ID is rejected');
select extensions.is(current_setting('nova_vault_proof.bad_key_id_format', true), 'true',
  'key ID containing a line break is rejected');
select extensions.is(current_setting('nova_vault_proof.invalid_mac', true), 'true',
  'invalid HMAC is rejected');
select extensions.is(current_setting('nova_vault_proof.stale_generation', true), 'true',
  'stale generation is rejected despite a valid signature');
select extensions.is(current_setting('nova_vault_proof.nonce_replay', true), 'true',
  'replayed key ID and nonce pair is rejected');

-- Remove local-only test harness functions; the migration leaves only the
-- signed accessor executable by nova_vault_api.
drop function nova_vault_private._test_try_signed(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, bytea, boolean, text
);
drop function nova_vault_private._test_make_mac(
  text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint
);

select * from extensions.finish();
