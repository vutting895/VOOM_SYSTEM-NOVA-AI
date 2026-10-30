# Broker connectivity setup (NOVA)

## Active connection model

The customer-facing broker API is authenticated with the customer's Supabase session. It does not accept broker passwords or provider API secrets from the frontend.

- **Exness MT5 Demo:** the supported private-account path is Next.js → System Integration Hub → MT5 read-only Proxy → tenant-isolated Relay → the customer's assigned Windows Bridge.
- **Public market checks:** OKX, Coinbase, Kraken and Bitget checks use public time endpoints only. A successful check does not mean a customer account is connected.
- **Binance / Bybit private accounts:** account credential verification is currently blocked/not enabled. The status API does not read `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_SECRET_KEY`, `BYBIT_API_KEY` or `BYBIT_API_SECRET`.
- **IBKR:** no active account adapter is configured. A local `127.0.0.1` Gateway/TWS address would refer to the machine running the adapter, not a remote customer's computer.

## Exness MT5 Demo

1. The customer requests an Exness Demo connection while signed in.
2. The System Integration Hub keeps the pending/connected state and owner binding.
3. An administrator provisions a unique tenant route and matching private Bridge token.
4. The Windows Bridge reads the MT5 terminal session already logged in to the intended Exness Demo account. It does not accept or store the customer's MT5 password.
5. The connection is considered connected only after the authenticated account-read path has been verified end to end.

The Bridge's private files live under `%LOCALAPPDATA%\VOOM_SYSTEM\secrets\`. The tenant token is unique to one Bridge and is paired with the Cloudflare Worker secret `MT5_TENANT_ROUTES`. Do not place `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER`, `MT5_TENANT_ID` or `MT5_BRIDGE_TOKEN` in the repository, browser environment, shared root `.env`, chat, or issue comments.

See [the MT5 read-only Bridge guide](integrations/mt5-readonly-bridge/README.md) for the exact local setup and tenant-isolation checks.

## Environment placement

- Frontend public configuration belongs in Netlify site settings for production or `frontend/.env.local` for local development. Start from `frontend/.env.example`.
- Cloudflare Worker runtime variables and secrets belong to the specific Worker deployment, supplied through the reviewed GitHub Actions workflow / Cloudflare configuration. Do not copy them into the frontend.
- Customer-owned provider credentials remain disabled until the dedicated Vault role, trusted owner binding, privilege audit, rotation/revocation checks and two-customer staging isolation gates pass.
- Exness MT5 terminal/Bridge credentials stay in the tenant-specific Bridge/Relay boundary; they are not customer Vault credentials.

## Safety

Read-only + AI Analysis remains mandatory. Order submission, position mutation, transfer, withdrawal and Live Trading remain disabled. A public market-data response, passing CI, or healthy Worker alone is not proof that a customer's broker account is connected.
