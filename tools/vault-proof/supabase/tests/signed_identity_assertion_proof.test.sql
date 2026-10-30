-- Signed identity proof for the disposable local Vault project only.
-- All key material and customer Secrets in this file are synthetic local fixtures.
-- Test output stores and compares hashes only; it never selects or prints plaintext.

select extensions.plan(26);

create or replace function pg_temp.nova_vault_proof_mac(
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
as $function$
  select extensions.hmac(
    pg_catalog.convert_to(
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
      || p_expires_at::text,
      'UTF8'
    ),
    pg_catalog.convert_to('LOCAL-ONLY-HMAC-KEY-32-BYTE-0123', 'UTF8'),
    'sha256'
  );
$function$;

create or replace function pg_temp.nova_vault_signed_secret_hash(
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
  p_mac_hex text
)
returns text
language sql
volatile
as $function$
  select pg_catalog.md5(
    nova_vault_private.get_secret_for_signed_connection_use(
      p_version, p_issuer, p_audience, p_key_id,
      p_owner_id, p_tenant_id, p_connection_id,
      p_provider, p_environment, p_capability,
      p_generation, p_operation_id, p_nonce,
      p_issued_at, p_expires_at,
      pg_catalog.decode(p_mac_hex, 'hex')
    )
  );
$function$;

grant execute on function pg_temp.nova_vault_signed_secret_hash(
  integer, text, text, text, uuid, uuid, uuid, text, text, text,
  bigint, uuid, uuid, bigint, bigint, text
) to nova_vault_api;

do $prepare$
declare
  v_now bigint;
begin
  v_now := pg_catalog.floor(
    extract(epoch from pg_catalog.clock_timestamp())
  )::bigint;

  perform pg_catalog.set_config('nova_vault_proof.now', v_now::text, false);

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_a',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000a01',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_b',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000102',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000902',
      '00000000-0000-4000-8000-000000000a02',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_expired',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000903',
      '00000000-0000-4000-8000-000000000a03',
      v_now - 120, v_now - 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_future',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000904',
      '00000000-0000-4000-8000-000000000a04',
      v_now + 20, v_now + 80
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_wrong_audience',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'wrong-audience', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000905',
      '00000000-0000-4000-8000-000000000a05',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_write',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'trade_write', 1,
      '00000000-0000-4000-8000-000000000906',
      '00000000-0000-4000-8000-000000000a06',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_stale_generation',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 2,
      '00000000-0000-4000-8000-000000000907',
      '00000000-0000-4000-8000-000000000a07',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_wrong_provider',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'other_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000908',
      '00000000-0000-4000-8000-000000000a08',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_wrong_environment',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'production', 'account_read', 1,
      '00000000-0000-4000-8000-000000000909',
      '00000000-0000-4000-8000-000000000a09',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_unknown_key',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'missing-key-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000910',
      '00000000-0000-4000-8000-000000000a10',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_fresh_nonce_same_operation',
    pg_catalog.encode(pg_temp.nova_vault_proof_mac(
      'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000a11',
      v_now, v_now + 60
    ), 'hex'),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_tampered',
    pg_catalog.encode(
      pg_catalog.set_byte(
        pg_catalog.decode(current_setting('nova_vault_proof.mac_a'), 'hex'),
        0,
        pg_catalog.get_byte(pg_catalog.decode(current_setting('nova_vault_proof.mac_a'), 'hex'), 0) # 1
      ),
      'hex'
    ),
    false
  );

  perform pg_catalog.set_config(
    'nova_vault_proof.mac_short',
    pg_catalog.encode(
      pg_catalog.substring(pg_catalog.decode(current_setting('nova_vault_proof.mac_a'), 'hex') from 1 for 31),
      'hex'
    ),
    false
  );
end;
$prepare$;

select extensions.is(
  has_function_privilege(
    'nova_vault_api',
    'nova_vault_private.get_secret_for_connection_use(uuid,uuid,uuid,text,text,bigint)',
    'EXECUTE'
  ),
  false,
  'runtime login cannot execute the unsigned owner-ID accessor'
);

select extensions.ok(
  has_function_privilege(
    'nova_vault_api',
    'nova_vault_private.get_secret_for_signed_connection_use(integer,text,text,text,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid,bigint,bigint,bytea)',
    'EXECUTE'
  ),
  'runtime login can execute the signed assertion accessor'
);

select extensions.is(
  has_table_privilege('nova_vault_api', 'nova_vault_private.assertion_verifier_keys', 'SELECT'),
  false,
  'runtime login cannot read verifier key registry'
);

select extensions.is(
  has_table_privilege('nova_vault_api', 'nova_vault_private.assertion_nonce_consumption', 'SELECT'),
  false,
  'runtime login cannot read nonce replay registry'
);

select extensions.is(
  has_schema_privilege('nova_vault_api', 'extensions', 'USAGE'),
  false,
  'runtime login cannot use the cryptographic extension schema directly'
);

select extensions.is(
  has_function_privilege('nova_vault_api', 'extensions.hmac(bytea,bytea,text)', 'EXECUTE'),
  false,
  'runtime login cannot execute pgcrypto HMAC directly'
);

select extensions.is(
  has_function_privilege('nova_vault_api', 'nova_vault_private.constant_time_equal_32(bytea,bytea)', 'EXECUTE'),
  false,
  'runtime login cannot execute the MAC comparison helper directly'
);

select extensions.ok(
  has_function_privilege('nova_vault_fn_owner', 'extensions.hmac(bytea,bytea,text)', 'EXECUTE'),
  'non-login function owner can call the required HMAC primitive'
);

select extensions.is(
  has_function_privilege(
    'service_role',
    'nova_vault_private.get_secret_for_signed_connection_use(integer,text,text,text,uuid,uuid,uuid,text,text,text,bigint,uuid,uuid,bigint,bigint,bytea)',
    'EXECUTE'
  ),
  false,
  'service_role cannot invoke the private signed Secret accessor'
);

select extensions.ok(
  (
    select p.prosecdef and p.proowner = r.oid
       and p.proconfig @> array['search_path=""']
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      cross join pg_catalog.pg_roles as r
     where n.nspname = 'nova_vault_private'
       and p.proname = 'get_secret_for_signed_connection_use'
       and r.rolname = 'nova_vault_fn_owner'
  ),
  'signed accessor is SECURITY DEFINER, function-owner-bound and search_path-pinned'
);

select extensions.ok(
  (
    select not rolcanlogin and not rolsuper and not rolbypassrls
      from pg_catalog.pg_roles
     where rolname = 'nova_vault_fn_owner'
  ),
  'verifier functions are owned by a non-login least-privilege role'
);

set role nova_vault_api;
do $valid_a$
begin
  perform pg_catalog.set_config(
    'nova_vault_proof.result_a',
    pg_temp.nova_vault_signed_secret_hash(
      1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000a01',
      current_setting('nova_vault_proof.now')::bigint,
      current_setting('nova_vault_proof.now')::bigint + 60,
      current_setting('nova_vault_proof.mac_a')
    ),
    false
  );
end;
$valid_a$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.result_a', true),
  pg_catalog.md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-A'),
  'valid Customer A HMAC assertion returns only A synthetic Secret'
);

set role nova_vault_api;
do $valid_b$
begin
  perform pg_catalog.set_config(
    'nova_vault_proof.result_b',
    pg_temp.nova_vault_signed_secret_hash(
      1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000102',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000902',
      '00000000-0000-4000-8000-000000000a02',
      current_setting('nova_vault_proof.now')::bigint,
      current_setting('nova_vault_proof.now')::bigint + 60,
      current_setting('nova_vault_proof.mac_b')
    ),
    false
  );
end;
$valid_b$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.result_b', true),
  pg_catalog.md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-B'),
  'valid Customer B HMAC assertion returns only B synthetic Secret'
);

set role nova_vault_api;
do $forged_owner$
begin
  perform pg_catalog.set_config(
    'nova_vault_proof.forged_owner_denied',
    'false',
    false
  );
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000102',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000a01',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_a')
  );
exception
  when sqlstate '28000' then
    perform pg_catalog.set_config('nova_vault_proof.forged_owner_denied', 'true', false);
end;
$forged_owner$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.forged_owner_denied', true),
  'true',
  'Customer A cannot forge Customer B owner, tenant and connection claims without the signing key'
);

set role nova_vault_api;
do $tampered_mac$
begin
  perform pg_catalog.set_config('nova_vault_proof.tampered_mac_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000a01',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_tampered')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.tampered_mac_denied', 'true', false);
end;
$tampered_mac$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.tampered_mac_denied', true),
  'true',
  'a one-byte MAC modification is rejected'
);

set role nova_vault_api;
do $expired$
begin
  perform pg_catalog.set_config('nova_vault_proof.expired_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000903',
    '00000000-0000-4000-8000-000000000a03',
    current_setting('nova_vault_proof.now')::bigint - 120,
    current_setting('nova_vault_proof.now')::bigint - 60,
    current_setting('nova_vault_proof.mac_expired')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.expired_denied', 'true', false);
end;
$expired$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.expired_denied', true),
  'true',
  'expired signed assertions are rejected'
);

set role nova_vault_api;
do $future$
begin
  perform pg_catalog.set_config('nova_vault_proof.future_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000904',
    '00000000-0000-4000-8000-000000000a04',
    current_setting('nova_vault_proof.now')::bigint + 20,
    current_setting('nova_vault_proof.now')::bigint + 80,
    current_setting('nova_vault_proof.mac_future')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.future_denied', 'true', false);
end;
$future$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.future_denied', true),
  'true',
  'materially future-dated assertions are rejected'
);

set role nova_vault_api;
do $wrong_audience$
begin
  perform pg_catalog.set_config('nova_vault_proof.wrong_audience_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'wrong-audience', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000905',
    '00000000-0000-4000-8000-000000000a05',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_wrong_audience')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.wrong_audience_denied', 'true', false);
end;
$wrong_audience$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.wrong_audience_denied', true),
  'true',
  'wrong audience assertions are rejected'
);

set role nova_vault_api;
do $trade_write$
begin
  perform pg_catalog.set_config('nova_vault_proof.trade_write_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'trade_write', 1,
    '00000000-0000-4000-8000-000000000906',
    '00000000-0000-4000-8000-000000000a06',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_write')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.trade_write_denied', 'true', false);
end;
$trade_write$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.trade_write_denied', true),
  'true',
  'trade-write capability is rejected'
);

set role nova_vault_api;
do $stale_generation$
begin
  perform pg_catalog.set_config('nova_vault_proof.stale_generation_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 2,
    '00000000-0000-4000-8000-000000000907',
    '00000000-0000-4000-8000-000000000a07',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_stale_generation')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.stale_generation_denied', 'true', false);
end;
$stale_generation$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.stale_generation_denied', true),
  'true',
  'stale secret generations are rejected even with a valid MAC'
);

set role nova_vault_api;
do $wrong_provider$
begin
  perform pg_catalog.set_config('nova_vault_proof.wrong_provider_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'other_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000908',
    '00000000-0000-4000-8000-000000000a08',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_wrong_provider')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.wrong_provider_denied', 'true', false);
end;
$wrong_provider$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.wrong_provider_denied', true),
  'true',
  'wrong provider assertions are rejected'
);

set role nova_vault_api;
do $wrong_environment$
begin
  perform pg_catalog.set_config('nova_vault_proof.wrong_environment_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'production', 'account_read', 1,
    '00000000-0000-4000-8000-000000000909',
    '00000000-0000-4000-8000-000000000a09',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_wrong_environment')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.wrong_environment_denied', 'true', false);
end;
$wrong_environment$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.wrong_environment_denied', true),
  'true',
  'wrong environment assertions are rejected'
);

set role nova_vault_api;
do $unknown_key$
begin
  perform pg_catalog.set_config('nova_vault_proof.unknown_key_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'missing-key-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000910',
    '00000000-0000-4000-8000-000000000a10',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_unknown_key')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.unknown_key_denied', 'true', false);
end;
$unknown_key$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.unknown_key_denied', true),
  'true',
  'unknown verifier key IDs are rejected'
);

set role nova_vault_api;
do $short_mac$
begin
  perform pg_catalog.set_config('nova_vault_proof.short_mac_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000911',
    '00000000-0000-4000-8000-000000000a11',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_short')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.short_mac_denied', 'true', false);
end;
$short_mac$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.short_mac_denied', true),
  'true',
  'MAC signatures shorter than 32 bytes are rejected'
);

set role nova_vault_api;
do $replay$
begin
  perform pg_catalog.set_config('nova_vault_proof.replay_denied', 'false', false);
  perform pg_temp.nova_vault_signed_secret_hash(
    1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo', 'account_read', 1,
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000a01',
    current_setting('nova_vault_proof.now')::bigint,
    current_setting('nova_vault_proof.now')::bigint + 60,
    current_setting('nova_vault_proof.mac_a')
  );
exception when sqlstate '28000' then
  perform pg_catalog.set_config('nova_vault_proof.replay_denied', 'true', false);
end;
$replay$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.replay_denied', true),
  'true',
  'a previously consumed nonce cannot be replayed'
);

set role nova_vault_api;
do $fresh_nonce_same_operation$
begin
  perform pg_catalog.set_config(
    'nova_vault_proof.fresh_nonce_result',
    pg_temp.nova_vault_signed_secret_hash(
      1, 'voom-system-hub', 'nova-vault-access', 'local-proof-v1',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000101',
      'proof_provider', 'demo', 'account_read', 1,
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000a11',
      current_setting('nova_vault_proof.now')::bigint,
      current_setting('nova_vault_proof.now')::bigint + 60,
      current_setting('nova_vault_proof.mac_fresh_nonce_same_operation')
    ),
    false
  );
end;
$fresh_nonce_same_operation$;
reset role;

select extensions.is(
  current_setting('nova_vault_proof.fresh_nonce_result', true),
  pg_catalog.md5('SYNTHETIC-LOCAL-ONLY-VAULT-PROOF-CUSTOMER-A'),
  'a fresh nonce may retry the same idempotent operation ID'
);

select * from extensions.finish();
