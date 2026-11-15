# CopilotKit OpenBot — NOVA Security & Dependency Audit

**Audit date:** 2026-11-15  
**Audit type:** Read-only source and lockfile review; no runtime execution  
**Upstream:** https://github.com/CopilotKit/OpenBot  
**Upstream ref inspected:** `main`, tree SHA `93e1d5dbc57960682b9b1168ed98ceb66d755379`  
**NOVA repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**NOVA base SHA:** `02480d48c421dab573ac976be6d90d9efb46fa17`  
**NOVA branch:** `experiment/copilotkit-openbot-security-audit`

## 1. Decision

**NO-GO for runtime installation or production integration at this time.**  
**GO only for continued read-only source review and a future isolated test after dependency remediation and explicit security controls.**

The audit found two packages in the current upstream lockfiles that match published critical advisories:

1. npm `proxy-addr@2.0.7` in `bun.lock`; GHSA-jqcg-44mw-7w3h / CVE-2026-90711 affects versions below 2.0.8.
2. Rust crate `zip@2.4.2` in `desktop/src-tauri/Cargo.lock`; RUSTSEC-2026-0369 affects versions below 9.0.0.

The presence of an affected version in a lockfile is a confirmed dependency finding. It does **not** by itself prove that the vulnerable code path is reachable in a particular deployment. The desktop crate is scoped to the optional desktop build; the `proxy-addr` dependency is resolved through Express in the Bun lockfile. Runtime reachability and the exact published backend image still need separate verification.

The upstream GitHub Security page currently reports no detected `SECURITY.md` policy and no published repository advisories. Absence of published advisories is not evidence that the code or dependencies are vulnerability-free.

## 2. Work performed and evidence boundary

Read-only review performed against the upstream public repository:

- Recursive Git tree (4,716 entries; tree SHA above).
- Root `package.json`, `app/package.json`, `shared/package.json`, `extension/package.json`, selected agent requirements, desktop package manifest.
- Root `bun.lock` and `desktop/src-tauri/Cargo.lock`.
- `docs/architecture.md`, `docs/approvals.md`, `docs/configuration.md`, `docs/deployment.md`, `docs/development.md`.
- `.github/workflows/security_zizmor.yml`.
- GitHub Security page and public vulnerability advisories.

Not performed:
- No checkout, package installation, build, test, Docker image pull, container execution, SBOM generation, OSV-Scanner, cargo-audit, npm audit, or full transitive dependency scan.
- No inspection of the actual published backend image filesystem or its SBOM.
- No exploitability test or penetration test.
- No NOVA runtime, Cloudflare, Supabase, Netlify, Exness, MT5, or broker access.

Therefore this is a **targeted static/lockfile audit**, not a complete vulnerability scan or security certification.

## 3. Critical dependency findings

### Finding D-01 — proxy-addr 2.0.7

**Severity:** Critical (upstream advisory CVSS 9.1)  
**Observed:** `bun.lock` resolves `proxy-addr@2.0.7`; Express 5.2.1 declares `proxy-addr ^2.0.7`.  
**Affected range:** `>=1.1.0 <2.0.8`  
**Fixed version:** `2.0.8`

The advisory describes incorrect trust handling for IPv4-mapped IPv6 proxy subnets. Under a vulnerable trust-subnet configuration, unauthenticated clients may spoof `X-Forwarded-For`, affecting client-IP-based access control, rate limiting, geolocation and audit logging.

**Required remediation:** update the lockfile resolution to `proxy-addr@2.0.8` or later, verify the resolved version, and test all proxy trust configurations. Do not rely solely on a manifest range that permits the vulnerable version.

**Reachability caveat:** the dependency is present in the current Bun lockfile via Express. The server source is not present as a normal `server/` workspace in the inspected upstream tree; deployment uses published backend images. Confirm whether the affected dependency is included in the exact image/tag used by the deployment before asserting runtime exposure.

### Finding D-02 — Rust zip 2.4.2

**Severity:** Critical (RUSTSEC advisory CVSS 9.1)  
**Observed:** `desktop/src-tauri/Cargo.lock` contains `zip@2.4.2`.  
**Affected range:** versions below `9.0.0`  
**Fixed version:** `9.0.0` or later.

RUSTSEC-2026-0369 describes extraction applying Unix permissions through symlinks without constraining the target path.

**Required remediation:** upgrade the dependency chain to a fixed `zip` version, regenerate Cargo.lock, run Rust tests and cargo-audit, and inspect every extraction call site for path and symlink handling.

**Reachability caveat:** this lockfile belongs to the optional Tauri desktop build. The finding does not establish that the standard web/container build includes this Rust dependency or calls the vulnerable extraction functions.

### Dependency review status

| Check | Result |
|---|---|
| Root Bun lockfile inspected | DONE |
| Desktop Cargo lockfile inspected | DONE |
| proxy-addr advisory match | CONFIRMED |
| zip advisory match | CONFIRMED |
| Full OSV scan across all lockfiles | NOT RUN |
| Full SBOM | NOT GENERATED |
| Python agent dependency audit | NOT RUN |
| Published backend image scan | NOT RUN |
| License scan across all transitive dependencies | NOT RUN |

The repository contains additional Python agent requirement files, desktop/mobile lockfiles, and agent-specific lockfiles. Those are not all covered by this targeted pass.

## 4. Security posture findings

### S-01 — No published security policy

The upstream GitHub Security page reports that no `SECURITY.md` policy is detected and no published security advisories are listed.

**Impact:** vulnerability reporting and supported-version expectations are less explicit for downstream adopters. This is a governance gap, not proof of a software vulnerability.

### S-02 — Shipped computer policy is permissive unless overridden

The current architecture documentation explicitly states that the startup default is:

```yaml
deny: []
allow: ["true"]
```

unless `AGENT_COMPUTER_POLICY` or a saved administrator policy replaces it. Dry-run records decisions but still allows actions.

**Impact:** a default deployment may allow browser/computer actions broadly if an operator fails to supply a restrictive policy.

**Required control:** define an explicit deny-by-default policy before starting any computer runtime; verify the effective policy; test negative cases. Never treat dry-run as enforcement.

### S-03 — Approval cards are not a complete authorization boundary

The approvals documentation states that several high-impact action classes are open by default and can be allowed once, for a conversation, or always. It also documents actions that may not be recognized by the approval classifier.

**Required control:** do not expose payment, transfer, order, broker, account-mutation, or trading tools to the evaluation agent at all. Do not rely on approval classification to protect NOVA trading operations.

### S-04 — Shared computer is not a tenant isolation boundary

Deployment documentation states that without the supervisor, Bots share one computer; shared files and sessions mean this is not a boundary between tenants. The supervisor requires Docker socket access and must not be exposed outside the deployment network.

**Required control:** no public deployment or multi-tenant test. If a future isolated computer test is approved, require per-Bot isolation, strict network boundaries, and supervisor access only on a private internal network.

### S-05 — Secrets and configuration

OpenBot requires a database URL, credential-encryption key, Intelligence endpoint/key and, depending on selected harness, model-provider keys. Its docs instruct operators to generate their own encryption key; example values are not production credentials.

**Required control:** use only new disposable test credentials. Never copy NOVA `.env`, Cloudflare credentials, Supabase service-role keys, production model keys, or Exness/MT5 credentials into OpenBot.

### S-06 — Image supply chain

Deployment documentation describes cosign verification for published images, while noting that older images (v1.0.2 and earlier) are unsigned and signatures are not recorded in a public transparency log.

**Required control:** pin immutable image digests; verify signatures using the upstream public key; record the image digest and verification output. Do not use floating `latest` or `main` tags for a security-sensitive test.

### S-07 — CI security automation exists, but it is not a dependency scan

The repository contains a GitHub Actions workflow running zizmor against workflow definitions. This is useful CI workflow static analysis, but it does not establish that npm, Bun, Rust, Python, or container dependencies are free of known vulnerabilities.

## 5. Dependency and license inventory notes

Current root manifest identifies Bun 1.4.3 and workspaces `app`, `shared`, and `extension`. The recursive tree also contains independent agent, desktop, mobile, API tooling, and example dependency manifests/lockfiles.

Selected observed versions include:
- `@copilotkit/runtime@1.88.0` (root dev dependency)
- `@copilotkit/react-core@1.88.0`
- `@ag-ui/core@1.0.2`
- React `19.2.x`
- Vite `7.1.x`
- `playwright-core@1.62.1`
- Python agent requirements with a mixture of exact pins, ranges, and unpinned dependencies.

Unpinned Python requirements (for example `langgraph`, `langchain`, `fastapi`, and `uvicorn[standard]` in one harness) make a repeatable, fully resolved dependency assessment impossible from requirements files alone. A resolver-generated environment lock or image SBOM is required.

The top-level OpenBot template declares MIT. This does not establish that every transitive dependency, model integration, connector, CopilotKit Intelligence entitlement, or third-party service has no separate terms or cost. A full license inventory remains pending.

## 6. Cost and platform fit — corrected

The current README describes a free CopilotKit plan and a free Developer plan for local Intelligence evaluation on macOS with Docker Desktop; the local evaluation license is time-limited (30 days, renewable while the account remains in good standing). Managed Intelligence may be used with its project key and does not require a separate license token in the described flow. Model-provider API usage remains separate and may incur charges.

OpenBot requires Docker, Bun 1.4+, PostgreSQL/API/Bot computer services, and a model key for the documented local setup. Its deployment guide reports a measured image around 1.4 GB, minimum 2 GB RAM / 1 vCPU / 4 GB disk, and recommends 4 GB RAM / 2 vCPU / 8 GB disk for the described single-Bot scenario. Concurrent browser use increases memory demand.

The full stack is container-oriented and uses a supervisor that requires Docker socket access. It is not a Cloudflare Workers application. Keep NOVA's Cloudflare Workers backend and existing hosting boundary unchanged.

**Zero-cost conclusion:** a local evaluation may avoid a new hosting bill, but zero total cost is not guaranteed because Intelligence entitlement, model API usage, and machine resources are separate. No paid service or resource was created during this audit.

## 7. NOVA integration boundary

If later approved, OpenBot may be evaluated as a separate operator workspace only. NOVA remains authoritative for backend policy, model runtime, data, and broker safety.

A future adapter should expose only synthetic/read-only status over AG-UI. It must not expose:
- Exness, MT5, broker bridges, order placement, modification or closure.
- Trading account credentials, deposits, withdrawals, or account mutations.
- Production Supabase or Cloudflare secrets.
- Production database URLs, internal admin APIs, or unrestricted MCP servers.

Initial test must be local loopback only, disposable, synthetic-data-only, and with outbound network allowlisted. No public tunnel, public URL, or deployment.

## 8. Required remediation and next gates

1. **Upstream dependency remediation evidence:** confirm `proxy-addr >=2.0.8` and `zip >=9.0.0` in updated lockfiles or document why a dependency is not shipped/reachable.
2. **Complete dependency scan:** generate SBOMs for every JS/Bun, Rust, Python, mobile, and published container artifact; run OSV-Scanner, cargo-audit, and Python package audit tools; retain raw machine-readable results.
3. **Image provenance:** select a release, pin digests, verify cosign signatures and capture output; scan the exact images that would run.
4. **Policy hardening:** explicit deny-by-default computer policy; disable dry-run; prove browser, shell, filesystem, MCP, and private-network denials.
5. **Identity and secrets:** local-only authentication; unique throwaway secrets; no NOVA or broker credentials.
6. **Mock integration:** synthetic read-only AG-UI agent only.
7. **Cost approval:** confirm plan entitlement and model usage limits before any provider calls.

**Stop conditions:** any requirement for NOVA production secrets, broker permissions, public ingress, broad host filesystem access, unreviewed Docker socket exposure, or paid resource creation without explicit approval.

## 9. Final status

| Work item | Status |
|---|---|
| NOVA isolated branch | DONE |
| Upstream static architecture review | DONE |
| Targeted lockfile inspection | DONE |
| Critical advisory matches | 2 CONFIRMED IN LOCKFILES |
| Full SBOM / OSV scan | BLOCKED — not executed |
| Runtime reachability / image scan | BLOCKED — image not pulled or inspected |
| Full license scan | PENDING |
| Local runtime test | NOT STARTED |
| Production integration | NO-GO |

**No OpenBot runtime was installed or executed. No dependency was modified. No NOVA production resource or configuration was changed.**

## 10. Sources

- OpenBot repository: https://github.com/CopilotKit/OpenBot
- OpenBot GitHub Security page: https://github.com/CopilotKit/OpenBot/security
- Architecture: https://github.com/CopilotKit/OpenBot/blob/main/docs/architecture.md
- Approvals: https://github.com/CopilotKit/OpenBot/blob/main/docs/approvals.md
- Configuration: https://github.com/CopilotKit/OpenBot/blob/main/docs/configuration.md
- Deployment and image verification: https://github.com/CopilotKit/OpenBot/blob/main/docs/deployment.md
- Development: https://github.com/CopilotKit/OpenBot/blob/main/docs/development.md
- GHSA-jqcg-44mw-7w3h / CVE-2026-90711: https://github.com/advisories/GHSA-jqcg-44mw-7w3h
- OSV proxy-addr advisory: https://osv.dev/vulnerability/GHSA-jqcg-44mw-7w3h
- RUSTSEC-2026-0369: https://rustsec.org/advisories/RUSTSEC-2026-0369
