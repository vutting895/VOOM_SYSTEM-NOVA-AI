-- Local-only proof: a fresh nonce cannot replay an existing logical operation.
select extensions.plan(3);

select extensions.ok(
  exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'nova_vault_private'
       and t.relname = 'assertion_nonce_replay'
       and c.conname = 'assertion_nonce_replay_operation_once'
       and c.contype = 'u'
  ),
  'logical operation IDs have a unique constraint per signing key'
);

insert into nova_vault_private.assertion_nonce_replay (
  key_id, nonce, operation_id, expires_at
)
values (
  'proof-hmac-v1',
  '20000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000099',
  1793390060
);

select extensions.throws_ok(
  $$
    insert into nova_vault_private.assertion_nonce_replay (
      key_id, nonce, operation_id, expires_at
    )
    values (
      'proof-hmac-v1',
      '20000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000099',
      1793390060
    )
  $$,
  '23505',
  null,
  'same operation ID with a fresh nonce is rejected'
);

select extensions.is(
  (
    select count(*)::integer
      from nova_vault_private.assertion_nonce_replay
     where key_id = 'proof-hmac-v1'
       and operation_id = '10000000-0000-4000-8000-000000000099'
  ),
  1,
  'only one accepted assertion record exists for the logical operation'
);

select * from extensions.finish();
