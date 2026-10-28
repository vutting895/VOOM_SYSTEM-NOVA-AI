# MT5 Telemetry Relay Status

Updated: 2026-10-24

## Canonical file and endpoint alignment
- Project root: `C:\\Users\\Administrator\\Documents\\Voom_system`
- Active EA: `MQL5\\Experts\\VoomSource1Bridge.mq5` in terminal directory `E3E3B02889D32F38295D39BF94B6AD4A`.
- Central EA source/binary: `EA\\VoomSource1Bridge.mq5` and `EA\\VoomSource1Bridge.ex5`.
- Both active and central source files are 11,096 bytes and both binaries are 28,166 bytes; their modification times match.
- EA posts paper-only heartbeat to local authenticated API: `http://127.0.0.1:8000/mt5/telemetry`.
- Local API relays validated telemetry to `https://voom-system-api.suwapat787.workers.dev/api/mt5/telemetry` using `X-Voom-Bridge-Secret` read server-side from `Logs/bridge_secret.tmp`.
- Status reads are supported at both `/api/dashboard/status` and `/api/mt5/status`; both return the same sanitized data shape.
- Dashboard local public config points to the Cloudflare base URL. This does not edit the separately hosted Base44 app.

## Verification
- EA compilation log: 0 errors, 0 warnings.
- Cloudflare `/api/health` responds with Paper mode, live trading disabled, and order execution disabled.
- Latest live `/api/mt5/status` response: `connected=false`, `telemetry=null`. Therefore telemetry delivery is not yet proven.
- Most likely next checks: ensure the Worker secret exists and matches the local bridge secret (do not expose either value), then safely reload `VoomSource1Bridge` in MT5 and re-check status after its heartbeat interval.

## Safety
- Paper-only; no order execution was added.
- Do not enable legacy `VoomSystemEA`; its earlier logs showed 401 errors.
- Do not expose `.api_token` or `bridge_secret.tmp`, and do not commit secrets.
