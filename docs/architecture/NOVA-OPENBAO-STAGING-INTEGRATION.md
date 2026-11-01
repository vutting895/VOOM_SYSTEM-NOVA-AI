# NOVA OpenBao Staging Integration — Design and Activation Gates

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Base:** `main`  
**Control plane:** existing Cloudflare System Integration Hub (`integrations/system-hub`)  
**Scope:** historical Staging integration proposal; superseded for customer credential custody  
**Safety posture:** Exness Demo/read-only only; order submission and Live Trading remain OFF

**Current architecture authority:** Option C — Separate Secret Custody Plane, defined in `docs/architecture/NOVA-SEPARATE-SECRET-CUSTODY-ADR.md`. This document is retained as historical candidate analysis only. Do not implement the earlier System-Hub-authoritative or Supabase-ciphertext flow for customer secrets.

The remaining sections preserve the prior proposal for traceability. Where they conflict with Option C, Option C governs.

## 1. Historical proposal (superseded for customer custody)

Earlier proposal (not selected): use OpenBao as a self-hosted secrets and cryptographic service for NOVA Staging, with Transit and Integrated Storage (Raft). This is not the selected customer-custody architecture. OpenBao may be reconsidered only as a cryptographic component inside a separately administered custody plane that independently validates customer sessions, owns the binding registry, and keeps plaintext credentials out of the System Hub. The current `integrations/system-hub/openbao-transit-client.js` is an isolated library scaffold, not a deployed runtime; because `decrypt()` returns plaintext bytes to its caller, it must not be wired into the System Hub customer request path.

OpenBao is open-source software; this does **not** make its hosting, persistent storage, network connectivity, backups, monitoring, or operational support free. No hosting provider, instance size, or paid service is selected by this document.

OpenBao is not an HSM. The initial Staging deployment, if approved, will use Shamir unseal with controlled operator-held recovery shares. Do not describe this deployment as HSM-backed. Auto-unseal with a separate KMS/HSM can be evaluated later, but must not use a circular dependency on the same OpenBao Transit service.

## 2. Repository-first architecture

Extend the existing System Hub. Do not create a second broker gateway and do not place customer credentials in the NOVA AI/chat Worker.

```text
Browser secure connection form
        |
        | authenticated session; never chat/MCP
        v
Existing System Hub (Cloudflare Worker)
        |
        | verify Supabase session
        | resolve owner from verified session
        | load exact owner-scoped connection
        | enforce provider + environment + operation allowlists
        v
Tenant Credential Provider (server-only module)
        |
        | authenticated, narrowly scoped request
        v
Private OpenBao Staging endpoint
        |
        | Transit encrypt/decrypt; tenant/connection context
        v
Supabase broker_connections metadata + ciphertext
        |
        v
Exness Trader API adapter (GET-only; separate activation gate)
```

The browser, AI model, MCP, analytics, audit events, and logs must never receive plaintext credentials, OpenBao tokens, or decrypted key material. Database rows may contain only opaque secret references, ciphertext, key version, and non-secret provider metadata.

## 3. Authentication and tenant isolation

The System Hub remains the authorization authority. OpenBao is a cryptographic service, not a substitute for application authorization.

Before implementation, select and threat-model one short-lived server-to-server authentication pattern. Preferred evaluation order:

1. Workload identity / signed JWT authentication with strict issuer, audience, expiry, and claim binding, if the selected runtime can issue a suitable verifiable identity.
2. Otherwise, a dedicated short-lived machine token issued through a protected bootstrap path, with a minimal OpenBao policy and rotation/revocation controls.

A static, broad OpenBao root token or admin token in Cloudflare Worker Secrets is prohibited. If a bootstrap secret is unavoidable, it must be a dedicated non-root identity, restricted to the exact required Transit paths, kept server-side, rotated, and never shared with a browser or AI Worker.

For every credential operation, the System Hub must:
- Authenticate the Supabase session and derive `user_id` from the verified identity; never trust a client-supplied owner or tenant ID.
- Query the exact connection under the authenticated user's RLS context and verify provider, environment, status, and ownership.
- Bind cryptographic operations to a canonical tenant/connection context (for example, stable owner ID + connection UUID + provider + environment + schema version).
- Reject mismatched, missing, stale, revoked, or cross-tenant references with sanitized errors.
- Keep the OpenBao credential provider inaccessible from public routes other than the explicitly reviewed connection lifecycle.

**Important:** Transit key derivation/context binds ciphertext to context, but it is not by itself an authorization boundary. A service identity capable of decrypting with arbitrary context can still be dangerous if the System Hub is compromised. Two-customer authorization tests and a review of the exact OpenBao policy are mandatory.

## 4. OpenBao Staging deployment requirements

The first deployment is an isolated, single-node Staging instance only:

- Pin a reviewed OpenBao release and container digest; do not use `latest`.
- Use Integrated Storage (Raft) on a persistent encrypted volume. A single node is a Staging starting point, not an HA design.
- Enable and require TLS with certificate validation. Never set TLS verification bypass.
- Keep the API private. Do not expose port 8200 directly to the public Internet.
- Restrict administrative access to an operator-only path; application identity must not receive administrative capabilities.
- Use Shamir unseal for the initial no-KMS Staging trial. Store shares offline in separate controlled locations; do not put them in GitHub, Cloudflare variables, chat, or the same host as the OpenBao data.
- Enable audit logging to a protected destination, while verifying that request bodies, tokens, and plaintext values are not logged.
- Establish encrypted backups, restore rehearsal, disk monitoring, health monitoring, and a documented seal/recovery procedure before accepting even synthetic secrets.
- Define retention, destruction, and key rotation procedures.

### Cloudflare connectivity gate

The System Hub currently runs as a Cloudflare Worker. A private connection must be proven before integrating the provider:

- Evaluate Cloudflare Workers VPC + Cloudflare Tunnel for private service connectivity. The tunnel must be configured for the Workers VPC use case, not assumed to be equivalent to an ordinary public hostname.
- Verify account/plan entitlement, region/feature availability, operational cost, QUIC egress requirements, and a real Worker-to-private-service test before choosing this route.
- If Workers VPC is unavailable or not cost-acceptable, stop and compare a separately secured private connector. Do not silently fall back to a publicly reachable OpenBao endpoint.

No Cloudflare tunnel, VPC service, hostname, Access policy, or Worker binding is created by this PR.

### Verified low-cost hosting and private-connectivity assessment (2026-10-31)

**Candidate host: OCI Always Free Ampere A1, subject to the tenancy Home Region and live capacity check.**

Oracle documents up to 1,500 OCPU-hours and 9,000 GB-hours per month for Ampere A1, equivalent for an Always Free tenancy to 2 OCPUs and 12 GB RAM, plus 200 GB total Always Free block-volume storage. Always Free compute must be provisioned in the tenancy Home Region. The Console must explicitly label the selected shape and boot/block volumes as Always Free before creation. An `out of host capacity` error means capacity is temporarily unavailable; do not upgrade the tenancy or select a paid shape to work around it.

**Important availability limitation:** Oracle documents reclamation of idle Always Free compute when CPU, network, and (for A1) memory utilization all remain below 20% at the 95th percentile over a 7-day period. An OpenBao Staging service with low traffic could meet this idle definition. Therefore OCI Always Free is a no-cost lab candidate, not a dependable always-on service or production host. Do not generate artificial load to evade reclamation. If the tenancy cannot accept this availability risk, stop and obtain approval for a budgeted host instead of silently enabling paid resources.

**Private connectivity candidate: Cloudflare Workers VPC + Tunnel.**

Cloudflare's current documentation states Workers VPC is in beta and available free on all Workers plans. It uses a Cloudflare Tunnel from the private network and a VPC Service binding from the Worker; this avoids exposing an inbound public port or public IP. The tunnel daemon must use QUIC (UDP port 7844 outbound) for Workers VPC. Beta availability and behavior can change, so validate the feature in the actual account before relying on it.

**Proposed Staging shape if the availability risk is accepted:** one OCI Ampere A1 VM with 2 OCPUs / 12 GB RAM, persistent Always Free block storage within the account quota, OpenBao Raft single-node, and `cloudflared` on the same private host. Keep OpenBao bound to a private interface; expose only the VPC Service through the Workers VPC binding. Use a separate VPC Service for a minimal non-secret health endpoint during the connectivity proof. This is not HA and is not production-ready.

**Decision:** OCI A1 + Workers VPC is the first option to test because its documented compute quota and beta VPC service may avoid recurring platform charges. It is conditional on Home Region capacity, the Console's Always Free labels, and explicit acceptance of idle reclamation. No resources are created by this assessment.

References:
- OCI Always Free compute and idle reclamation: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- OCI Free Tier FAQ and capacity notes: https://www.oracle.com/cloud/free/faq/
- Cloudflare Workers VPC plan availability: https://developers.cloudflare.com/workers-vpc/
- Cloudflare Workers VPC setup: https://developers.cloudflare.com/workers-vpc/get-started/
- Cloudflare Tunnel QUIC requirements: https://developers.cloudflare.com/workers-vpc/configuration/tunnel/

## 5. Transit data model

- Use a dedicated AES-256-GCM Transit key for the NOVA Staging credential purpose.
- Use derived keys and a canonical context containing the authenticated owner and exact connection identity where supported by the reviewed API.
- Store ciphertext, opaque reference, key version, provider, environment, and schema version only.
- Do not store plaintext or private keys in Supabase, logs, traces, analytics, audit events, GitHub, or chat.
- Rotation must retain old key versions for decrypt until all records are rewrapped and verified; never disable an old version prematurely.
- Revocation must disable the credential reference at the application layer and prevent subsequent use, independent of ciphertext deletion.
- Decryption must occur only in memory inside the System Hub's server-side provider path, with strict size limits and immediate disposal where practical.

## 6. Staging acceptance tests (synthetic data only)

No customer credentials or real Exness private keys may be used in this phase.

1. **Deployment:** TLS verification, private network reachability, persistent storage after restart, health checks, and operator-only administrative access.
2. **Identity:** expired, wrong-issuer, wrong-audience, malformed, and revoked machine/user identities are rejected.
3. **Tenant isolation:** create two synthetic owners and two connections; owner A cannot retrieve, decrypt, rotate, revoke, or delete owner B's reference.
4. **Context binding:** ciphertext encrypted for one owner/connection fails to decrypt under another owner's or connection's context.
5. **Policy:** application identity cannot list secrets, read server configuration, manage auth methods, create policies, or access unrelated Transit keys.
6. **Leakage:** scan API responses, logs, traces, audit output, errors, and test artifacts for synthetic plaintext and tokens.
7. **Lifecycle:** create, encrypt, decrypt, rotate/rewrap, revoke, stale-reference rejection, and rollback behavior.
8. **Resilience:** OpenBao unavailable, sealed, timed out, or returning malformed responses results in fail-closed `credential_vault_unavailable`; no fallback to Supabase Vault or shared secrets.
9. **Exness adapter:** only after the secret custody gates pass, run Gateway Discovery and Account Snapshot using a staging Demo connection; verify returned account identity exactly matches the owner-bound connection before any `data_verified` state.
10. **Trading safety:** assert `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false` on every relevant path.

The exact PR head must pass repository CI, security review, and the existing delivery verification gate before any staging activation. Production remains a separate approval.

## 7. Explicit non-actions

This design PR does not:
- Deploy or provision OpenBao, a VM, container host, tunnel, VPC service, DNS record, or storage volume.
- Create Cloudflare secrets, API tokens, service tokens, bindings, or Worker deployments.
- Change Supabase schema, roles, grants, Vault permissions, customer rows, or credentials.
- Connect to Exness, store the account ID, or set `data_verified`.
- Enable trading, order submission, execution, withdrawal, transfer, or Live Trading.
- Replace or disable the existing MT5 Bridge/Relay/Proxy path.
- Merge existing Exness PRs or claim their CI has passed.

## 8. Implementation sequence after design review

1. Confirm the Staging host and its recurring cost; no host is assumed free.
2. Prove private Cloudflare Worker connectivity and account entitlement with a non-secret health endpoint.
3. Deploy one isolated OpenBao Staging node with TLS, Raft persistence, Shamir seal, protected backup, and audit configuration.
4. Configure Transit key and a narrowly scoped application identity; validate the chosen identity mechanism and policies.
5. Implement a server-only Tenant Credential Provider in a separate code PR, with dependency-injected OpenBao client and synthetic tests.
6. Add owner-bound storage metadata only after a reviewed schema/migration proposal and explicit staging approval.
7. Pass two-owner isolation, leak, lifecycle, restore, and fail-closed tests.
8. Integrate the existing Exness read-only adapter only after the custody gate is satisfied.
9. Review exact-head CI and security evidence; staging activation and production activation remain separate approvals.

## References

- OpenBao Integrated Storage (Raft): https://openbao.org/docs/configuration/storage/raft/
- OpenBao Transit engine: https://openbao.org/docs/secrets/transit/
- OpenBao Transit seal: https://openbao.org/docs/configuration/seal/transit/
- Cloudflare Workers VPC Tunnel: https://developers.cloudflare.com/workers-vpc/configuration/tunnel/
