-- LOCAL PROOF ONLY.
-- Enforce a second replay boundary for logical operations, independent of nonce.
-- This does NOT replace the System Hub's durable idempotency/result ledger:
-- it only ensures a fresh nonce cannot reuse an already accepted operation_id.
-- Never apply this migration to a hosted or production Supabase project.

alter table nova_vault_private.assertion_nonce_replay
  add constraint assertion_nonce_replay_operation_once
  unique (key_id, operation_id);

comment on constraint assertion_nonce_replay_operation_once
  on nova_vault_private.assertion_nonce_replay
  is 'Local proof guard: one logical operation_id per key_id; Hub must persist/replay sanitized outcomes and reconcile unknown provider outcomes.';
