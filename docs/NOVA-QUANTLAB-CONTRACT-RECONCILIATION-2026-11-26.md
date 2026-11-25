# NOVA QuantLab — Contract Reconciliation & Delivery Blueprint

- Date: 2026-11-26
- Decision: Integrated Workstation (Architecture A)
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Audited Main: `821db357d70d3613b0ca61520eaae5c5307e8fd4`
- Development branch: `dev/nova-quantlab-integrated-workstation-20261126`
- Scope: source/contract reconciliation and implementation-ready blueprint
- Runtime status: NOT VERIFIED; this document does not claim deployment or end-to-end integration
- Safety: research/read-only only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`

## 1. Executive decision

Build QuantLab inside the existing authenticated `apps/nova-command-center` application. Do not create a second frontend, second API client, second integration control plane, second MCP gateway, or parallel registry.

Use the existing NOVA System Integration Hub as the only browser-facing integration control plane after its exact deployed contract is verified. The existing Command Center client is GET-only and exposes only a small allowlist; QuantLab write-intent operations must therefore be designed as bounded research-job requests in a separate, explicitly reviewed API extension. They must not be smuggled through the current read-only client or routed directly from the browser to Python, Supabase service-role, MT5, or MCP.

The Python Quant Worker is the compute plane, not a public API. It receives a server-authorized, bounded job envelope and immutable data references. It has no broker credentials, no order API, and no ability to change risk policy or execution flags.

## 2. Evidence-based current-state matrix

| Capability | Main-source evidence at audited SHA | Status | Required action |
|---|---|---|---|
| Authenticated UI shell | TanStack Start app; `/_authenticated` checks Supabase user and server-issued `app_metadata.nova_role` | EXISTS IN SOURCE | Reuse; verify actual Hub role enforcement |
| Overview dashboard | `/v1/services`, `/v1/bridge/status`, `/v1/health` hooks | PARTIAL | Add truthful QuantLab readiness states; do not equate configured with connected |
| Trading monitor | `trading.tsx` renders `DEMO_*` fixtures and says no order entry exists | DEMO ONLY | Retain read-only; replace fixtures only after authenticated MT5 data proof |
| Browser API client | `src/lib/nova/api.ts` uses GET only; `safety.ts` blocks writes/trading paths | READ-ONLY | Preserve for read APIs; introduce separate reviewed research-job client only after server contract and safety tests |
| Hub contract | `docs/SYSTEM-INTEGRATION-HUB-DESIGN.md` defines auth, tenant ownership, bounded routes, read-only MT5 | DESIGN EXISTS | Reconcile with deployed Worker source and exact API routes before frontend wiring |
| MCP | `integrations/remote-mcp-worker` exists | SOURCE EXISTS | Keep as one client-facing MCP endpoint; Hub remains policy/control plane; no direct broker tools |
| Dataset quality | `workers/quant_engine/quality.py` validates OHLCV and fingerprints normalized content | PURE LIBRARY | Wrap with an authenticated ingest/manifest service; source provenance and market calendar still required |
| Experiment contract | `nova.quant-experiment.v1` in `experiment.py` | PURE VALIDATOR | Reuse; validator does not execute folds or prove referenced artifacts exist |
| Splits | `splits.py` provides chronological/purged and walk-forward primitives | PURE LIBRARY | Evaluator must enforce actual fold schedule, embargo and label availability |
| Model training | `training.py` returns literal `mock-checkpoint-bytes` | NOT REAL TRAINING | Replace with genuine optimizer/loss/validation/early-stopping/checkpoint implementation before claiming trained model |
| Torch model | `torch_models.py` implements ResidualMLP | NOT LSTM | Register actual architecture by truthful model type; do not label MLP as LSTM |
| Meta Decision | `meta_decision.py` validates OOS calibration and correlation histories | RESEARCH ONLY | Feed aligned immutable OOF; preserve abstention; no broker/execution capability |
| Dataset/model registry | Prior read-only Supabase inspection found no QuantLab registry tables in inspected schema; PR #384 migration absent from migration history | NOT PROVISIONED | Review migrations and ownership/RLS; do not apply in this phase |
| Worker/runtime | Cloudflare inventory showed Hub, MCP, MT5 proxy/relay Workers; deployed SHA parity and authenticated smoke tests not proven | NOT VERIFIED | Verify deployed routes, versions, auth and read-only data end-to-end |

## 3. Module ownership — one owner per responsibility

| Module | Canonical owner | Must not duplicate |
|---|---|---|
| UI/navigation/session | `apps/nova-command-center` | Root legacy dashboards or a new QuantLab frontend |
| Browser read API client | Existing `src/lib/nova/api.ts` | Another generic frontend fetch client |
| Auth, tenant/resource ownership, route policy, rate limits, correlation IDs | `voom-system-hub` | MCP worker or per-feature auth implementations |
| MCP client protocol | Existing `integrations/remote-mcp-worker` / deployed `voom-system-mcp` pending source parity | A new QuantLab MCP server |
| MT5 market/account history | Existing read-only proxy + relay | Direct MT5 connection from browser, LLM, or Quant Worker |
| Dataset validation and experiment primitives | `workers/quant_engine` | Reimplemented validators in UI/Workers |
| Long-running compute | Isolated Python Quant Worker | Cloudflare request lifecycle or MCP request handler |
| Registry metadata and run lineage | One NOVA registry schema/API (not yet provisioned) | Per-model or per-feature registries |
| Artifact bytes | Existing approved object storage only after inventory; otherwise local/dev artifacts | Database blobs or public browser URLs by default |
| Risk/execution authority | Existing deterministic backend risk policy | Model scores, LLM, UI, MCP or Quant Worker |

## 4. API contract — versioned and bounded

### 4.1 Common rules

- All protected requests require a Supabase access token. Hub validates signature, expiry, audience, issuer, role and current tenant/resource ownership server-side.
- The browser never supplies authoritative `tenant_id`, `owner_id`, role, broker credentials, upstream URL, worker URL, storage path or execution capability.
- Unknown fields and unknown routes fail closed. Enforce request/response schemas, payload limits, timeouts, rate limits and per-tenant quotas.
- Every request carries/receives a correlation ID. Persist sanitized audit metadata: actor/tenant reference, action, resource ID, request hash, result, duration and error class. Never log tokens, credentials or raw account secrets.
- Stable error envelope: `{ "error": { "code": "...", "message": "...", "correlation_id": "..." } }`. Do not leak stack traces or provider internals.
- HTTP semantics: 400 malformed/schema invalid; 401 missing/invalid/expired token; 403 role/tenant denied; 404 non-enumerating missing resource; 409 idempotency conflict/state conflict; 413 payload too large; 422 domain validation failed; 429 quota/rate limit; 502/504 upstream failure/timeout; 503 auth/registry/worker dependency unavailable.
- GET endpoints are idempotent reads. Job creation uses an idempotency key scoped to authenticated tenant + operation; same key + same canonical payload returns the original job; same key + different payload returns 409.
- Browser can read statuses and evidence; only authenticated Hub can enqueue research jobs. There are no broker write endpoints.

### 4.2 Canonical route families

| Method + path | Purpose | Authorization | Owner |
|---|---|---|---|
| GET `/v1/quantlab/capabilities` | Feature flags, supported schema versions, worker readiness | viewer | Hub |
| GET `/v1/quantlab/datasets` | Tenant-scoped dataset manifests and quality state | viewer | Hub → Registry |
| GET `/v1/quantlab/datasets/:datasetId` | One manifest + provenance + quality receipt | viewer | Hub → Registry |
| POST `/v1/quantlab/datasets/validate` | Validate a bounded uploaded/approved data reference; does not mutate source | operator | Hub → Quant Worker |
| GET `/v1/quantlab/strategies` | Strategy catalogue and immutable versions | viewer | Hub → Registry |
| GET `/v1/quantlab/models` | Model/plugin versions and evidence state | viewer | Hub → Registry |
| GET `/v1/quantlab/experiments` | Tenant-scoped experiment/run summaries | viewer | Hub → Registry |
| POST `/v1/quantlab/jobs` | Enqueue bounded validation/backtest/train/evaluate research job | operator | Hub → Job service |
| GET `/v1/quantlab/jobs/:jobId` | Job lifecycle state and progress | viewer, owner scoped | Hub → Job service |
| GET `/v1/quantlab/jobs/:jobId/events` | Bounded event/log summaries | viewer, owner scoped | Hub → Job service |
| GET `/v1/quantlab/artifacts/:artifactId` | Artifact metadata and authorized short-lived read reference | viewer, owner scoped | Hub → Registry/storage |
| GET `/v1/quantlab/reports/:runId` | Evaluation/OOS report and evidence references | viewer, owner scoped | Hub → Registry |
| GET `/v1/quantlab/broker/summary` | Read-only connection/data freshness summary | viewer | Hub → existing MT5 read-only proxy |

No generic proxy, arbitrary file path, arbitrary Python command, arbitrary URL fetch, or user-selected storage key is permitted.

### 4.3 Job request envelope

A job request is a strict discriminated union; reject unknown fields and unsupported job types. Example shape (illustrative contract, not an endpoint currently deployed):

```json
{
  "schema_version": "nova.quant-job.v1",
  "job_type": "backtest",
  "client_request_id": "client-generated-idempotency-key",
  "dataset_manifest_id": "approved-dataset-id",
  "strategy_version_id": "immutable-strategy-version",
  "model_version_ids": [],
  "experiment_spec_id": "immutable-experiment-spec",
  "resource_profile": "free-cpu",
  "requested_timeout_seconds": 900
}
```

Server derives actor, tenant, permissions, actual resource ceiling and worker route. The request cannot contain credentials, broker/account identifiers, shell commands, code blobs, arbitrary URLs, execution flags or an instruction to trade. The worker receives only opaque authorized references and a signed, short-lived job lease.

### 4.4 Job lifecycle

```text
QUEUED -> VALIDATING -> RUNNING -> FINALIZING -> SUCCEEDED
   |          |           |             |
   +--------> REJECTED    +-----------> FAILED
                          +-----------> CANCELLED
                          +-----------> TIMED_OUT
```

- State transitions are server-owned and append-only in the event ledger.
- Terminal states are immutable. A retry creates a new job linked to `retry_of_job_id`; it never rewrites the previous run.
- Cancellation is research-compute cancellation only, never broker cancellation.
- Lease expiry, worker crash, duplicate delivery and retry must be safe and idempotent.
- Persist requested/started/finished timestamps, worker build SHA, input manifest hashes, code/config hashes, seed, evaluator version, resource profile, attempt, result summary and artifact hashes.
- UI must distinguish queued, running, stale heartbeat, retrying, failed and completed; no fabricated progress percentage.

## 5. Registry contract — metadata and immutable references

The registry is a logical ownership boundary, not permission to create production tables now. Before migration, inspect the complete existing schema, policies, migrations, backups and project ownership.

Minimum logical entities:

| Entity | Required fields |
|---|---|
| dataset_manifest | id, tenant_id, schema_version, source/provider, symbol, timeframe, UTC start/end, row_count, content_sha256, source_reference, ingestion_version, quality_report_id, eligibility_status, created_at |
| quality_report | id, dataset_manifest_id, validator_version, gap/duplicate/invalid counts, warnings, checks, report_sha256, created_at |
| strategy_version | id, tenant_id, strategy_key, semantic_version, source_revision, config_sha256, parameter_schema, status, created_at |
| model_version | id, tenant_id, model_key, model_type, architecture_version, feature_schema_sha256, training_dataset_ids, code_revision, artifact_sha256, calibration_report_id, status |
| experiment_spec | id, tenant_id, schema_version, immutable_spec_json, spec_sha256, created_at |
| quant_job | id, tenant_id, requester_id, idempotency_key_hash, job_type, state, attempt, lease_expires_at, worker_revision, timestamps |
| experiment_run | id, tenant_id, job_id, dataset_sha256, strategy/model version refs, config/code/evaluator hashes, fold manifest, cost model, metrics, OOS boundary, result status |
| artifact | id, tenant_id, run_id, artifact_type, object_key_ref, content_sha256, media_type, size_bytes, created_at |
| run_event | id, tenant_id, job_id, sequence, event_type, sanitized_payload, created_at |
| approval_record | id, tenant_id, subject_type, subject_id, evidence_set_sha256, decision, reviewer_id, created_at |

Invariants:
1. Tenant ID is derived server-side and enforced on every read/write; composite ownership checks are mandatory.
2. Dataset, strategy, model, experiment spec, run and artifact identities are immutable once referenced by a completed run.
3. Mutable labels/notes are separate from immutable scientific inputs.
4. RLS must be enabled and tested for owner, cross-tenant denial and service-worker least privilege.
5. Artifact content is addressed by SHA-256 and stored outside relational rows; downloads require short-lived authorized access.
6. Never store access tokens, broker passwords, account login secrets or service-role keys in registry rows or artifact manifests.
7. A registry status of `approved` is not a trading approval.

## 6. Evaluation and model plugin requirements

### Dataset admission
- Source provenance, timezone/UTC normalization, broker symbol mapping, timeframe, session calendar and exact interval policy are mandatory.
- Preserve missing intervals and irregular session boundaries as evidence; never synthesize bars to make a dataset pass.
- Hash canonical normalized content and retain original-source reference/hash.
- Training eligibility requires a passing quality receipt and approved immutable manifest.

### Evaluation
- Use chronological folds only; purge at least the maximum forward label/holding horizon plus explicitly declared embargo.
- No tuning, feature selection, threshold selection or calibration on sealed final OOS.
- OOS boundary is explicit and immutable; report sample count, trade count, costs, slippage/spread/commission, drawdown, PF, expectancy, confidence/uncertainty and regime slices.
- Compare against simple baselines and identical execution/cost assumptions.
- Keep failed/rejected runs in the ledger.
- For trading-strategy evidence, user policy requires at least 30 closed OOS trades, positive net result and PF > 1.0, plus walk-forward robustness and leakage checks. These thresholds are gates, not proof of future profitability.

### Model plugins
Each plugin must declare `plugin_id`, version, model_type, input/output schema, feature schema hash, training/evaluation adapter, deterministic seed behavior, artifact format, runtime requirements, CPU/memory budget, license/dependency profile, safety classification and test vectors.

- XGBoost: reject synthetic/random-label evidence as trading proof; audit feature availability time and forward-label tail.
- LSTM: require a genuine recurrent architecture, optimizer/loss loop, validation/early stopping and serialized state_dict; current ResidualMLP is not an LSTM.
- Vision: require explicit image source, timestamp alignment, point-in-time availability and image preprocessing hashes.
- SMC: pivots/HTF bars become available only after confirmation/close; fills occur at the next eligible event. No future-confirmed swing may leak into earlier entries.
- NOVA Brain/LLM: immutable replay ledger with model/prompt/tool versions; regenerated output is not historical evidence.
- Meta Decision: consumes aligned OOF predictions only; correlated models are not independent votes; abstain for missing, stale, uncalibrated or contradictory inputs. No model output authorizes broker execution.

## 7. UI integration plan

Reuse the current authenticated `AppShell` and navigation. Add one QuantLab workspace with routes/views:

1. Research Overview — capability/readiness, recent jobs, data/model health, explicit NOT CONNECTED/NOT VERIFIED states.
2. Datasets — source, range, quality, hash, gaps, provenance, approval state.
3. Strategies — immutable strategy versions, source revision and parameter schema.
4. Models — plugin type, architecture, training status, artifact hash, calibration evidence.
5. Experiments — frozen config, dataset/code/evaluator identity, fold plan, job lifecycle.
6. Evaluation — OOS/walk-forward, costs, trade counts, uncertainty and eligibility gates.
7. Artifacts — metadata, hashes, access-controlled read links.
8. Evidence — approvals, event lineage, audit trail.
9. Broker Monitor — existing read-only bridge data; keep DEMO labels until verified.

Use existing design primitives, TanStack routing, query hooks, auth and error handling. Never add order buttons, execution toggles, withdrawal/transfer actions or model-to-broker controls. Do not remove existing pages.

## 8. Security and safety acceptance tests

Required automated tests before implementation can be called complete:

- Auth: missing, invalid, expired, wrong-audience, wrong-issuer, missing role and auth-provider outage all fail closed.
- Tenant: own-resource access succeeds; cross-tenant dataset/job/artifact/connection IDs are denied without enumeration.
- Input: unknown fields, oversized payloads, unsafe strings, arbitrary URLs/paths, shell/code injection and invalid hashes rejected.
- Idempotency: same key/same payload returns original job; same key/different payload returns 409.
- Lifecycle: legal transitions only; terminal state immutable; duplicate worker delivery does not duplicate artifacts/events; lease expiry and retry are deterministic.
- Artifacts: hash/size/type validated; tenant-scoped read; no public bucket listing.
- Rate/quota: per-tenant concurrency, job timeout, payload and CPU ceilings enforced.
- MCP: allowlisted research tools only; no arbitrary URL, direct database bypass or broker write tool.
- Trading safety: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`; frontend API client remains GET-only for broker/risk endpoints; no order/close/withdraw/transfer/deposit route exists.
- Evaluation: leakage tests, final OOS sealing, purge/embargo, cost completeness, deterministic replay and failed-run retention.
- UI: no fixture data presented as real; configured/reachable/authenticated/data-verified are distinct statuses.

## 9. Implementation sequence and exit gates

| Phase | Deliverable | Exit gate | Current state |
|---|---|---|---|
| 0 | Architecture + source audit | Main SHA and ownership map recorded | DONE on development branch |
| 1 | Contract reconciliation | Routes, schemas, auth, errors, idempotency, job lifecycle and registry entities reviewed | DOCUMENTED HERE; runtime contract parity pending |
| 2 | Local contracts + tests | Typed schemas, lifecycle/state-machine tests, tenant/idempotency test harness | NOT STARTED |
| 3 | Quant Worker vertical slice | One real CPU-only dataset validation/backtest job; immutable evidence | BLOCKED on approved immutable dataset + worker runtime |
| 4 | Registry persistence | Migration/RLS tests, backup/rollback, owner isolation | BLOCKED on separate migration review and approval |
| 5 | Command Center integration | UI reads real Hub/registry/job API; fixture labels removed only after proof | BLOCKED on deployed Hub contract parity |
| 6 | Model plugin execution | Genuine XGBoost/LSTM/SMC/Brain adapters and reproducible evaluation | BLOCKED on data and real training implementation |
| 7 | End-to-end verification | Authenticated smoke, tenant tests, CI, read-only MT5 proof, build evidence | NOT VERIFIED |
| 8 | Release review | Draft PR reviewed; explicit release decision | NOT STARTED |

This blueprint is not a substitute for executable tests. A green unit-test suite does not prove data provenance, deployed integration, model quality or profitability.

## 10. Explicit blockers / required evidence

1. **Hub API parity:** fetch current Hub source and deployed version; verify route names, JWT validation, tenant derivation, response envelopes and CORS against the frontend contract.
2. **MCP ownership:** verify deployed `voom-system-mcp` source/version and its exact tool allowlist; ensure it delegates authorization to Hub and has no independent broker write capability.
3. **Dataset admission:** produce a real MT5/Exness Demo historical export with provenance, UTC, symbol/timeframe mapping, completeness and immutable checksum; current data gaps remain unresolved.
4. **Compute runtime:** prove a free/local CPU worker can receive authorized jobs, enforce limits, persist artifacts and recover safely. Do not add paid resources.
5. **Storage:** identify already-provisioned free object storage and access policy; if none exists, use local/dev-only artifact storage and mark remote persistence blocked.
6. **Database:** inspect migration history and full RLS policies; draft migrations and tests only until an explicit apply approval.
7. **Frontend:** confirm active app build, route tree and navigation integration in a local Windows/Linux environment; no deployment in this phase.
8. **Model evidence:** replace mock training and MLP/LSTM naming mismatch, then run leakage-controlled evaluation on eligible data.

## 11. Release boundary

This branch may contain documentation and isolated development-only contracts/tests. It must not:
- change Main;
- merge legacy PR branches wholesale;
- deploy Cloudflare/Netlify;
- apply Supabase migrations or alter RLS/auth;
- change secrets, routes, bindings or production configuration;
- enable broker writes, orders, execution or live trading;
- report profitability or model readiness without reproducible OOS evidence.

Release requires a separate reviewed PR and evidence bundle. The default state remains research-only and read-only.


## 12. Executable slice update — research job lifecycle (2026-11-26)

The first domain-level implementation has been added on the Development Branch:

- `workers/quant_engine/job_lifecycle.py` defines a standard-library-only immutable research job snapshot, append-only event value, allowlisted research job types, legal transition graph, optimistic expected-state check, terminal-state immutability, timezone-aware monotonic event timestamps and a bounded `free-cpu` timeout profile.
- `workers/quant_engine/__init__.py` exports the public domain types and functions.
- `tests/test_quant_engine.py` adds lifecycle tests for the happy path, forbidden transitions, terminal immutability, state conflicts, unsafe job types, bounded resources, identity validation, timestamp ordering, event scope and immutable snapshots.
- `workers/quant_engine/README.md` documents the new primitive.
- This is intentionally a pure in-memory domain primitive. It does not provide durable persistence, atomic DB transactions, distributed idempotency, worker leases, HTTP routes, queue delivery, cancellation of running processes or cross-tenant authorization. Those remain Hub/job-service responsibilities and must be implemented separately.

### CircleCI configuration repair

The exact GitHub commit status for the previous head reported:

`No configuration was found in your project. Please refer to https://circleci.com/docs/2.0/ to get started with your configuration.`

The repository had no `.circleci/config.yml` at the audited Main SHA. A default `.circleci/config.yml` has now been added on this Development Branch. It uses `cimg/python:3.11`, compiles the Quant Engine/test modules, and runs the standard-library unittest suite without installing third-party dependencies. The new CircleCI check name is `quant-foundation`; its result must be checked at the latest branch head before merge.

### Exact-head verification status

- [x] Confirmed CircleCI failure reason from GitHub commit status description.
- [x] Added the default CircleCI config path on the Development Branch.
- [x] Added the research-job lifecycle domain module and unit tests.
- [ ] CircleCI `quant-foundation` check completed successfully at final head.
- [ ] GitHub Actions `quant-foundation-tests` completed successfully at final head.
- [ ] Local Windows frontend validation; blocked because C: drive reported 0 bytes free and Bun was unavailable. No files were deleted to free space.
- [ ] Durable job persistence/idempotency/lease implementation.
- [ ] Hub/MCP runtime parity, authenticated worker dispatch and tenant-isolation tests.

The CircleCI config repair is a code/config fix, not proof that CircleCI is green. The domain state machine is not a production queue or evidence of an operational QuantLab runtime.


## 13. CI follow-up — failure details and current blockers (2026-11-26)

The first GitHub Actions run for the new lifecycle slice executed 46 Quant Engine tests and exposed two issues:
1. An existing split test omitted the now-required `purge_bars` argument.
2. The new timestamp test used an event timestamp equal to job creation time while asserting that an earlier timestamp must be rejected.

Both test inputs were corrected on the Development Branch. The latest head is `eb6172ed9d2816eaf1965aae39f7da0d6a0cfe96`.

CI evidence must be interpreted carefully:
- GitHub Actions run at the preceding code head `f61de11b0477d7d01ceec582e533161d52be4336` still failed on the equal-timestamp assertion. The correction was committed afterward. No GitHub Actions check run is currently available for the latest head, so the corrected suite is NOT VERIFIED at final head.
- CircleCI now recognizes the newly added default config and creates the `quant-foundation` workflow. The latest observed CircleCI job still failed after 3 seconds. The available GitHub status gives only a generic job-failed summary; detailed logs require CircleCI CLI/API access.
- The connected Windows environment has no `CIRCLE_TOKEN`, no CircleCI CLI, and no free disk space. The browser connector is not attached to an authenticated browser context. Therefore CircleCI job logs could not be retrieved; do not guess the remaining failure cause.
- The earlier `No configuration was found in your project` status has been replaced by a real CircleCI workflow/job result. This confirms config discovery, not job success.

### Required next verification

1. Retrieve CircleCI job logs from pipeline `#2308` / workflow `5853dc7c-cebb-439c-a348-00e708ba9e6f` / job `91d60be7-eeb5-441d-b750-cde5719778f2`.
2. Run or dispatch the GitHub Actions `quant-foundation-tests` workflow against exact head `eb6172ed9d2816eaf1965aae39f7da0d6a0cfe96`.
3. Do not mark the lifecycle slice CI-green until both outcomes are available and successful.


## 14. Final exact-head check — GitHub Actions passed (2026-11-26)

At Development Branch head `fdd366ed112d50c110a7ad57ad7de8ec9d20a1f0`:

- GitHub Actions `quant-foundation-tests`: **SUCCESS**.
- Python: 3.11.
- Compile step: passed.
- Quant Engine unittest suite: **46 tests, OK**.
- Run/job: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/45697754124/job/139499507781
- Supabase Preview: skipped because this PR branch is not associated with a Supabase Preview branch; no migration was attempted.
- CircleCI `quant-foundation`: **FAILURE** at pipeline #2310, job duration 1 second. CircleCI details remain inaccessible without CircleCI API/CLI authorization. This remains a failing required signal until diagnosed or the integration is intentionally reconfigured by an authorized owner.

The passing GitHub Actions result validates the 46 local Quant Engine unit/contract tests at this head. It does not validate CircleCI, frontend build, durable job persistence, API integration, Supabase RLS, MT5 runtime, training quality or trading profitability.
