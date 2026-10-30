# Monitoring

Define service health, ingestion lag, schema failures, backtest reproducibility, risk rejections, and execution kill-switch metrics. Never report a service as connected without a successful authenticated health check from its real endpoint.

## NOVA Sentinel threat telemetry

The System Hub Sentinel candidate records bounded security event classes only: invalid/expired session, rejected Origin, malformed resource identifier, and repeated not-found resource lookup. Keep measurements aggregate and pseudonymous.

Recommended monitoring:
- blocked requests by threat pattern and policy version;
- detection and cooldown counts by actor class (IP digest vs authenticated user digest), never by raw identity;
- Sentinel Durable Object errors, missing binding/secret readiness, and 503 fail-closed responses;
- 401/403/404/429 rates and false-positive reports;
- actor-state retention and alarm cleanup outcomes.

Never log bearer tokens, session cookies, raw IP addresses, raw user IDs, connection identifiers, query strings, request bodies, credentials, or decrypted Vault values. Alert on missing Sentinel configuration when enforcement is explicitly enabled. Keep new thresholds in shadow mode until staging tests establish a safe false-positive rate. Sentinel enforcement is disabled by default and must not be activated by a green CI run alone.
