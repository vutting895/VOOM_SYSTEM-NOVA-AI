# Online deployment checklist

## Hosting

The repository includes a Render Blueprint (`render.yaml`) for a long-running Node service and a Vercel serverless entry point (`api/index.js`). Choose one hosting target for the API; do not deploy both against live MT5 until their environment variables and routing are intentionally configured.

### Render

1. Import this repository into Render and use the Blueprint.
2. Set `CORS_ORIGINS` to the exact Base44 app origin, with no wildcard.
3. Generate a unique random bridge secret of at least 32 characters and set `VOOM_BRIDGE_SHARED_SECRET` in Render's environment settings.
4. Confirm the public `/api/health` response says `tradingMode: paper`, `liveTradingEnabled: false`, and `orderExecution: disabled`.
5. Confirm `/api/mt5/telemetry` rejects missing and incorrect secrets before configuring an EA.

### Vercel

1. Import `vutting895/Voom_system` as a new Vercel project (do not overwrite unrelated projects).
2. Configure `VOOM_BRIDGE_SHARED_SECRET` and `CORS_ORIGINS` in Project Settings → Environment Variables.
3. Deploy a Preview first. Validate health and auth responses before Production.
4. This serverless version keeps only process-local telemetry; use durable storage before relying on status across instances.

## Required preflight

- [ ] `npm ci`, `npm run check`, and `npm test` pass.
- [ ] Health endpoint returns paper-only flags.
- [ ] Wrong/missing bridge secret is rejected.
- [ ] Invalid schema and stale timestamps are rejected.
- [ ] CORS rejects untrusted origins.
- [ ] Dashboard displays sample data as demo and never presents it as live telemetry.
- [ ] MT5 EA source is reviewed and tested in Strategy Tester/demo with no live orders.
- [ ] No secrets are committed to Git.
- [ ] Live trading remains disabled.

## Not yet complete

This repository does not yet contain a verified MT5 EA source, durable database integration, or confirmed HFM connection. Do not describe the system as fully operational until these checks are evidenced.
