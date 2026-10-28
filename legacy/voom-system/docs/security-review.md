# Security review notes

## Current Voom_system scaffold
- API is explicitly paper-only and has no order execution endpoints.
- Telemetry requires a server-side shared secret of at least 32 characters.
- Telemetry schema rejects unknown fields and stale/future timestamps.
- Request bodies are capped at 32 KB; basic security headers are set; CORS is allowlist-based.
- Health and status responses disclose that live trading and order execution are disabled.
- Telemetry storage is process-local memory only; do not rely on it for durable monitoring.
- No HFM credentials or API secrets are committed.

## Candidate source: `vutting895/voom-ai-f480ij`
Initial inspection found an Express/AI SDK application and a Supabase vector schema. It is not verified as an MT5/HFM bridge.

### Issues in candidate source to resolve before reuse
- Source `.gitignore` ignores `.env*.local` but does not comprehensively ignore all `.env` files.
- The Supabase SQL contains permissive RLS policies named `Allow all`; do not deploy these policies for production data.
- The Express server trusts the first `X-Forwarded-For` value. This must only be trusted behind a correctly configured trusted proxy.
- Security logs include dummy seeded events. UI must label sample/demo data and must not represent it as live incidents.
- In-memory rate limits and bans do not provide durable or distributed protection.
- Validate authentication, CORS, body limits, provider error handling, and secret usage before exposing endpoints publicly.
- Review all frontend code for exposed API keys and direct use of privileged Supabase credentials.
- The source package scripts do not run a real linter or test suite.

## Remaining acceptance checks before connecting HFM
- CI test run is green; locally run `npm install`, `npm run check`, and `npm test`.
- EA source is reviewed and sends telemetry only in Strategy Tester/demo/paper mode.
- Add replay protection and stronger request signing before trusting external telemetry.
- Add durable storage, user authentication/authorization, monitoring, and a retention policy.
- Risk guard must reject invalid/stale signals, excessive volume, missing required stops, daily-loss breaches, and drawdown breaches.
- A kill switch must block all new orders and have documented tests before any future execution feature.
- Logs redact credentials and account secrets.
- Live trading remains disabled until explicit operator approval after separate demo/paper test sign-off.

## Deployment status
The Vercel project creation request was rejected with a permission error. No public API deployment has been confirmed. Configure hosting permissions and environment variables before considering the service online.
