# Sandbox / dev environment notes

Non-obvious things learned running this repo in the Base44 sandbox. Manifests,
scripts and the README already describe the project itself.

## What actually runs in the preview

`docker-compose.base44.yml` runs two services from the cloned source:

- `web` (host port 3000) — nginx serving `Dashboard/` directly from the bind
  mount. `Dashboard/index.html` is the entry (customer login page) and links to
  `register.html`, `staff.html`, `customer.html`. Edits to those files appear on
  reload; there is no build step and no live-reload watcher.
- `api` (host port 8000) — `backend/server.js` (Express, paper-only) started with
  `node --watch`, so backend edits restart automatically.
  `nginx.base44.conf` proxies `/api/*` on port 3000 to `api:8000`, mirroring the
  `/api/(.*)` rewrite in `vercel.json`.

`npm ci` runs on API container start (deps live in the bind-mounted
`node_modules/`, which is gitignored). `npm test` / `npm run check` are the
checks CI uses.

## Boundaries that matter for the preview

- `Dashboard/api-config.js` points `apiBaseUrl` at the deployed Cloudflare
  Worker, not this local API. That is the committed config; the local API is
  reachable at `/api/health` on port 3000 for manual checks.
- `Dashboard/app.js` calls the staff admin API at the hardcoded
  `http://127.0.0.1:8010` (`Supabase/backend/admin_api.py`). That address
  resolves to the viewer's own machine, so staff data screens cannot work in a
  hosted preview even when the FastAPI service is running. The service also
  refuses to start without `SUPABASE_SERVICE_ROLE_KEY`.
- The customer trading desk (`Dashboard/customer.html` + `trade.js` + `trade.css`)
  stores paper orders in `public.paper_orders`, created by
  `Supabase/migrations/20261024_000003_customer_paper_trading.sql`. That
  migration must be applied in the Supabase SQL Editor, otherwise the desk shows
  a "ยังไม่ได้ติดตั้งตาราง paper_orders" notice and cannot save orders. Quotes
  there are simulated and labelled SIM — paper only, no broker, no execution.
- Sign-in uses Supabase Auth (`tlyyxufuiimrbaksoitf.supabase.co`) with the
  browser publishable key baked into the HTML, plus the supabase-js CDN. Nothing
  in this repo needs a server-side secret to boot.
- Live trading stays disabled by design: `LIVE_TRADING_ENABLED=false`,
  `TRADING_MODE=paper`, order execution off. `POST /api/mt5/telemetry` fails
  closed with 503 until `VOOM_BRIDGE_SHARED_SECRET` is set.

## How to confirm it works

```bash
curl -s http://localhost:3000/api/health          # ok:true, tradingMode paper
curl -s http://localhost:3000/api/dashboard/status
docker compose -f docker-compose.base44.yml ps    # both services healthy
```
