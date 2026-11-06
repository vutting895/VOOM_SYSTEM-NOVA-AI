# NOVA Knowledge Base Index

Status: initial repository organization guide. This index does not claim that every listed capability is production-ready.

Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
Source of truth: `main`
Baseline reviewed: `6e8d390ac45187fb70b6acb23f1e428a20ca7006`

## Purpose

Provide one discoverable map for NOVA engineering knowledge while preserving the current runtime layout. This is an index and classification policy, not a bulk file move.

## Canonical knowledge areas

| Area | Canonical location | Scope |
|---|---|---|
| Architecture and system contracts | `docs/architecture/` | System boundaries, project contracts, provider-neutral interfaces, tenancy and control-plane design |
| Implementation and operations | `docs/implementation/` | Runbooks, readiness gates, deployment, rollback and operational checklists |
| Research | `docs/research/` | Experiments, literature notes, hypotheses and evaluations not yet adopted as runtime behavior |
| API contracts | `docs/openapi/` | Machine-readable API specifications |
| Trading and market intelligence | `workers/`, `integrations/system-hub/`, relevant `docs/` | Market data, strategies, backtesting, risk and broker read adapters |
| Video platform | `integrations/nova-video-engine/`, `docs/NOVA-AI-VIDEO-PLATFORM-SPEC.md`, related video docs | Video planning, rendering pipeline, worker API and product specifications |
| Shared contracts and schemas | `shared/`, `supabase/migrations/` | Shared runtime contracts, schemas and database migrations |
| Tests and quality gates | colocated `tests/`, root `tests/`, `.github/workflows/` | Automated verification and acceptance evidence |

## Runtime classification rules

Every implementation or research artifact should be identified as one of:

- **Production runtime** — deployed or deployable code with current ownership, tests, configuration and operational evidence.
- **Integration adapter** — bounded interface to an external provider or system; provider capabilities and permissions must be explicit.
- **Prototype** — experimental implementation, mock, scaffold or proof of concept; must not be presented as production capability.
- **Research** — hypothesis, benchmark, design exploration or training experiment; not an enabled runtime feature.
- **Historical / recovered** — preserved for audit or migration history; not an instruction to replay or reapply automatically.

File names containing `prototype`, `example`, `mock`, `synthetic`, or `demo` are useful clues but are not sufficient proof of status. Confirm implementation, callers, tests and deployment evidence before reclassification.

## Existing structure observations

The reviewed tree contains overlapping worker-oriented areas, including:

- `workers/` — root worker prototypes and strategy/risk modules.
- `integrations/nova-ai-mcp-full-clean/workers/` — imported worker collection with its own learning control and modules.
- `integrations/system-hub/` — broker/provider integration control plane.
- `integrations/mt5-readonly-bridge/` and `integrations/mt5-bridge-relay/` — Exness/MT5 read-only bridge and relay paths.
- `docs/` — architecture, implementation, research, video, API and operational documents.

These are not automatically duplicates. Do not move, merge, rename or delete them until import history, runtime imports, CI references, deployment manifests and active PR dependencies have been checked.

## Safety and provenance requirements

1. Keep Exness Demo and broker integrations read-only. Keep order submission, execution and live trading disabled unless a separately approved safety transition explicitly changes that policy.
2. Never put credentials, tokens, private keys, customer account identifiers or secret values in documentation, examples, logs or fixtures.
3. Label synthetic, mocked, simulated and unverified metrics explicitly. A design target or passing unit test is not production evidence.
4. Preserve source provenance for datasets: provider, instrument, timeframe, date range, timezone, collection method, checksum and licensing/usage constraints where known.
5. Treat recovered database migrations as historical evidence. Never replay them into Production solely because they are present in the repository.
6. Prefer links to canonical files over copied documentation. When content must be duplicated, identify the owner and synchronization rule.

## Video Reel learning intake

The supplied Facebook Reel URL could not be retrieved in the current review session. Therefore no claims about its contents have been inferred or added.

Intake record:
- Source URL: https://www.facebook.com/reel/2237076623910462/
- Status: **Awaiting accessible video or transcript**
- Next action: extract the actual concepts, verify them, then map each concept to the relevant knowledge area above.
- Do not label any concept as adopted, implemented or validated until its source content and repository changes have been reviewed.

## Safe organization workflow

1. Inspect current `main` SHA and the complete repository tree.
2. Search for existing canonical documents and open PRs before adding or moving files.
3. Trace imports, build scripts, tests, workflows, deployment manifests and database migration history.
4. Propose one bounded change per PR; prefer index/link updates before physical moves.
5. Validate links, tests and affected workflows on the exact PR head SHA.
6. Merge only after required checks and review gates pass; never edit `main` directly.

## Suggested follow-up sequence

- Add the video-derived knowledge only after the Reel is accessible.
- Build a file inventory with status, owner, runtime callers, tests and deployment evidence.
- Resolve worker duplication only where code-level evidence confirms overlap.
- Add per-domain READMEs where they improve discoverability and do not duplicate existing specifications.
