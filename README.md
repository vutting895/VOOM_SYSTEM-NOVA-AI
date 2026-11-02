# VOOM_SYSTEM — NOVA

## Purpose
Modular market-research and paper-trading platform: market-data ingestion, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation, and broker integration.

## Current safety state
- Live order execution remains disabled. The active broker target is Exness Demo via MT5 read-only bridge; Alpaca is not part of the active broker workflow.
- Public market data is read-only. Never commit secrets or real credentials.
- Gen AI currently uses rule-based strategy templates unless an LLM provider is explicitly configured; it is not a model trained from scratch.
- Backtests use historical OHLCV and are not tick-accurate or predictive.
- ML examples under `workers/feature` are research prototypes, not a production pipeline.

## Frontend hosting and deployment

- **Primary customer-facing frontend: Netlify** at `https://voomsystem.netlify.app/`. After PR #74 merged as `a53623063d8cf9ebcc30f6c508d2a44b7ba8d9fd`, main-branch smoke tests returned HTTP 200 for `/`, `/login`, and `/settings/broker`; however, the connected Netlify project API still reports published deploy `6ae38a561eb1efe24a5a1105` on older commit `f8845887ebf2619e2723727735634246a4a54be9`. Exact Production commit reconciliation remains open.
- Netlify Observability recorded HTTP 200 for the production root, Next.js RSC requests for `/login`, `/profile`, and `/broker`, and static frontend assets after that deployment. The anonymous broker-status endpoint returned HTTP 401 as expected. These observations do not prove a real OTP login/session or the complete broker route.
- The legacy Cloudflare UI `voom-system-nova-ui` is retained temporarily as a rollback option, not the desired production target. The deployment workflow change to backend-only Cloudflare deploys and the root `netlify.toml` are in review in the Netlify alignment PR; do not describe that repository cutover as merged until it is.
- A historical Netlify Deploy Preview failed in the UI-installed `netlify-plugin-checklinks` post-build phase. Later previews for PRs #69 and #71 succeeded. The new hosting-alignment PR still needs its own Preview and logs verified; do not assume older failures or successes transfer to a new commit.
- Required Netlify dashboard variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only), `NEXT_PUBLIC_SYSTEM_HUB_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Configure them in site settings and never commit their values.
- `.github/workflows/frontend-ci.yml` validates worker/security tests, type-check, and the Next.js build. Its production smoke-test job checks Netlify routes on a push to `main`. `.github/workflows/cloudflare-deploy.yml` is being aligned to deploy backend Workers only.

## Unified frontend and NOVA Chat

- Use this repository's `frontend/` as the single web application; integrate Chat into NOVA rather than merging the separate Eve Chat repository.
- The shared navigation links Dashboard, AI Chat, AI Analysis and other existing routes.
- Chat calls a same-origin authenticated Next.js API route. That route verifies the Supabase session before forwarding a bounded conversation to the NOVA AI Worker; the Worker returns an error rather than inventing a response when the provider is unavailable.
- Structured intent is a data-only `nova.intent.v1` envelope with a strict allow-list of intents, parameters and component types. Both the Worker and the API boundary validate it. The frontend renders only the fixed React component catalog; it does not evaluate model-supplied HTML or JavaScript.
- The current classifier is deterministic first-pass routing, not yet a model-generated Zod/Pydantic structured output parser. Intent cards are research-only and have no execution controls.
- Chat history is page-memory only and is not persisted across refreshes. Durable threads, LangGraph checkpoint/resume, approval lifecycle and real two-user session tests remain open.
- The current Backtest page reports a buy-and-hold baseline, not a strategy backtest. Do not describe baseline metrics as evidence of EMA/RSI performance.

## Environment
Configure frontend variables in the selected Netlify site and backend secrets in Cloudflare/GitHub Actions as appropriate. Never commit secret values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only; never a service-role key)
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- GitHub Actions backend deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. The UI must show unavailable rather than claim a broker connection when authenticated System Hub or owner-session reads are not verified.

## Current deployment verification limits

The current Netlify Production deploy is ready on the expected main-branch application commit, and Observability records HTTP 200 for the root, login/profile/broker Next.js RSC routes, and static assets after deployment. Remaining checks are still material: a direct `/settings/broker` response was not observed in the reviewed log window, no post-deploy direct `/auth/callback` request was observed, and the user's real email OTP/session flow has not been demonstrated.

The actual Supabase owner-session path through System Hub/MT5 Proxy is not yet verified with a signed-in browser session. A valid owner connection read and a foreign connection-ID denial are still required. Anonymous HTTP 401 checks are only negative unauthenticated evidence, not proof of cross-user isolation.

Netlify Observability also recorded repeated `PUT /api/inngest` HTTP 404 requests; current repository search found no Inngest handler/reference. Identify the source before changing application routes. Historical preview 401 responses are expected because non-production Netlify deploys require SSO; old preview 404/500 entries are not evidence of a current Production failure.

Do not change Supabase Site URL/redirect settings or mark cutover fully accepted until the route smoke test, real OTP session persistence/logout, owner access, and foreign-connection denial have passed against a commit/deploy recorded in evidence. Keep Exness Demo/MT5 read-only, and keep order submission and Live Trading disabled.

## Architecture
- `frontend/`: Next.js UI; Netlify is the selected target, and Cloudflare remains the verified fallback until cutover gates pass.
- `integrations/remote-mcp-worker/`: primary Cloudflare Remote MCP endpoint; read-only research tools and paper-risk validation.
- `integrations/mt5-readonly-proxy/`: authenticated Cloudflare proxy for the per-tenant read-only bridge.
- `workers/data-ingestion/`: public market-data adapter.
- `workers/feature/`: imported ML research prototypes; dependencies and leakage checks required.
- `workers/gen-ai/`: strategy-draft prototype.
- `workers/backtest/`: deterministic OHLCV EMA crossover simulation.
- `workers/tuning/`: bounded parameter-grid prototype.
- `workers/risk/`: fail-closed paper risk policy.
- `workers/portfolio/`: allocation validator.
- `workers/execution/`: intentionally disabled.
- `shared/`: JSON schemas and feature-store contract.
- `supabase/migrations/`: database migrations.

## Not production-ready yet
OAuth end-to-end verification, leaked-password protection, review of SECURITY DEFINER RPC grants, runtime monitoring, broader tests, and historical-data quality/fee modelling remain necessary before considering any live trading.

## Git-first development and Windows runtime
- **Develop in GitHub, not in the Windows runtime folder.** Use branches and reviewed commits in `vutting895/VOOM_SYSTEM-NOVA-AI`; `main` is the runtime source of truth.
- Windows is required only for the MT5 terminal and the tenant-guarded, read-only MT5 Bridge. Cloudflare Workers cannot run the Windows MT5 terminal.
- The tracked bootstrap is `tools/windows/run-bridge-from-git.ps1`. It refreshes a shallow sparse checkout of `integrations/mt5-readonly-bridge/` and `tools/windows/` into `%LOCALAPPDATA%\VOOM_SYSTEM\runtime\repo` before launching the Bridge, so both the Bridge and bootstrap source come from Git.
- Keep only the small bootstrap copy, runtime checkout and its isolated Python environment, MT5 terminal, and private local tenant files on Windows. Tenant files stay under `%LOCALAPPDATA%\VOOM_SYSTEM\secrets` and must never enter Git.
- Do not remove the existing development checkout until all its modified and untracked files have been compared with GitHub and any unique work preserved. Build caches may be deleted only after the replacement runtime has been verified.
- The Bridge remains read-only; the bootstrap does not submit orders or enable live trading. A process start alone is not proof of a broker connection.


## Wave3 + SMC research (PR #66; feature branch only)

The v6.2.6.3 Wave3/Fibonacci + SMC + XGBoost/60-bar PyTorch LSTM research pipeline is isolated in [Draft PR #66](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/66), not yet part of `main`. Historical Exness Demo XAUUSDm M15 bars and the validated USD high-impact calendar are research inputs only. The calendar CSV is `datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv` (2,166 high-impact USD events; coverage [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z)).

Latest completed calendar-filtered training artifact: [workflow run #3](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41163353027), training SHA `70fa601ebfaf8b992f80c5b27a60247979e7bceb`, artifact #13028341403, archive SHA-256 `218e15c46b8db53c37d263482d96845fa90addab0e292f04c53a91b694b20c17`. The artifact's manifest/report agree on the canonical Git-tracked calendar SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`, 2,166 events, all `datetime`, coverage [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z). The repository CSV is 386,146 bytes. The independent preflight pins the canonical LF-normalized Git bytes. Earlier notes recorded a 388,313-byte raw terminal CSV and CRLF normalization, but the raw file is not present in this checkout and the raw digest values recorded across notes are inconsistent. One supplied value is only 58 hex characters and another 64-character value is not independently reproducible here. Treat raw-terminal SHA/size provenance as unverified. The canonical Git file is independently verified at 386,146 bytes with SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`.

Run #3 Final OOS: 7,942 rows; accuracy 41.3246% vs 45.9708% majority baseline; balanced accuracy 39.1057%; macro-F1 37.6761%; 0 closed trades; net $0; PF unavailable. All five walk-forward folds are below baseline. The artifact reports 7,421/7,942 final OOS bars news-safe, max SMC 75 on Wave3 trigger rows, and zero rows passing SMC >=85. Performance gate remains blocked.

Keep Fib >=80, SMC >=85, XGB BUY >=75%, LSTM BUY >=80%, ensemble BUY >=85%, XGB/LSTM weights 60/40, all RSI/volume/momentum/trend/spread/news rules and fixed risk limits unchanged. No broker orders, deployment or Live Trading. The branch must be reviewed against current `main` before any merge; the PR remains Draft.


### Revalidation — 2026-11-01

- Current source of truth: `main` at `99d474038e19a6eab884c5c891b21770c50fefa5`.
- PR #66 benchmark branch was synced with a non-force merge commit `e8b79297bf5a88cb51c08006e38787fb4f41bea3`; compare against current `main` is 46 ahead / 0 behind.
- PR #147 redesign branch was synced with a non-force merge commit `4e97920a783c6ad99a3a009114f565f0a565bed9`; compare is 5 ahead / 0 behind. Both PRs remain Draft/open/unmerged.

Prior notes recorded a 388,313-byte raw Exness MT5 Common Files export and two `NEWS_EXPORT_SUCCESS` markers in `MQL5/Logs/20261030.log` (2,166 events, 15,853 queried values, zero unknown time modes). Those are historical evidence, not a fresh terminal check in this run. The raw CSV is not present in this checkout; raw SHA-256 values recorded in prior notes are inconsistent, and one value supplied in the latest evidence is only 58 hexadecimal characters. Therefore raw-export SHA provenance is currently unverified. The canonical Git CSV is independently verified at 386,146 bytes with SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`; validation found 2,166 unique high-impact USD/US events, all `datetime` mode, no missing/blank/duplicate/out-of-range rows, and coverage [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z).

Latest completed training artifact is workflow run #6 on commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, artifact #13036729349 (archive SHA-256 `bfc4bb6419eb4226ba90bea6ad940b036847d4d6be5522af023629d960003bd4`). Final OOS (7,942 rows): accuracy 41.0602% vs 45.9708% majority baseline; balanced accuracy 38.8382%; macro-F1 38.0253%; 0 closed trades; net $0; PF unavailable. All five walk-forward folds remain below their baselines. SMC max on 34 Wave3 triggers is 75; BOS20=21, three-higher-lows+green=12, OB-within-$5=1, FVG refill=7, and no row reaches SMC >=85. Calibration remains absent. Candidate-level same-bar causal traces are still required; marginal counts do not prove OB is the sole cause.

Keep the frozen benchmark rules unchanged. No new full training is authorized until the causal SMC audit is complete; no orders, merge, deployment or Live Trading.

### P1 causal SMC candidate audit — 2026-11-01

The exact-head SMC/Wave3 CI generated a diagnostic-only trace for all 34 Wave3 final-OOS candidates. See [candidate trace audit](reports/wave3_smc_candidate_trace_audit_20261101.json) and [CI run #84](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41271885730). The trace artifact is #13070220119 (archive SHA-256 `f67f6e0cbe0bd74657a83b8c828eb2f7120e3882a4c048c07c4c2cc549636a2e`). No model training was run.

The four frozen SMC components had zero all-four same-bar intersections (maximum score 75): BOS20=21, three confirmed higher lows + green=12, OB within $5=1, FVG overlap=7. The only within-$5 OB candidate had no other scored component. Structural CHoCH and the scored higher-lows rule remain distinct fields. The new diagnostic-only FVG trace found that five of seven FVG-positive candidates re-touched a gap after an earlier full mitigation; the current 48-bar active-gap implementation does not deactivate a gap after full mitigation. This requires a definition review; it is not permission to change the frozen gate.

The benchmark remains blocked: latest completed run #6 OOS accuracy 41.0602% vs 45.9708% baseline, balanced accuracy 38.8382%, macro-F1 38.0253%, 0 closed trades, net $0, PF unavailable. Keep PR #66 Draft/open/unmerged, do not deploy, and keep order submission/Live Trading OFF.

### Run #6 XGBoost/LSTM diagnostic — 2026-11-01

The serialized run #6 XGBoost model was inspected without retraining or touching final OOS for tuning. See [model diagnostics](reports/wave3_run6_model_diagnostics_20261101.json). Training and OOS label proportions are similar, but predicted classes are skewed: Short 41.37% vs 27.68% actual, Long 17.82% vs 26.35% actual (Long recall 20.11%). XGB gain is led by time-of-day, volume, volatility and spread features; grouped structural/Wave3/SMC/Fib gain is 22.28%. These are descriptive, not causal; inner-fold-only permutation/ablation is still required. LSTM validation-loss, feature-attribution and calibration evidence is absent. The latest run #6 remains below baseline (41.0602% vs 45.9708%) with 0 closed trades and PF unavailable.


### Revalidation — 2026-11-02

- Current source of truth: `main` at `a9bb92c9d2642eff34be2ea68276a33b367ee793`. PR #66 and PR #147 were each synced from main with non-force merge commits and remain separate Draft/open/unmerged research branches.
- Canonical XAUUSDm M15 Git blob SHA-256 was independently recomputed as `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266` (8,483,411 bytes). `datasets/exness-demo/metadata.json` now records the canonical size and preserves the previous size separately.
- SMC/Wave3 Research CI [#106](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41385215194) passed on exact PR #66 head `420d12c60f4a7da60e0514899fb9eddd023e7509`: [run #106](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41385215194), artifact #13114634785 (archive SHA-256 `a5529ce365b4709552c8b21b189d099543c8fdb28937568e2c2f78f12a25083b`). Corrected candidate trace: 34 Wave3 candidates; BOS20=21, higher-lows+green=12, OB within $5=1, FVG overlap=7, all-four same-bar=0, max SMC=75, SMC>=85=0. First FVG full mitigation occurred on the signal bar for 2/7 FVG-positive candidates; 5/7 were mitigated earlier. Current-bar re-touch counts are now reported separately; no frozen gate changed.
- Latest benchmark remains Run #6 on training commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, artifact #13036729349. Final OOS: accuracy 41.0602% vs 45.9708% baseline; balanced accuracy 38.8382%; macro-F1 38.0253%; 0 closed trades; net $0; PF unavailable. The run #6 artifact manifest SHA-256 is `7470adc0f28f298e1e83225aa11707807e27c56ea8de667e29cb038b0fc78550`; a versioned copy is stored under `models/wave3_news_calendar_20261030/`. Commission remains assumed zero and unverified; no production net expectancy claim is allowed.
- Separate PR #147 P2: challenger-only first-hit label builder, 11 synthetic tests and dedicated CI #8 passed. The builder fails closed without verified commission provenance and has not been run on real Exness data. Do not fold it into PR #66.

No fresh MT5 export, full training, merge, deployment, broker order or Live Trading occurred. Performance Gate remains blocked.
