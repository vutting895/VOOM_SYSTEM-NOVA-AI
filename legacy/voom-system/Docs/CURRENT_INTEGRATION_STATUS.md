# Voom_system — Current Integration Status

Updated: 2026-10-25

## Canonical project root
`C:\Users\Administrator\Documents\Voom_system`

## Intended ownership
- `Source1_Extracted/main_bot_v62_best.py`: authoritative Source 1 entry/exit strategy. Strategy logic is preserved.
- `Source1_Extracted/api_server.py`: authenticated local API; new `POST /strategy/analyze` calls the Source 1 signal engine using supplied OHLCV candles and returns a candidate or HOLD.
- `Python/risk_guard_optimizer.py`: independent risk validation; not yet wired into the new Source 1 analysis endpoint.
- `Python/voom_http_adapter.py`: read-only local MT5 bridge adapter. Allowed commands remain PING, GET_PARAMS, ANALYZE.
- `EA/SmartScalpingBridge.mq5/.ex5`: existing EA. No order-sending logic was modified in this update.
- `Worker/`: separate secondary veto service. It is not the Source 1 signal generator and is not connected to the new endpoint.
- `Dashboard/`: private staff UI. AI Agents view is labeled AI Marketplace and reads the registry through the role-checked staff API. Customer-facing AI Marketplace is deployed at `https://voom-ai-private-chat.suwapat787.workers.dev/`; it calls only authenticated customer RPCs for list/subscribe/pause. Cloudflare deployment version on 2026-10-23: `d6a6b225-56d4-44f8-a842-ee205188af63`.
- `Security_Dashboard/`: local-only security review tool; customer identity-provider events are not connected.
- `Research/`: knowledge store and research materials.

## Verification and boundaries
- Source 1 API endpoint accepts 100–2,000 OHLCV candles, validates numeric/ohlc values and requires API bearer authentication.
- Analysis endpoint has no order execution, and always reports `executionEnabled: false`.
- DL score defaults to 0 because the current ensemble is not validated; do not treat it as production confidence.
- Trading stays paper-only. Source 1 API smoke tests passed against 150 real GOLD M15 historical candles: health, missing-token denial, invalid-OHLC rejection, and candidate/HOLD response with `executionEnabled: false`. This is an API smoke test, NOT a strategy backtest or profitability validation. Repeat with `python -m unittest discover -s tests -v` from `Source1_Extracted`.
- Core integration checks: 13/13 PASS; Risk Guard: 8/8 PASS; AI Trading Lab direct smoke tests: 4/4 PASS. These do not certify Source 1 performance.
- Supabase registry contains Source 1 `source1-mean-rejection-smc-wave-v6-2` version `6.2-test.1` with lifecycle `testing`; all four approval gates remain false. Current customer-visible approved strategies: 0. Do not approve until reproducible Source 1-specific backtest, chronological out-of-sample validation, demo-forward testing, risk review, and explicit staff approval.
- Customer Marketplace list/subscribe/pause RPCs are granted to `authenticated` and denied to `anon`; the tables have RLS and direct browser table grants are revoked. Full end-to-end customer login was not tested. Signal delivery schema exists but fanout/EA acknowledgement is not implemented.
- The Dashboard and Security Dashboard are local tools; do not expose their development servers publicly. The public chat Worker is allowlisted/private and must not be confused with the local-only Security Dashboard.
- Keep Source1_Extracted, Backups, and original AI_Bridge files until integration and rollback checks are complete.

## Run API locally
Set a new random token locally (never commit it):
```powershell
$env:VOOM_API_TOKEN = '<set-local-token-at-least-40-characters>'
Set-Location 'C:\Users\Administrator\Documents\Voom_system\Source1_Extracted'
python -m uvicorn api_server:app --host 127.0.0.1 --port 8000
```
Health check: `http://127.0.0.1:8000/health`. Protected strategy endpoint: `POST /strategy/analyze` with `Authorization: Bearer <token>`.


## Source 1 historical backtest harness (2026-10-23)
- Added `Source1_Extracted/backtest_source1.py`, an isolated paper-only historical simulator. It reads the available GOLD M15 CSV, applies a chronological 70/30 split, simulates the UTC session filter per candle without changing `main_bot_v62_best.py`, assumes entry at the next candle open, uses CSV spread with a configurable `0.01` price-unit-per-point assumption, uses stop-first handling when SL and target touch within one candle, and reports R-multiples, profit factor, equity-reference drawdown, trades and separate in-sample/out-of-sample summaries.
- Outputs are written to `Reports/source1_backtest/summary.json`, `trades.csv`, `equity_in_sample.csv`, and `equity_out_of_sample.csv`.
- The current file has 6,062 valid candles from 2026-07-20 to 2026-10-20 (about three months, not three years). DL score is held at zero because the ensemble is not validated. No order is sent. The spread-point conversion, fill model, contract size, commissions, swaps and account-currency P&L are not yet broker-validated.
- Initial exploratory run showed 22 in-sample trades, PF 0.8224, net -2.0612R, and only 1 out-of-sample trade. This is insufficient evidence to approve the strategy. Spread-side accounting and configured-risk handling were corrected after that initial run; use the latest generated report after rerun.
- All marketplace gates remain false. This report does not pass backtest/OOS/demo/risk review and does not enable live trading. The dataset still needs to be expanded to three years and the OOS sample needs enough trades before any validation claim.


## Source 1 exact-logic 3-year diagnostic run (2026-10-23)
- Used the existing read-only MT5 export `Backtest/data/XAUUSDc_M15_20231023_20261023.csv`: 70,678 M15 bars covering 2023-10-23 through 2026-10-23 (about 1,095.74 days). Original strategy file `Source1_Extracted/main_bot_v62_best.py` and production EA/order path were not changed.
- Generated reports under `Reports/source1_backtest_3y/` using the isolated exact Source 1 engine, simulated UTC session filter, next-bar entries and per-bar spread assumptions.
- Results (diagnostic, unguarded): in-sample 350 trades, PF 0.6065, net -101.5421R, reference equity 10,000 to 3,514.87, max drawdown 66.0534%; out-of-sample 109 trades, PF 0.9484, net -3.3328R, reference equity 10,000 to 9,578.48, max drawdown 14.5653%.
- Decision: FAIL / do not promote. OOS PF is below 1.0, OOS net R is negative and OOS drawdown exceeds the 7% hard limit. The diagnostic harness does not enforce the Risk Guard's daily-loss/drawdown entry blocks, so its equity curve is intentionally unguarded; next engineering step is to integrate the Risk Guard into the simulator and repeat the evaluation.
- These are risk-normalized estimates, not broker-currency P/L. The strategy DL score is fixed at 0; spread-point conversion is assumed at 0.01 price units per point; slippage, commissions, swaps, and exact bid/ask tick path are not fully modeled. All marketplace approval flags remain false, and no live or demo order was sent.


## Cloudflare API central rollout (2026-10-23)
- Deployed a new isolated Worker named `voom-system-api` at `https://voom-system-api.suwapat787.workers.dev`; enabled its workers.dev subdomain without changing existing Workers.
- Created Cloudflare KV namespace `VOOM_SYSTEM_API_DATA` for the latest sanitized MT5 telemetry (24-hour TTL).
- Verified from the remote Windows machine: `GET /api/health` returns HTTP 200; `GET /api/dashboard/status` returns HTTP 200 with `connected:false` and `telemetry:null`; OPTIONS for the configured Base44 origin returns 204 with the expected CORS origin.
- The protected `POST /api/mt5/telemetry` currently returns `bridge_secret_not_configured` (503), intentionally fail-closed. The EA has not yet been wired to send this telemetry and no secret was generated or exposed.
- Updated local `Dashboard/api-config.js` to point to the Cloudflare API. This does not modify the hosted Base44 app.
- Base44 edit attempt started, but the app status still reports a build error. Hosted dashboard integration remains unverified; fix the Base44 build before claiming it is connected.
- This Worker does not yet integrate with Supabase. Do not treat KV status as Supabase persistence. No orders can be executed by this API; paper-only invariants remain.
- Worker source/configuration are saved in `Cloudflare_API/src/index.js`, `Cloudflare_API/wrangler.toml`, and `Cloudflare_API/README.md`. No Git commit or push was performed.

## Follow-up verification (2026-10-24)
- Started the Source 1 local API with python -m uvicorn api_server:app --host 127.0.0.1 --port 8000; verified /health returns ok:true, paper_only:true, live_trading_enabled:false, order_execution:disabled.
- Local .api_token authenticates successfully against /ai/status (HTTP 200). Updated MQL5/Presets/VoomSystemEA_Telemetry_Paper.set so its InpApiToken matches the local token and InpTelemetrySecret is populated; InpPaperOnly=true.
- Generated a 64-character bridge secret locally. Cloudflare Wrangler reports a VOOM_BRIDGE_SHARED_SECRET secret binding name, but end-to-end telemetry test did not pass: with a browser-style User-Agent the Worker returned 503 bridge_secret_not_configured. Therefore the deployed Worker still does not expose the expected secret to the active script/version; do not claim telemetry connected.
- Direct POST requests without a browser-style User-Agent were blocked at the edge with Cloudflare error 1010. Actual MT5-to-Worker telemetry has not been proven.
- Latest /api/dashboard/status: connected:false, telemetry:null.
- Required next step: ensure the secret value is successfully set on the exact active voom-system-api Worker deployment, then test POST for HTTP 202 and confirm dashboard telemetry from the real MT5 terminal. In MT5, allowlist https://voom-system-api.suwapat787.workers.dev under Tools > Options > Expert Advisors before expecting the EA WebRequest to work.
- Keep trading paper-only; do not start the older SmartScalpingBridge execution path. Source 1 strategy performance diagnostic remains FAIL and is not approved for live trading.


## Deployment review — 2026-10-25

- Added `Docs/DEPLOYMENT_AND_ENV.md` as the current deployment and environment reference.
- Updated `vercel.json` to use the `Dashboard` directory for static files, select the Other framework preset, and preserve the dashboard route mappings. Confirm the Vercel project Root Directory is the repository root.
- Refreshed the root `.env.example` so it contains placeholders only, removes the unused service-role-key placeholder, and documents paper-only defaults.
- The observed Alpaca OAuth Worker (`voom-alpaca-oauth.suwapat787.workers.dev`) is not present in this repository tree. The previous `/api/alpaca/account` HTTP 401 cannot be repaired by changing this repo alone; the actual Worker source and its runtime OAuth/token configuration must be inspected separately.
- No Alpaca credentials, OAuth tokens, or other secret values were added to Git. No order execution was enabled and no trade was submitted.
- Verification limitation: repository changes were committed, but a fresh Vercel deployment and live end-to-end OAuth test have not yet been confirmed.
