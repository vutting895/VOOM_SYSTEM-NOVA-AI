# NOVA Model Registry

Cloudflare R2 stores immutable model/checkpoint files. Supabase stores registry metadata, lifecycle state, evaluations, and approval history.

Lifecycle:
`candidate -> evaluated -> approved -> demo_shadow -> archived`

Rules:
- Every model version references exact dataset, feature schema, code commit, config, seed, evaluator, and checkpoint SHA-256.
- An evaluation must link to walk-forward and final OOS evidence.
- No candidate can skip evaluation or human approval.
- Promotion updates a registry pointer; it does not overwrite artifact bytes.
- Rollback points to a prior approved artifact and preserves all audit records.
- Registry state must never imply live-trading authorization.
