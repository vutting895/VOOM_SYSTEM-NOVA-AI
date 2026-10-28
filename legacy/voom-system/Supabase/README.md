# Voom_system — Supabase

Project ref: tlyyxufuiimrbaksoitf
Region: ap-southeast-1 (Singapore)
Status at last verification: ACTIVE_HEALTHY
Live trading: disabled; database records strategy signals as paper-only.

## Migrations
- migrations/20261023_000001_voom_core.sql — core schema, Auth profile trigger, indexes and RLS.
- migrations/20261023_000002_voom_system_security_hardening.sql — revoke direct RPC execution for trigger functions and index foreign keys.

## Tables
- customer_profiles — profile/status linked to Supabase Auth.
- trading_sessions — per-customer MT5/backend connection status.
- strategy_signals — Source 1 candidate/HOLD signal records; paper-only by default.
- risk_guard_decisions — private Risk Guard decision log.
- security_events — private security audit events.
- system_heartbeats — private component health checks.

## Backend adapter
backend/supabase_store.py uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Install its dependency with pip install -r requirements.txt. Never use the service-role key in browser code, Git, or logs.

## Security
- RLS enabled on all six public tables.
- Customers can read only their own profile, sessions and signals.
- risk_guard_decisions, security_events and system_heartbeats intentionally have no policies for browser roles; trusted backend only.
- Do not store broker passwords, MT5 passwords, API keys, raw request bodies or full IP addresses.
- Keep Security Dashboard local/VPN or behind strong staff authentication.
- Database setup does not connect MT5 order execution to Source 1 and does not enable live trading.

## Advisor notes
Security advisor currently reports INFO for the three backend-only tables with RLS enabled and no browser policies. This is intentional to keep these tables inaccessible to anon/authenticated roles. No security-definer RPC warning remained after hardening. Performance advisor still marks indexes unused because the new project has no workload yet; review again after real traffic.
