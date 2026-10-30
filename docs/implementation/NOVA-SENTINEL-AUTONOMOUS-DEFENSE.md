# NOVA Sentinel — Autonomous Defense and Response

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Implementation branch:** `feat/nova-sentinel-autonomous-defense-20261031`  
**Control plane:** existing Cloudflare System Integration Hub  
**Phase:** isolated implementation candidate; disabled by default  
**Safety:** external retaliation prohibited; broker read-only; order submission and Live Trading OFF

## 1. Objective and boundaries

NOVA Sentinel detects repeated authentication failures, rejected browser origins, malformed resource identifiers, and repeated not-found lookups. It correlates those events into bounded threat patterns, temporarily rate-limits the same pseudonymous actor, and retains only minimal event metadata for a 24-hour window.

“Response” means protective actions against VOOM-controlled surfaces only: HTTP 429 cooldowns, request denial, preserving sanitized evidence, and prompting an operator to review a pattern. It does not scan, exploit, disable, or retaliate against external hosts, devices, accounts, or networks. It does not delete data, revoke all customer sessions, rotate customer credentials, change database grants, or submit broker orders.

The first implementation is deterministic event correlation, not a self-training ML model. Policy changes remain versioned, reviewed, and regression-tested. A shadow recommendation workflow can suggest changes from aggregate patterns, but cannot promote a rule by itself.

## 2. Placement and reuse

Extend `integrations/system-hub`, which already authenticates Supabase sessions, scopes connection reads to the authenticated owner, and acts as the control plane for broker integrations. Do not create another gateway, credential store, or AI-worker security path.

A SQLite-backed Cloudflare Durable Object named `SentinelState` owns a single pseudonymous actor's bounded event history and cooldown state. The Worker derives actor names with HMAC-SHA-256 using `SENTINEL_HASH_SECRET`; raw IP addresses, bearer tokens, session IDs, request bodies, connection IDs, and provider secrets are never sent to or stored by the actor. The DO has no public route and is accessed only through the System Hub binding.

## 3. Initial event policy

| Actor | Event | Detection window | Threshold | Response |
|---|---|---:|---:|---|
| Source IP | Invalid/expired Supabase session | 5 minutes | 15 | 60-second cooldown |
| Source IP | Rejected Origin | 2 minutes | 8 | 120-second cooldown |
| Authenticated user | Owned-resource lookup returns not found | 5 minutes | 10 | 180-second cooldown |
| Authenticated user | Malformed resource identifier | 5 minutes | 8 | 180-second cooldown |

A mixed-reconnaissance rule correlates at least two event classes and a weighted score of 24 within five minutes. It is actor-scoped; IP and user histories are never merged. Thresholds are conservative starting values, not claims of production calibration. Shared NATs, corporate proxies, and mobile carrier gateways can cause false positives for IP-based rules. Monitor and tune them in shadow mode before activating production enforcement.

## 4. Privacy, retention, and evidence

- The actor name is a keyed HMAC digest; the HMAC secret exists only as a Cloudflare Worker Secret.
- Events contain only `event`, `actorType`, and timestamp. Do not add identifiers, query strings, request bodies, IPs, user IDs, cookies, authorization headers, or credential material.
- Event history is capped at 256 records per actor and expires after 24 hours of inactivity.
- The implementation must return generic not-found responses for resources outside the caller's ownership. The detection signal must not reveal whether a foreign connection ID exists.
- Operational reporting uses pattern names, counts, and policy version—not raw identity or secret material.

## 5. Fail-safe operation and activation

`SENTINEL_ENABLED` defaults to `false`. When disabled, existing System Hub behavior is unchanged. When explicitly enabled, a missing binding, missing/short HMAC secret, or Durable Object failure fails closed for protected routes with a sanitized 503; do not silently disable protection.

Before activation in any shared environment:
1. Review and merge the implementation PR only after exact-head CI passes.
2. Create/verify the SQLite Durable Object namespace via the reviewed Wrangler migration.
3. Provision `SENTINEL_HASH_SECRET` out-of-band using Cloudflare Worker Secrets (minimum 32 random characters); never commit it, put it in GitHub Actions output, or use a client-visible variable.
4. Verify the namespace binding and secret without printing their values.
5. Run staging acceptance for valid auth, invalid-session threshold, Origin probes, same-user enumeration, cross-user isolation, cooldown expiry, actor separation, 24-hour deletion, and a shared-NAT false-positive scenario.
6. Begin with shadow telemetry; enable 429 enforcement only after the thresholds and operational escape/recovery procedure are reviewed.
7. Production enablement is a separate owner approval. No automatic production deployment or secret provisioning is part of this branch.

## 6. Integration invariants

- Authentication remains Supabase Auth; ownership remains enforced by the authenticated user session and existing RLS query.
- Unauthenticated callers never reach account or broker data.
- No new endpoint can access Vault secrets or expose credentials to AI/MCP.
- Exness MT5 remains Demo and read-only; order submission, execution, withdrawals, and Live Trading remain disabled.
- No changes are made to customer balances, connection assignment, bridge routes, Supabase grants, or production data.

## 7. Current implementation limits

The first release detects patterns in authentication/origin/resource probing at the System Hub boundary. It is not a full WAF, EDR, malware scanner, network IDS, or SIEM. It cannot identify the human behind an IP address. It does not perform active counter-attacks. It does not autonomously train or alter policies. Broader coverage (API abuse, edge/WAF telemetry, secret-access anomalies, deployment integrity, and tenant-level audit correlation) should be added only with trustworthy event sources and separate tests.
