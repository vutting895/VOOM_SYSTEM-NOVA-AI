# Deep Research Core — Contract Foundation

This package provides strict, dependency-free validators for the first versioned research contracts:

- `nova.research-task.v1`
- `nova.research-source.v1`
- `nova.research-claim.v1`
- `nova.research-hypothesis.v1`

The validators reject unknown fields, enforce bounded payloads and identifiers, validate source snapshot hashes, require timezone-aware ISO timestamps (normalized to UTC), reject credential-like or reserved source URLs, enforce passage-ID uniqueness, preserve counter-evidence, and require falsification criteria for hypotheses approved for experiment. The cross-record Evidence Graph validator additionally rejects dangling/cross-research references and evidence passages that do not belong to a claim's declared sources.

**Security boundary:** these are data-contract validators only. They do not authenticate users, establish owner/tenant scope, authorize tool calls, fetch URLs, persist source content, or execute source instructions. The NOVA System Integration Hub must authenticate and inject trusted owner/tenant identifiers before calling this package. SSRF protection, redirect validation, DNS/IP policy and network egress controls belong in the future source-fetch adapter.

## Evidence Graph and event-chain boundaries

- `validate_research_evidence_graph` checks that source, passage, claim and hypothesis references resolve within one research task; it rejects orphan references, cross-research links, duplicate passage IDs and contradictory reuse of the same passage/claim as both support and counter-evidence.
- `append_evidence_event` creates the next sequence-numbered `nova.evidence-event.v1` envelope. The event includes a UTC timestamp, trusted owner/research identifiers, previous-event SHA-256 and its own SHA-256 over canonical JSON.
- `verify_evidence_event_chain` verifies sequence continuity, hash links, stable owner/research scope, unique event IDs and chronological recording time. Payloads are bounded JSON metadata; known secret-bearing field names are rejected.

**Integrity limitation:** a hash chain makes edits, deletion and reordering detectable against a retained trusted head/checkpoint. It does not stop an administrator who can rewrite the entire chain and its checkpoint, authenticate the caller, enforce RLS, provide durable storage, or replace an external immutable backup/anchor. The future persistence adapter must enforce insert-only access, owner isolation, idempotency and independently retained checkpoints. Do not place raw credentials or broker tokens in event payloads.

Run tests from the repository root:

```bash
python -m unittest discover -s tests -p "test_deep_research_contracts.py" -v\npython -m unittest discover -s tests -p "test_deep_research_ledger.py" -v
```
