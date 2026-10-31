# NOVA OpenBao Staging — Closure Checklist

**Status:** BLOCKED — design and isolated client scaffold are merged; Staging is not installed, connected, or activated.  
**Snapshot date:** 2026-10-31  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Snapshot main SHA:** `aad16f6c62ace703624845780e46110ca9a4beda`  
**Control plane:** existing `integrations/system-hub` only  
**Environment:** isolated Staging, synthetic data only

## 1. Closure decision

Do not mark the OpenBao Staging work complete or operational yet. The architecture document and isolated Transit client scaffold are in `main`, but no evidence currently establishes a running OpenBao VM, an active private Cloudflare Workers VPC path, a configured Transit key, a reviewed workload identity/policy, or passing two-owner isolation tests.

This checklist is the acceptance record for the remaining work. It does not authorize infrastructure provisioning, paid services, Worker deployment, Supabase changes, customer credential intake, broker access, or Production activation.

## 2. What is merged and what is not

| Item | Current evidence | Closure state |
|---|---|---|
| OpenBao Staging architecture and security gates | PR [#155](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/155), merged as `8f72d7218d8c16e9a0444bfc7b04610540c9a307`; document `docs/architecture/NOVA-OPENBAO-STAGING-INTEGRATION.md` | Merged — design only |
| Isolated Transit client scaffold | PR [#158](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/158), merged as `aad16f6c62ace703624845780e46110ca9a4beda`; files under `integrations/system-hub/` | Merged — not wired into `worker.js`, not exposed, not active |
| Transit client test fixture correction | PR [#159](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/159), head `0a9d4a2219bd2e2feb36859fdff305930a904535` | Open — Frontend CI run #609 failed; job had no reported steps and the job-log artifact was unavailable |
| Exact-head local test report for PR #159 | PR #159 author comment reports 6/6 isolated tests passed locally | Reported, not independently reproduced in this closure pass; not a substitute for hosted CI |
| Netlify Deploy Preview for PR #159 | Netlify bot comment reports Preview ready for exact head `0a9d4a2219bd2e2feb36859fdff305930a904535` | Preview only; does not validate OpenBao runtime or Workforce UI |
| Private VM / OpenBao service | No OCI instance RUNNING evidence, instance ID, Private IP, or approved private administration path was attached to this verification | Not verified — provisioning/install blocked |
| Cloudflare Workers VPC | Read-only account inventory returned two existing Tunnels and zero VPC Services | Not connected |
| System Hub VPC binding | No verified VPC Service ID or binding/deployment evidence | Not implemented |
| Tenant custody and two-owner isolation | No live Staging identity, key policy, or two-owner acceptance evidence | Not tested |

The prior Frontend CI failure was retried through the GitHub integration; the retry request was accepted, but a passing rerun has not yet been observed. Do not update this row to passed without the exact new run and head SHA.

## 3. Current infrastructure blockers

### 3.1 OCI private host

A candidate OCI Singapore Always Free A1 Staging host was documented, but the following must be proven in the OCI Console before installation:

- The instance exists and is `RUNNING` in the tenancy Home Region.
- The selected Ampere A1 shape and every boot/block volume are explicitly labelled Always Free and stay within the account's free allowance.
- The host has a private subnet/address and **no public IPv4**.
- No paid NAT Gateway, paid shape, paid volume, or billing upgrade is introduced without a separate approval.
- A secure operator access path is available (for example, an approved OCI Bastion session); do not expose SSH to the public Internet.

Required evidence for this gate: instance state, shape, region, volume sizes/free labels, private IP, and the approved private access method. Hide account identifiers and never share private keys, tokens, or passwords.

OCI Always Free compute has capacity and idle-reclamation limitations. Treat it as a lab/Staging candidate, not a dependable always-on or Production service. See [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [OCI Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

### 3.2 Cloudflare private connectivity

Latest read-only inventory for the connected Cloudflare account:

- `voom-readonly-bridge`: `down`, local-managed.
- `voomsystem.netlify.app`: `inactive`, remotely managed.
- Workers VPC Service inventory: empty.

Do not repurpose either existing Tunnel. They belong to existing application/Bridge paths and are not the OpenBao Staging tunnel.

After the private host exists and its service is ready:

1. Verify the account operator has the required Connectivity Directory role for creating services and binding a Worker.
2. Create a **new, dedicated remotely managed Tunnel** for OpenBao Staging only.
3. Install a currently supported `cloudflared` release and establish the tunnel using QUIC; allow outbound UDP 7844.
4. Register a VPC Service for one fixed internal host and port only. Prefer a separate, minimal health service for the first connectivity proof.
5. Configure TLS certificate validation as `verify_full`; never use disabled verification.
6. Add the VPC Service binding only to the existing System Hub after its config and code are reviewed. Do not create a second gateway or bind the NOVA AI/chat Worker.
7. Prove a bounded Worker-to-private-health request and a fail-closed response when the VPC path or origin is unavailable.

Cloudflare's current documentation describes Workers VPC as beta and available on Free and Paid plans while in beta. VPC Services scope a binding to a registered host and port; VPC Networks grant broader reach and are not preferred for this fixed OpenBao target. Check the live account roles and implementation details before creating resources. References: [Workers VPC](https://developers.cloudflare.com/workers-vpc/), [VPC Services](https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/), [VPC API](https://developers.cloudflare.com/workers-vpc/api/), [Tunnel troubleshooting](https://developers.cloudflare.com/workers-vpc/reference/troubleshooting/).

## 4. OpenBao deployment and policy gates

Complete all items on the private Staging host; use synthetic values only.

- [ ] Pin an explicitly reviewed OpenBao version and container/image digest; do not use `latest`.
- [ ] Configure Integrated Storage (Raft) on persistent encrypted storage; document that a single node is Staging-only, not HA.
- [ ] Bind the API to the private interface only. No public listener, public IP, or direct Internet exposure of port 8200.
- [ ] Enable TLS and verify the full certificate chain and hostname from the Workers VPC path.
- [ ] Initialize once; use Shamir unseal for the initial no-KMS Staging trial. Keep recovery shares offline and separately controlled. Never place them in GitHub, chat, Cloudflare variables, or on the same host as the data.
- [ ] Enable protected audit logging and prove that tokens, request bodies, and plaintext values are not logged.
- [ ] Configure encrypted backups and complete a restore rehearsal before accepting even synthetic secrets.
- [ ] Define seal/unseal, operator access, recovery, key rotation, revocation, backup retention, and destruction procedures.
- [ ] Create only the dedicated Transit key needed for the Staging trial.
- [ ] Choose a short-lived non-root machine identity and an exact-path least-privilege OpenBao policy. No root/admin token in Worker Secrets.
- [ ] Prove expired, revoked, wrong-issuer, wrong-audience, malformed, and unauthorized identities fail closed.

## 5. System Hub integration gates

The existing System Hub remains the only authentication, ownership, and authorization boundary. OpenBao provides cryptographic operations; it does not authorize tenants.

The merged library `integrations/system-hub/openbao-transit-client.js` is only a transport-injected scaffold. It is not imported into the request lifecycle. Before wiring it:

- [ ] Define and review the exact private VPC service-binding adapter contract.
- [ ] Confirm the adapter normalizes the OpenBao HTTP response into the client's expected `{ ok: true, data: ... }` success shape, and maps HTTP failure/status safely. Do not pass a raw `Response` object to the client.
- [ ] Review/remove the unused response helper or add a focused test for the intended response-unwrapping contract.
- [ ] Derive owner ID from the verified Supabase session; never accept owner/tenant ID from the browser, AI, or request body.
- [ ] Load the exact connection under owner-scoped authorization and validate provider, environment, status, and operation allowlists before any Transit call.
- [ ] Construct one canonical, versioned tenant/connection context on the server. Context binding is not a replacement for authorization.
- [ ] Keep plaintext and decrypted bytes only in server memory for the minimum possible time. Never return plaintext, tokens, or DEKs to the browser, model, MCP, logs, traces, analytics, or audit payloads.
- [ ] Fail closed with a sanitized unavailable response when the service is missing, sealed, timed out, misconfigured, or returns malformed data. No fallback to Supabase Vault, shared credentials, or public URLs.

## 6. Supabase custody gate

The existing readiness record `docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md` reports that the inspected Staging Supabase Vault grants allow broad `service_role` access to Vault objects/functions and that a dedicated `nova_secret_manager` role was not present in that inspection.

Therefore:

- [ ] Do not reuse generic `service_role` to read/decrypt customer secrets.
- [ ] Keep public `anon` and `authenticated` roles unable to read secret schemas, ciphertext references, or decrypted views.
- [ ] Decide exactly what non-secret connection metadata and opaque ciphertext/reference may be stored; never store plaintext credentials.
- [ ] If any database role/function/schema change is needed, design and test it in an isolated local database first, then obtain explicit approval before applying to Staging.
- [ ] Re-run privilege inspection and two-owner RLS/authorization tests after any approved change.
- [ ] No Production schema, grants, secrets, or customer rows may be touched in this Staging closure.

## 7. Synthetic-only acceptance matrix

Do not use real customer credentials, Exness credentials, or production records.

| Test | Required pass evidence |
|---|---|
| Private network | System Hub reaches only the registered private health/OpenBao target through the dedicated VPC Service; no public route works |
| TLS | Full hostname and CA validation succeeds; invalid/expired/wrong-host certificate fails |
| Transit round trip | Synthetic plaintext encrypts/decrypts only through the reviewed private adapter; returned plaintext is server-side bytes only |
| Context binding | Ciphertext for owner/connection A fails under owner/connection B context and vice versa |
| Tenant isolation | Two synthetic owners; A cannot list, read, decrypt, rotate, revoke, or delete B's references |
| Authorization | Expired/revoked/wrong issuer/audience/connection owner and disallowed operation are rejected before Transit access |
| Least privilege | Application identity cannot read/list unrelated secrets, inspect server config, manage auth methods/policies, or use unrelated keys |
| Malformed responses | Missing/wrong-shaped fields, invalid base64/ciphertext, oversized payloads, upstream error and timeout fail closed with sanitized errors |
| Leakage | Synthetic plaintext, tokens, and decrypted bytes absent from HTTP responses to clients, logs, traces, analytics, audit output, and artifacts |
| Lifecycle | Rotate/rewrap, revoke, stale reference rejection, rollback and restore are exercised |
| Resilience | OpenBao sealed/down/unreachable causes fail-closed behavior; no fallback path is invoked |
| Trading invariant | `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`; no broker order/write calls |

Every test must be attached to the exact PR/main SHA and use independent synthetic fixtures. A unit test alone is not a substitute for private network, OpenBao, or two-owner integration evidence.

## 8. Required execution order

1. Finish PR #159: diagnose the failed hosted CI run, rerun until required checks pass on the exact head, and obtain code/security review. Do not merge on the strength of the local test report or Netlify Preview alone.
2. Obtain OCI VM/volume/free-tier and private access evidence; resolve capacity or cost blockers without selecting paid resources.
3. Install and harden OpenBao on the private VM using synthetic data; prove restart persistence, TLS, audit, backup/restore, and recovery.
4. Create the dedicated Tunnel and one tightly scoped VPC Service; prove health connectivity.
5. Implement and review the System Hub adapter and least-privilege machine identity/policy in a separate PR. Keep it disabled until exact-head CI and security review pass.
6. Run the complete synthetic acceptance matrix, including two-owner isolation and leakage scans.
7. Review the delivery verification plan and all exact-SHA checks. Staging activation requires explicit owner approval after evidence review.
8. Production, real customer credential intake, Exness connection use, broker writes, order submission, and Live Trading remain separate future approvals and are not part of this closure.

## 9. Non-negotiable safety state

- Exness Demo only; read-only + AI analysis.
- Order Submission OFF.
- Live Trading OFF.
- No new customer secret intake or decryption path is enabled.
- No changes to existing Bridge tunnels, Bridge rollback, production Workers, DNS, Supabase production, or customer data.
- Never request or place private keys, recovery shares, machine tokens, passwords, or API secrets in chat or GitHub.

**Completion rule:** Change this document's status only when each applicable gate has linked, exact-SHA, independently inspectable evidence. Until then, status remains **BLOCKED — NOT OPERATIONAL**.
