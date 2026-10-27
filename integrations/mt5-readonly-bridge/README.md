# VOOM_SYSTEM MT5 Read-only Bridge v1.0

This bridge is intended to run on the Windows PC where the Exness Demo MT5 terminal is already installed and logged in. Cloudflare Workers cannot run the Windows MT5 terminal itself.

## Safety and scope

- Read-only endpoints only: health, account summary, symbol discovery, quotes/candles.
- No order, trade, position-modification, transfer, or withdrawal implementation.
- Requests targeting order/trade/execute/withdraw/transfer routes are explicitly denied.
- Every API endpoint requires `Authorization: Bearer <MT5_BRIDGE_TOKEN>`.
- Never commit the token, MT5 credentials, or a credential-bearing environment file.
- Use only the Exness Demo terminal for v1.0. Keep Live Trading disabled in the terminal and application.

## Install on the Windows PC

Use a dedicated virtual environment from this directory:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

The MetaTrader5 Python package must run on the same Windows machine as the installed MT5 terminal. Start the terminal and log in to the Exness Demo account first. This bridge does not accept MT5 login/password credentials; it uses the terminal's existing session.

## Configure secrets without committing them

Set a long random token privately in the Windows process/service environment as `MT5_BRIDGE_TOKEN`. Set `MT5_TERMINAL_PATH` only if MT5 is not found automatically. Set `MT5_BRIDGE_CORS_ORIGINS` to the exact Cloudflare frontend origin(s), comma-separated; do not use `*`.

Do not paste the token into chat or source code. Do not expose the bridge port directly to the public internet. Publish it only through a protected Cloudflare Tunnel route and require the bearer token on requests.

## Start for local smoke testing

```powershell
$env:MT5_BRIDGE_TOKEN = '<set privately in this shell; do not commit>'
$env:MT5_BRIDGE_CORS_ORIGINS = 'https://your-confirmed-cloudflare-frontend.example'
python -m uvicorn bridge:app --host 127.0.0.1 --port 8787
```

The placeholder origin above must be replaced with the exact approved frontend origin before use. Do not put the token in a URL or query string.

## Endpoints

- `GET /health`
- `GET /api/account`
- `GET /api/symbols?q=XAU&limit=100`
- `GET /api/quotes?symbol=<exact-terminal-symbol>&timeframe=M5&count=100`

Supported timeframes: M1, M5, M15, M30, H1, H4, D1. Discover exact Exness symbol names from `/api/symbols`; do not assume `XAUUSDM` or `XAUUSD`.

## Integration requirements before use

1. Confirm the terminal is the intended Exness Demo account.
2. Set a strong bridge token privately and configure it as a Cloudflare Worker secret on the API proxy.
3. Configure a Cloudflare Tunnel route to the local bridge port; do not expose the port directly.
4. Add/verify authenticated user-session authorization at the Cloudflare API proxy, CORS allowlist, rate limiting, and safe error handling.
5. Verify the bridge and proxy return JSON and live timestamps.
6. Verify all trade/order methods remain blocked at the proxy and bridge layers.
7. Run tests and record evidence before marking the integration ready.

This source has not been installed, executed, or end-to-end tested by virtue of being added to the repository.