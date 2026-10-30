-- Local-only proof of durable operation idempotency and ambiguous provider outcome handling.
select extensions.plan(14);

select extensions.is(
  nova_vault_private.claim_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('11', 32), 'hex'),
    '20000000-0000-4000-8000-000000000201'
  ),
  'CLAIMED',
  'first request durably claims the operation before provider dispatch'
);

select extensions.is(
  nova_vault_private.claim_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('11', 32), 'hex'),
    '20000000-0000-4000-8000-000000000202'
  ),
  'IN_PROGRESS',
  'concurrent duplicate cannot claim while lease is active'
);

select extensions.throws_ok(
  $$ select nova_vault_private.claim_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('22', 32), 'hex'),
    '20000000-0000-4000-8000-000000000203'
  ) $$,
  '22023', null,
  'same operation ID with a different request fingerprint is rejected'
);

select extensions.lives_ok(
  $$ select nova_vault_private.complete_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000201',
    '{"outcome":"succeeded","provider_reference":"proof-ref-201","completed_at":"2026-10-31T00:00:00Z"}'::jsonb
  ) $$,
  'lease owner can persist a sanitized provider success'
);

select extensions.is(
  nova_vault_private.claim_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('11', 32), 'hex'),
    '20000000-0000-4000-8000-000000000204'
  ),
  'REPLAY_SUCCEEDED',
  'completed operation returns replay state rather than dispatch permission'
);

select extensions.is(
  nova_vault_private.get_operation_result(
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011'
  )->>'provider_reference',
  'proof-ref-201',
  'same owner and tenant can recover the sanitized prior result'
);

select extensions.is(
  nova_vault_private.get_operation_result(
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012'
  ),
  null,
  'foreign owner and tenant cannot recover the prior result'
);

insert into nova_vault_private.assertion_keys(key_id, secret_id, key_status)
values (
  'proof-hmac-v2',
  vault.create_secret(
    'RkFLRS1MT0NBT C1PTkxZLUhNQUMtS0VZLTI=',
    'nova-vault-proof-hmac-v2',
    'Synthetic rotated HMAC key for local idempotency proof only'
  ),
  'ACTIVE'
);

select extensions.is(
  nova_vault_private.claim_operation(
    'proof-hmac-v2',
    '10000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('11', 32), 'hex'),
    '20000000-0000-4000-8000-000000000207'
  ),
  'REPLAY_SUCCEEDED',
  'signing-key rotation cannot bypass tenant-scoped operation idempotency'
);

select extensions.throws_ok(
  $$ select nova_vault_private.complete_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000202',
    '{"outcome":"succeeded"}'::jsonb
  ) $$,
  '40001', null,
  'stale lease token is fenced from completing the operation'
);

select extensions.is(
  nova_vault_private.claim_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('33', 32), 'hex'),
    '20000000-0000-4000-8000-000000000205'
  ),
  'CLAIMED',
  'second operation is claimed before simulated provider request'
);

select extensions.lives_ok(
  $$ select nova_vault_private.mark_operation_unknown(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000202',
    '20000000-0000-4000-8000-000000000205',
    'PROVIDER_TIMEOUT'
  ) $$,
  'timeout after possible dispatch persists OUTCOME_UNKNOWN'
);

select extensions.is(
  nova_vault_private.claim_operation(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000101',
    'proof_provider', 'demo',
    pg_catalog.decode(repeat('33', 32), 'hex'),
    '20000000-0000-4000-8000-000000000206'
  ),
  'RECONCILIATION_REQUIRED',
  'unknown provider outcome never triggers automatic redispatch'
);

select extensions.lives_ok(
  $$ select nova_vault_private.resolve_operation_unknown(
    'proof-hmac-v1',
    '10000000-0000-4000-8000-000000000202',
    pg_catalog.decode(repeat('33', 32), 'hex'),
    'SUCCEEDED',
    '{"outcome":"succeeded","provider_reference":"reconciled-ref-202"}'::jsonb,
    null
  ) $$,
  'operator/provider reconciliation can record a confirmed success'
);

select extensions.is(
  nova_vault_private.get_operation_result(
    '10000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011'
  )->>'provider_reference',
  'reconciled-ref-202',
  'reconciled success is recoverable without another provider dispatch'
);

select * from extensions.finish();
