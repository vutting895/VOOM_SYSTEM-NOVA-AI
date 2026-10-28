# VOOM System — Private Frontend

Custom standalone frontend in `Voom_system\Dashboard`; no Base44 backend.

## Files
- `index.html` — private dashboard shell and truthful integration-status overview.
- `app.css` — responsive layout and Supabase staff sign-in screen.
- `auth.js` — Supabase Auth password sign-in, active-profile validation and staff/admin UI gate.
- `app.js` — read-only views and fetches for staff API endpoints.
- `../Supabase/backend/admin_api.py` — read-only FastAPI staff API; verifies Supabase JWT and active staff/admin role on every data request.

## Run frontend locally
```powershell
cd C:\Users\Administrator\Documents\Voom_system\Dashboard
python -m http.server 4173 --bind 127.0.0.1
```
Open `http://127.0.0.1:4173`. Do not change the bind host to `0.0.0.0` or publish this directory publicly.

## Run staff API locally
Open a separate PowerShell window:
```powershell
cd C:\Users\Administrator\Documents\Voom_system\Supabase
python -m pip install -r requirements.txt
$env:SUPABASE_URL = 'https://tlyyxufuiimrbaksoitf.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<load-the-service-role-secret-from-your-secret-manager>'
cd backend
python -m uvicorn admin_api:app --host 127.0.0.1 --port 8010
```
Replace the placeholder by loading the actual secret into the process environment securely; do not save the real key in this repo, command examples, frontend, Git, or logs. The API intentionally refuses to start when the URL/key is missing. It listens on loopback only and has CORS origins limited to localhost port 4173.

## Supabase Auth and staff provisioning
Project ref: `tlyyxufuiimrbaksoitf`
Project URL: `https://tlyyxufuiimrbaksoitf.supabase.co`
The browser uses the project's publishable key only. It is designed for browser use; it is not a privileged secret.

1. In Supabase Dashboard → Authentication → Providers, enable Email/password sign-in.
2. In Authentication → URL Configuration, set the local site URL to `http://127.0.0.1:4173` and keep redirects limited to the local/private frontend URLs in use.
3. Create the intended staff account in Authentication → Users. Public sign-up is not implemented.
4. Copy the exact Auth UUID for the verified staff user. In SQL Editor assign the role:
   ```sql
   update public.customer_profiles
   set role = 'admin'
   where user_id = 'REPLACE-WITH-VERIFIED-AUTH-USER-UUID'
     and account_status = 'active';
   ```
   Use `staff` for non-admin staff. Confirm exactly one row was updated. Never allow users to change their own role.
5. Sign in to the local dashboard. Active `staff` and `admin` profiles can see the staff interface. Customer and suspended accounts are denied.
6. Run the API and open AI Agents, Signals, Risk Guard, Security Center, Customer Accounts or Audit Log to request read-only records.

## Automated AI readiness checks
- `../Python/ai_readiness_check.py` refreshes the readiness report every 5 minutes through the Windows Scheduled Task `VoomSystem-AIReadinessCheck`.
- Reports: `../Reports/ai_readiness_report.json` and `ai_readiness.json` (the Dashboard feed). The AI Marketplace view refreshes its report every 60 seconds while open.
- The checker runs offline Risk Guard, Source 1 unit tests, and installed-bridge safety regression; it checks local TCP listeners and whether the MT5 terminal process exists. These checks do not place orders.
- `../Reports/ai_approval_records.json` is intentionally empty until independent approval evidence is provided. Do not self-approve a strategy or fabricate evidence.
- Missing validation, missing services, missing approval, or missing customer-isolation/E2E evidence blocks readiness. The report does not enable customer selection or Live Trading. The checker does not verify the deployed Supabase schema; that remains a separate integration test.

## AI Marketplace registry (new, read-only phase)
- Migration draft: `../Supabase/migrations/20261023_000004_ai_marketplace.sql`.
- Review and apply that migration in Supabase SQL Editor before starting the staff API route `GET /admin/ai-strategies`.
- The registry includes explicit lifecycle states and requires backtest, out-of-sample, demo, risk review, and staff approval before a strategy can be marked approved.
- Customer subscriptions and signal-delivery idempotency tables are schema foundations only. No customer enable/disable API, signal copier, EA command route, or live execution is implemented in this phase.
- New strategies must remain `draft` or `testing` until independent validation. Do not seed fictional performance or label any AI production-ready without evidence.

## Voom_system API connection (Base44 / hosted dashboard)
- Browser-safe config is in `Dashboard/api-config.js`; set `apiBaseUrl` to the deployed API origin (HTTPS, no trailing slash). Leave it blank until the API has been deployed.
- The Settings screen checks only `GET /api/health` and verifies `tradingMode=paper`, `liveTradingEnabled=false`, and `orderExecution=disabled` before showing Connected.
- Set the API host's `CORS_ORIGINS` to the exact published Base44 app origin, e.g. `https://voom-system-dashboard-17042658.base44.app`; no wildcard.
- Never put `VOOM_BRIDGE_SHARED_SECRET`, Supabase service-role keys, or other privileged secrets in `api-config.js` or browser code. The browser health check does not read account balances or MT5 telemetry.
- This config does not itself deploy the API or publish Base44 changes. Deploy the API first, set its URL here, then publish/sync the dashboard code.

## Customer paper trading desk
`customer.html` now hosts a real trading screen with two selectable modes (saved per browser):
- **เทรดเงินจำลอง (Paper)** — buy/sell ticket, open positions, close position, paper balance = 10,000 USD + realised P&L. Quotes are simulated and labelled `SIM`; nothing is sent to a broker.
- **ดูสัญญาณ** — read-only list of the customer's own `strategy_signals` rows.

Orders are stored in `public.paper_orders` with per-customer RLS. Apply
`../Supabase/migrations/20261024_000003_customer_paper_trading.sql` in the Supabase SQL Editor
first, otherwise the desk shows a "ยังไม่ได้ติดตั้งตาราง paper_orders" notice and saves nothing.
Customers self-register from `register.html`; the auth trigger creates an `active` `customer` profile.
Live trading, broker connections and order execution remain disabled.

## API routes
- `GET /health` — non-sensitive health status.
- `GET /admin/heartbeats`
- `GET /admin/signals`
- `GET /admin/risk-decisions`
- `GET /admin/security-events`
- `GET /admin/customers`
- `GET /admin/trading-sessions`

All `/admin/*` routes require a valid Supabase access token and active `staff` or `admin` role. Lists are capped at 100 records and read-only. Security-event responses omit IP hashes, request IDs, and arbitrary details. The browser never receives the service-role key.

## Current boundaries
- Auth flow and UI role gate are implemented; live login requires an owner-provisioned staff account.
- API source is implemented but not yet live-tested because the server service-role secret has not been configured in this environment.
- Frontend feed wiring is present; data screens show an API connection/auth error until the private API is running and configured.
- No open-position endpoint is available yet. The schema has trading sessions but not a position snapshot table; no positions/P&L are fabricated.
- Security Center must remain local/VPN and behind strong staff authentication; do not expose it publicly.
- Preserve the existing MT5 EA order path. No Buy/Sell or execution controls are exposed.
- Keep `LIVE_TRADING_ENABLED=false`; Source 1 signals remain paper-only.

## Checks performed
- `node --check app.js` and `node --check auth.js`: expected to pass after latest edits.
- API is designed to fail closed without backend credentials.
- The frontend contains no service-role key.
- End-to-end login, staff-role enforcement and data-feed test still require staff provisioning and private API configuration.
