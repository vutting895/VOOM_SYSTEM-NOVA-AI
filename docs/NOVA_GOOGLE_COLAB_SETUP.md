# NOVA Google AI Studio + Colab Setup and Readiness

## Decision
- Google AI Studio / Gemini: AI development and optional model-assisted research.
- Google Colab: interactive, temporary notebook runtime for environment preflight and later controlled experiments.
- Cloud Run: deferred until project access, IAM, billing state, and actual cost exposure are verified.
- GitHub remains the source of truth for code and review evidence.

## Current operating boundary
This setup is zero-cost-first. Do not enable billing, create paid resources, or upgrade subscriptions without explicit approval. Do not put API keys or broker credentials in source code, notebook outputs, GitHub, or chat.

NOVA remains READ-ONLY:
- ordersEnabled=false
- executionEnabled=false
- liveTradingEnabled=false

## Colab preflight
Open the notebook:
`colab/nova-auto-learning/NOVA_Colab_Runtime_Preflight.ipynb`

The notebook only reports runtime capabilities and whether optional secret names are configured. It does not reveal secret values, call the Gemini API, access broker endpoints, download market data, train models, upload artifacts, or mount Google Drive.

Add `GEMINI_API_KEY` to Colab Secrets only if a later reviewed notebook requires Gemini API access. Add Exness Bridge secrets only after the tenant-specific read-only route is provisioned and independently verified. Do not configure secrets merely to make the preflight pass.

## Training readiness
Training is currently blocked. The repository's Exness XAUUSDm H1 dataset manifest reports:
- 12,733 rows
- 7,419-hour missing historical segment
- `training_eligible=false`
- `completeness_status=BLOCKED_MISSING_HISTORICAL_SEGMENT`

No synthetic candles may be used to fill the gap. Recover a genuine historical export with UTC timestamps, OHLC, genuine MT5 tick_volume, source provenance, and checksum; then run the repository validator and exact-head tests.

The separate Gold Lab PR #243 is Draft and diverged from current main. The Colab Auto-Learning notebook in PR #241 is also Draft and depends on PR #237 and PR #197. Do not merge or run those branches as if they were current main.

## Colab limits
Colab is an interactive notebook environment, not a reliable daily production scheduler. Google states that resource availability and usage limits vary and are not guaranteed. Use Colab for manual experiments only; keep durable ingestion, scheduling, and production orchestration in a separately verified runtime.

Official reference: https://research.google.com/colaboratory/faq.html

## Acceptance criteria
1. User manually opens the notebook in their own Google account.
2. Runtime preflight executes and records Python, CPU/RAM, package availability, and Colab detection.
3. Secret presence is reported as a boolean only; secret values are never printed.
4. No training starts during preflight.
5. Dataset recovery and quality validation pass before any separate training notebook can run.
6. Gemini API access is tested only after the user has configured their own key and quota is checked.
7. Cloud Run remains deferred until billing and IAM are reviewed.

## Evidence labels
- Runtime preflight passed: Colab notebook cells executed successfully.
- Gemini API verified: a real minimal API request succeeded under the user's configured project and quota.
- Dataset eligible: exact validator output and manifest both pass.
- Training completed: a real run ID, logs, metrics, and artifacts exist.
These are distinct claims and must never be conflated.
