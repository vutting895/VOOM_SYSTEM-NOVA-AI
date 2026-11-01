# NOVA Learning Universe 16 and Auto-Learning Loop

- Date: 2026-10-31
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Baseline: `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`
- Related tracker: Issue #96 — Deep Research Core / Quantitative Intelligence Engine
- Scope: shared track inventory, readiness semantics and a research-only lifecycle contract
- Safety: Read-only + AI Analysis; order submission disabled; Live Trading OFF

## 1. Product decision

Learning Universe 16 is the learning/research capability map across NOVA. It is not a claim that 16 independent models are trained, deployed or running.

The canonical list is maintained in `frontend/lib/learning-universe/catalog.mjs` and consumed by both the Learning Universe page and AI Analysis. Do not maintain a second, divergent module list in a page or legacy integration.

The Learning Universe lifecycle is complementary to Issue #96's Deep Research Core:
- Deep Research Core owns research tasks, source snapshots, claims, hypotheses and research synthesis.
- Quant Compute owns deterministic experiments and evaluation.
- The Learning Universe lifecycle owns the bounded progression of a learning candidate through evidence gates and human review.
- NOVA System Integration Hub remains the identity, tenant authorization, idempotency and audit boundary.

This change does not duplicate the Deep Research task/source/claim validators proposed in PR #99, and does not assume PR #94, #97 or #99 has merged.

## 2. Readiness states

| State | Meaning | What it does not mean |
|---|---|---|
| `planned` | No canonical implementation evidence has been verified for the track | Not implemented, trained or running |
| `prototype` | A research prototype or contract exists in source | Not production-ready or runtime-verified |
| `partial` | A bounded supporting capability exists in source | Not a complete learning pipeline or independently verified runtime |

No track is labelled `online`, `trained` or `production` by this catalog. Those states would require fresh runtime evidence and a separately reviewed activation process.

Current source-based classification:
- **Prototype:** Technical Pattern Lab, Feature Engineering, Auto-Learning Loop.
- **Partial:** Risk Intelligence, Backtest Validation.
- **Planned:** the remaining 11 tracks.

The catalog includes evidence paths and a limitation summary for every non-planned track. The classifications are conservative and must be revised only when code, automated checks and relevant runtime evidence support the change.

## 3. Auto-Learning Loop state machine

The first code milestone is a dependency-free, fail-closed lifecycle primitive under `workers/learning_universe/`.

```text
DRAFT
  -> DATA_VALIDATED
  -> EXPERIMENT_READY
  -> EVALUATED
  -> REVIEW_PENDING
  -> APPROVED_FOR_SHADOW
     or REJECTED
```

### Required gates

1. **DRAFT → DATA_VALIDATED**
   - Immutable dataset manifest ID and SHA-256.
   - Separate data-quality report ID.
   - Explicit passing data-quality result.

2. **DATA_VALIDATED → EXPERIMENT_READY**
   - Approved, versioned feature and label contracts.
   - Code revision and evaluation-plan ID.
   - Cost model and baseline identifiers.
   - Purge/embargo values, fixed seed and a reserved final out-of-sample set.

3. **EXPERIMENT_READY → EVALUATED**
   - Immutable evaluation report and hash.
   - Reproducibility receipt.
   - At least one out-of-sample window.
   - Final OOS untouched, cost sensitivity passed, baseline comparison passed and independent risk guardrails passed.

4. **EVALUATED → REVIEW_PENDING**
   - Candidate report ID and hashed review packet.

5. **REVIEW_PENDING → APPROVED_FOR_SHADOW or REJECTED**
   - A human reviewer identity and rationale.
   - Approval is restricted to `paper_shadow_only` and requires a shadow plan.
   - Service/model actors cannot approve or reject a candidate on behalf of a human.

The approved state is terminal in this contract. There is no transition to production, model auto-promotion, broker action, order submission or Live Trading.

## 4. Data and trust boundaries

- Owner and tenant identity must come from the trusted NOVA Hub session context, never from an LLM, browser payload or candidate evidence.
- Learning-cycle evidence contains references, hashes and evaluation metadata only. Broker credentials, account identifiers, tokens, positions, orders and raw secrets are not accepted as evidence fields.
- External source retrieval, URL fetching, persistence, queueing and compute dispatch are not implemented by this lifecycle primitive.
- Research outputs are untrusted data. They cannot modify system instructions, select broker routes, relax risk gates or authorize tools.
- A model may help draft hypotheses and summarize results; deterministic code validates gates and a human approves a paper/shadow candidate.
- Candidate rejection and failed experiments must be retained by the eventual audit/persistence layer rather than silently discarded.

## 5. What this milestone implements

- One canonical list of 16 tracks shared between frontend screens.
- Explicit source-based readiness labels and limitations instead of a generic "not yet verified" for every track.
- A typed, bounded state machine with monotonic revisions and audit history.
- Contract tests for skipped stages, missing/failed evidence, hash/timestamp validation, final-OOS protection, human-only decisions and forbidden execution promotion.

## 6. Remaining work before an operational learning loop

1. Review and merge the Quant Engine foundation and its evaluation-hardening dependencies; do not assume open PR code is part of `main`.
2. Reconcile the canonical Supabase project and migration history before persistence work, following the migration baseline issue/PR linked to #96.
3. Adapt the cycle to the accepted Deep Research hypothesis and Quant Experiment contracts after those contracts are reviewed and merged; do not create duplicate schemas.
4. Add owner/tenant-scoped persistence and audit using the existing Hub/RLS patterns, with cross-tenant allow/deny tests.
5. Select an external compute runner only after data, runtime, idempotency, retry and artifact storage boundaries are reviewed. Do not run training inside request-bound Cloudflare Worker handlers.
6. Add drift monitoring, reproducibility checks, human review UI, rollback and deprecation.
7. Verify the exact candidate SHA in CI and a controlled staging environment before changing a readiness label or enabling any additional capability.

## 7. Definition of done

A track is not complete because it appears in the catalog. Operational readiness requires:
- source implementation and ownership;
- deterministic contract/unit tests and relevant negative tests;
- data lineage, dataset and model/artifact versioning;
- tenant authorization and audit where persisted;
- runtime health and observed execution evidence;
- documented failure, rollback and human-approval behavior.

The Learning Universe is research-only. Exness Demo/MT5 remains read-only; `ordersEnabled=false`, `executionEnabled=false` and `liveTradingEnabled=false`.
