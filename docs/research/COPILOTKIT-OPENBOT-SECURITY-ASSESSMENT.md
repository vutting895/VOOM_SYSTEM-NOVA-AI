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


## 11. Expanded repository inventory — 2026-11-15 follow-up

A second read-only pass enumerated the upstream tree at the same pinned tree SHA `93e1d5dbc57960682b9b1168ed98ceb66d755379`.

- **32 dependency input files** matching lockfile or requirements-file patterns were found.
- **36 dependency manifests / requirements inputs** were found when including package manifests and Cargo/Python project manifests.
- The inventory spans the root Bun workspace, desktop Bun + Cargo, mobile npm, agent-specific Python requirements, Mastra agent, API tooling, and example agents.
- Additional independent lockfiles confirmed in the tree include `desktop/bun.lock`, `mobile/package-lock.json`, `agent-mastra/bun.lock`, `api/asyncapi-tools/bun.lock`, `examples/langgraph-bot/bun.lock`, and `examples/mastra-bot/bun.lock`.

This is an **inventory count**, not a statement that every one of the 32 inputs has been scanned against OSV. The GitHub integration used for this review does not expose an executable OSV-Scanner, cargo-audit, pip-audit, or SBOM generator. Attempts to read the upstream Dependabot and code-scanning alert endpoints were rejected by the GitHub fetch integration as unsupported endpoints; this does not mean those alert lists are empty.

The expanded inventory confirms that the earlier two-advisory result is a **minimum confirmed set**, not a complete vulnerability count. Do not treat it as a full scan.

### Recommended offline/CI scan commands (run only in an isolated disposable checkout)

The following are proposed commands, not commands already executed:

```bash
# Scan all supported lockfiles/manifests in the source tree
osv-scanner scan source -r .

# Produce an SPDX SBOM for the repository (requires a compatible generator)
syft dir:. -o spdx-json=sbom.spdx.json

# Rust desktop dependency audit
cargo audit --file desktop/src-tauri/Cargo.lock

# Python: resolve each harness in its own clean environment, freeze exact versions,
# then run pip-audit against the resolved environment.
```

For each published container image, scan the exact immutable digest rather than a floating tag:

```bash
osv-scanner scan image <image>@sha256:<digest>
```

Do not run these commands against NOVA's working directory or production environment. The checkout and toolchain should be disposable and isolated; preserve raw JSON/SBOM outputs and tool versions for reproducibility.

### Updated audit confidence

- Two advisory/version matches: **confirmed in source lockfiles**.
- Remaining dependency inventory: **enumerated but not vulnerability-scanned**.
- Exact runtime/container exposure: **unknown**.
- Overall security posture: **NO-GO remains unchanged**.


## 12. Executed OSV-Scanner source scan and SPDX inventory — 2026-11-15

### Scanner provenance

- Tool: Google OSV-Scanner `v2.7.1`
- Official release asset: `osv-scanner_windows_amd64.exe`
- GitHub release API digest: `sha256:7121dcf420aefbbf89a7f0050c4d3094e079ff93afd334dfc96f16b02ec85800`
- Local SHA-256: `7121dcf420aefbbf89a7f0050c4d3094e079ff93afd334dfc96f16b02ec85800`
- **Release asset checksum verified before execution.**
- Source checkout: `CopilotKit/OpenBot`, local checkout commit `dff27a3b5baebe36c6e7503532eaba57956ca95d`
- Scanner was run against a disposable source checkout under the user's Downloads folder. No package installation, build, runtime start, or Docker operation was performed.

### Scan command

```powershell
osv-scanner scan source -r <OpenBot-checkout> --format json --output-file osv-scan-results.json --all-packages
```

### Results

- 32 lockfile/requirements inputs were parsed by the scanner.
- Scanner emitted 47 source result groups: 32 lockfile groups and 15 additional `unknown`/manifest-derived groups.
- **Lockfile-backed results:** 290 package/advisory match rows, 87 unique package-version tuples, 199 raw advisory IDs; 191 groups after merging IDs connected by published aliases.
- 20 of the 32 lockfile input files contained at least one lockfile-backed advisory match.
- The root `bun.lock` alone contained 33 affected package-version tuples and 117 distinct advisory IDs (133 package/advisory rows across versions).
- The desktop Cargo lockfile, mobile npm lockfile, API tooling lockfile, examples, and optional agent workspaces also contain affected packages.
- The scanner filtered 65 local/unscannable package entries. Record this as a coverage limitation.
- The 15 `unknown` groups produced additional manifest-derived results (212 rows, 9 unique package-version tuples, 51 advisory IDs). These are **not included** in the lockfile-backed totals because the Python requirements inputs do not provide a complete resolved environment lock. Treat them as indicative until each harness is independently resolved and scanned.

The scanner returned exit code 1 because vulnerability findings were present. The JSON output was created and parsed successfully; exit code 1 is not represented as a clean scan.

### Confirmed lockfile-backed examples requiring triage

| Input | Package/version | Advisory evidence |
|---|---|---|
| Root `bun.lock` | `proxy-addr@2.0.7` | GHSA-jqcg-44mw-7w3h |
| Root `bun.lock` | `@modelcontextprotocol/sdk@1.30.0` | Multiple GHSA matches, including OAuth redirect/credential handling and request resource-exhaustion advisories |
| Root `bun.lock` | `better-auth@1.7.1` | OAuth state / OAuth proxy advisories |
| Root `bun.lock` | `axios@1.19.0` | Multiple SSRF, proxy/DNS policy, header and prototype-pollution advisories |
| Root `bun.lock` | `undici@5.29.0`, `6.28.0`, `7.29.0` | Multiple TLS, redirect, cache, HTTP parsing and resource-exhaustion advisories |
| API tooling `bun.lock` | `jsonpath-plus@7.2.0` | RCE advisories GHSA-hw8r-x6gr-fq4f and GHSA-pppg-cpfq-h7wr |
| Desktop `Cargo.lock` | `zip@2.4.2` | RUSTSEC-2026-0367, -0368, -0369, -0429 and GHSA matches |
| Mobile `package-lock.json` | `node-forge@1.4.0` | Multiple cryptography, TLS, certificate-validation and denial-of-service advisories |
| 12 agent test requirement files | `pytest@9.0.2` | GHSA-6w46-j5rx-g56g / PYSEC-2026-1845; test-only inputs, not proof of production runtime exposure |

These are dependency-version matches, not exploitability determinations. The scanner output includes transitive packages and separate optional workspaces (desktop, mobile, examples, API tooling, and agents). No claim is made that every listed component is included in the primary OpenBot production image or reachable at runtime. A deployment-specific dependency/image mapping is still required.

### SPDX SBOM

An SPDX 2.3 JSON inventory was generated from the same source checkout:

- File: `openbot-source-sbom.spdx.json`
- Package records: **4,892**
- File records: **32**
- Size: **7,060,132 bytes**
- SHA-256: `0ac0df27be890e5e6912c29141f8dfb7442cd465176a3e12968c813842eb5cdf`

This is a source/lockfile-derived inventory. It is not an SBOM of the published runtime images and is not a complete license-compliance report.

### Local evidence artifacts

Stored outside the NOVA repository in:

`C:\Users\Administrator\Downloads\OpenBot-Audit-20261115\`

- `osv-scan-results.json` — 4,401,944 bytes; SHA-256 `f9dd67c25eda3b1b9ddaec6ff874bdec1bf446cec2454405825cd7d2af7aa3f5`
- `openbot-source-sbom.spdx.json` — 7,060,132 bytes; SHA-256 as above
- `osv-scanner_windows_amd64.exe` — official v2.7.1 binary, checksum verified
- `OpenBot\` — disposable source checkout

The first interrupted scanner download did not match the official digest and was not executed. Only the subsequently downloaded binary with the exact release digest was executed.

### Updated decision

**NO-GO remains.** The source scan materially increases the confirmed dependency risk. The root Bun lockfile contains many more advisory matches than the two initially identified. Before any runtime test, prioritize the root Bun lockfile and security-sensitive packages (MCP SDK, auth, HTTP clients, proxy/IP parsing, and Hono), then separately remediate optional desktop/mobile/API/example/agent workspaces. Do not bulk-upgrade dependencies without compatibility tests and per-workspace change isolation.

Still not performed:
- Published backend/container image scan and image-to-lockfile mapping.
- Cargo audit / Python environment-specific pip-audit.
- Complete license policy evaluation.
- Runtime reachability and exploitability validation.
- Deny-by-default policy negative tests.
- Any OpenBot runtime test or NOVA integration.


## 13. Remote registry image scan — 2026-11-15 UTC

### Image selected and immutable identity

The published server image was scanned directly from GHCR using Trivy remote-image mode. No Docker daemon, local container runtime, container start, or application execution was used.

- Reference: `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- Registry digest: `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Linux/amd64 platform manifest digest: `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`
- Image config ID: `sha256:27a53cb929817ad818f70922da56638db15446e598fef95456974777b0d6200b`
- Image OS: Debian 13.7
- Image config user: `openbot:openbot` (non-root)
- Exposed port: `3001/tcp`
- Embedded build commit: `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`
- Embedded build timestamp: `2026-11-14T13:45:07Z`
- Compressed layer total: 78,651,833 bytes; Trivy reports uncompressed image size 245,474,816 bytes.

**Important source/image mismatch:** the disposable source checkout used for the earlier OSV source scan is commit `dff27a3b5baebe36c6e7503532eaba57956ca95d`, while this published image embeds commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`. The source scan and this image scan therefore describe different source revisions. Do not use one as a complete substitute for the other; a commit-matched source and image scan is still required.

### Scanner provenance

- Tool: Aqua Security Trivy `v0.76.2`
- Official Windows release archive SHA-256 checked against the release checksum file:
  `691f737a7e5566a673c3a74dab9160552ec32101e953b659e5c77443d16dddb6`
- Scan mode: `--image-src remote --platform linux/amd64`
- Vulnerability DB and misconfiguration checks bundle were downloaded by Trivy.
- No container runtime was installed.

### Image vulnerability results

| Severity | Match rows | Unique advisory IDs |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 48 | 13 |
| Medium | 90 | 44 |
| Low | 64 | 35 |
| Unknown | 5 | 3 |
| **Total** | **207** | **95** |

- 43 unique OS package/version tuples were affected.
- Trivy detected 80 Debian OS packages.
- Only 3 match rows had a fixed version listed in this scan output (2 High and 1 Medium); the remaining rows did not report a fixed version. This is not proof that no vendor backport or later fix exists: Debian advisory status and package changelogs must be checked before remediation.
- No Critical findings were reported by this Trivy database for this image digest.
- No language-specific package files were detected (`num=0`). This is a significant coverage boundary because the image includes a compiled Bun/JavaScript `/app/bin/openbot` executable and copied application assets; this scan does not establish that all application-level dependencies inside those artifacts are free of vulnerabilities.

Examples of High OS-package matches include ncurses, SQLite, systemd, util-linux, and ACL-related packages. Some advisories affect multiple binary/library package records from the same OS component; do not interpret the 48 High rows as 48 independent exploit paths.

### Image configuration and secret scan

A second Trivy run enabled vulnerability, secret, and image-configuration misconfiguration scanners:

- Secret findings: **0**
- Image configuration misconfigurations: **1 Low**
- Finding: `DS-0026 — No HEALTHCHECK defined`
- The image config declares the process user as `openbot:openbot`, not root.
- No runtime secrets were detected in the scanned image layers. This does not inspect deployment environment variables or external secret stores.

The absence of a Docker HEALTHCHECK is an operational resilience/health-reporting gap, not evidence of a direct compromise. Add a health check only after confirming a reliable health endpoint and ensuring it does not expose sensitive information.

### Local image scan evidence

All artifacts remain in the isolated audit folder, outside the NOVA repository:

- `openbot-server-image-trivy.json` — vulnerability-only report; 1,070,404 bytes; SHA-256 `d0d0f563d17ac580df732066b8ee48e2063d9d42dfe60c2ac1c16d1b131ae64a`
- `openbot-server-image-security.json` — vulnerability + secret + image configuration report; 1,071,600 bytes; SHA-256 `8a956403e609e911f9b2a44ef8fe4c31ca395c503e6de298a24aaf446d7d39f5`

### Updated assessment

The actual published server image has now been scanned remotely. This confirms an OS-package vulnerability backlog in the selected digest, but does not prove exploitability or reachability. The non-root image user is a positive control; the missing HEALTHCHECK is a low-severity operational issue. The absence of language-specific files means application dependency coverage remains incomplete.

**NO-GO remains** for NOVA runtime integration. Do not bulk-update Debian packages or application dependencies inside the image without matching the image's exact source commit, rebuilding in an isolated pipeline, and re-running source + image scans. The next required gates are:
1. Match the published image to exact source commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3` and run source scanning on that commit.
2. Inspect the Bun executable and bundled JavaScript application assets for dependency metadata; establish application dependency coverage.
3. Verify the image signature/provenance and confirm the release's pinned digest.
4. Triage Debian advisories against Debian security tracker/backports and identify fixed package versions.
5. Repeat the same Trivy scan after any upstream remediation; compare results by digest.
6. Test deny-by-default computer policy and tenant isolation in a disposable environment before considering runtime evaluation.

No OpenBot runtime was started, no secrets were supplied, no paid service was created, and no NOVA Production resource was touched.


## 14. Commit-matched OSV source scan — 2026-11-15 UTC

### Commit and image correlation

The previous source/image mismatch has been closed for source scanning: the disposable OpenBot checkout was fetched and checked out detached at the exact commit embedded in the scanned GHCR image.

- Image reference: `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- Image registry digest: `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Embedded source commit: `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`
- Git checkout verification: `git rev-parse HEAD` returned exactly `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`.
- Checkout state: detached HEAD; clean working tree before scan.
- Location: existing disposable audit checkout under `C:\Users\Administrator\Downloads\OpenBot-Audit-20261115\OpenBot\`.
- No dependencies were installed, no build or runtime was run, and no container was started.

### Exact-commit scan

The same previously checksum-verified OSV-Scanner v2.7.1 executable was used:

```powershell
osv-scanner scan source -r <OpenBot-checkout> --format json --output-file osv-image-commit-7d1d96c-results.json --all-packages
```

- Scanner exit code: **1** (findings present; not a clean scan).
- Result groups: **46** (31 lockfile groups and 15 additional unknown/manifest-derived groups).
- Lockfile-backed affected package records: **102**.
- Unique affected package URLs (PURLs): **84**.
- Lockfile-backed package/advisory rows: **275**.
- Unique raw advisory IDs: **190**.
- The root `bun.lock` still contains **33 affected package/version entries, 133 package/advisory rows and 117 distinct advisory IDs**.
- The 15 unknown/manifest-derived groups remain separate from lockfile-backed totals; requirements files are not fully resolved environments.

### Comparison with the earlier source revision

| Metric | Earlier checkout `dff27a3b5baebe36c6e7503532eaba57956ca95d` | Image-matched checkout `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3` |
|---|---:|---:|
| Lockfile groups | 32 | 31 |
| Affected package records | 112 | 102 |
| Unique affected PURLs | 93 | 84 |
| Package/advisory rows | 290 | 275 |
| Unique raw advisory IDs | 199 | 190 |
| Root bun.lock advisory rows | 133 | 133 |
| Root bun.lock distinct advisory IDs | 117 | 117 |

These totals are scanner-database and source-revision dependent. The reduction in aggregate findings does **not** mean the published image is safe: the root Bun lockfile's advisory counts did not change, and findings across optional workspaces may not be shipped in this server image. This remains a source/lockfile scan, not runtime reachability proof.

### Evidence artifact

- File: `osv-image-commit-7d1d96c-results.json`
- Size: **4,075,294 bytes**
- SHA-256: `54ddf0471a38bca0800f8ce40bd63ea2df614efa8b33a63686fba39a42c5de67`
- Stored in the isolated audit folder outside the NOVA repository.

### Updated decision and remaining work

The exact image commit now has a source scan, so the earlier source/image revision mismatch is **RESOLVED for the source scan**. It is not resolved for application-level image dependency coverage: Trivy did not identify language package manifests in the image, and the Bun executable plus bundled JavaScript still need a reproducible build-to-SBOM mapping.

**NO-GO remains** for runtime integration. Remaining gates:
1. Inspect the Bun executable and bundled JavaScript to derive an application dependency inventory; Go build-info inspection is not applicable.
2. Verify Cosign signature against the exact immutable image digest using the upstream public key; verify available build provenance/attestation.
3. Check Debian OS findings against Debian security tracker/backports.
4. Resolve the application image SBOM gap and map source dependencies to the image.
5. Harden and negatively test deny-by-default computer policy and tenant isolation in a disposable environment.

No NOVA production resource was touched, no runtime was started, no secrets were supplied, and no paid resource was created.


## 15. Image signature, OCI SBOM attestation, and embedded runtime inspection — 2026-11-15 UTC

### Cosign signature verification — PASS

The exact immutable multi-platform image index digest was verified with the upstream repository public key:

- Image: `ghcr.io/copilotkit/openbot-server@sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Tool: Cosign `v3.1.4`; official release asset and checksum-file digests verified before execution.
- Public key: `docs/cosign.pub` from the image-matched source checkout.
- Public-key file SHA-256: `f8893375408700e1be6a5276ec15f1f770bc682d7b801c72ac9d420c0977aca9`
- Verification command: `cosign verify --key docs/cosign.pub --insecure-ignore-tlog=true <image>@<digest>`
- Result: Cosign validated the claims and verified the signature against the supplied public key; exit code **0**.
- Verification output SHA-256: `adc350ef62fa7b8b5a43c8847bc84a4ccf71be92ee3ad589dd40650a0b58f963`.

**Limitation:** upstream documentation says signatures are not recorded in a public transparency log. The required `--insecure-ignore-tlog=true` option therefore bypasses transparency-log verification. This proves the signature matches the supplied upstream key and digest, but provides less independent transparency/auditability than a logged signature.

### OCI SBOM attestation — PRESENT AND DIGEST-CHECKED

The GHCR OCI image index for the verified digest contains a Linux/amd64 attestation manifest:

- Index digest: `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Linux/amd64 image manifest: `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`
- Attestation manifest: `sha256:8955e04c0f912bdc23210654a033391e8c5297c51afcd71a107080859dd35a83`
- Attestation predicate: SPDX `https://spdx.dev/Document`
- SPDX document: `SPDX-2.3`
- Generator: Syft `v1.51.0`; BuildKit `v0.34.2`
- Creation time: `2026-11-14T13:45:09Z`
- Subject digest: exactly the Linux/amd64 image manifest above.
- SBOM blob digest verified locally: `sha256:ae8d49ad05a3fbda7164930309f4f5b9393535688786ba3d285c294ced2f224f`.
- SBOM records: **81 package records** (80 Debian package PURLs plus the SPDX document record) and **2,604 file records**.
- Local evidence file: `openbot-server-image-sbom.spdx.json`; 1,928,377 bytes; SHA-256 equals the attestation blob digest above.

**Important coverage result:** this image SBOM records Debian OS packages, but no npm/Bun/Go application package records. It does not close the application dependency inventory gap. The SPDX attestation is an OCI artifact in the signed image index; do not confuse it with a separately verified SLSA build-provenance statement.

### Embedded executable inspection — correction to earlier assumption

The exact Linux/amd64 image layer containing `/app/bin/openbot` was downloaded directly from GHCR and extracted without running the container or executable.

- ELF64, little-endian, x86-64.
- File size: **107,530,208 bytes**.
- SHA-256: `b9b36329f7f1b4f3bda04c3ac485e80485699acfea30267611b78f69ddb8cff3`.
- Strings include Bun CLI/runtime identifiers and the embedded runtime string `bun/1.4.3 npm/? node/v26.3.0 linux x64`.
- Additional symbols and strings include V8/JavaScriptCore and Bun runtime internals, as well as bundled OpenBot application code.
- The image-matched root `package.json` declares `packageManager: bun@1.4.3`.
- The image-matched `app/package.json` declares the application dependencies, including `@copilotkit/react-core@1.88.0`, `@ag-ui/core@1.0.2`, `better-auth`, React 19, and related packages.

**Correction:** the earlier plan to inspect this file as a Go binary was based on an unverified assumption and is withdrawn. No Go build-info marker was found in the extracted executable. The evidence identifies it as a Bun-based ELF executable with bundled JavaScript application content. Do not use `go version -m` as the appropriate inventory method for this file.

### Build provenance verification — NOT VERIFIED

A deeper review of `.github/workflows/images.yml` and `.github/published-images.json` corrects the earlier interpretation of the workflow:

- The `backend-images` job resolves and pins digests for `openbot`, `openbot-server`, `openbot-agent-computer`, and `openbot-supervisor` from GHCR. It inspects existing registry images; it does not build the server image.
- The `provenance: true` and `sbom: true` BuildKit options are in the separate `component-images` matrix. `.github/published-images.json` lists 13 `agent-*` images, not the `openbot-server` backend image under audit.
- The `actions/attest-build-provenance` step is in `component-manifests`, which creates manifests for those component images. It is not evidence that the target `openbot-server` digest was built or attested by that workflow.
- `gh attestation verify` against the exact server image index digest returned GitHub API HTTP 404 for the repository attestation endpoint.
- The OCI index does contain an SPDX SBOM attestation manifest, but its predicate is SPDX, not SLSA provenance.

**Correction:** the presence of BuildKit provenance/SBOM options and an attestation action somewhere in the same workflow does not establish provenance for the server image. That inference was too broad and is withdrawn. No successful cryptographic verification of a SLSA provenance statement tied to this server image digest has been obtained.

Therefore **server-image build provenance remains UNVERIFIED**, not confirmed absent. The required next step is to identify the actual upstream workflow/repository that builds `ghcr.io/copilotkit/openbot-server` and obtain a provenance statement or verifiable attestation bundle for this exact digest.

### Updated decision

- Image signature against upstream key: **VERIFIED**, with transparency-log bypass limitation.
- OCI SPDX SBOM attestation: **PRESENT**, subject and blob digests verified.
- Image SBOM application dependency coverage: **INCOMPLETE** (80 Debian packages; no application package PURLs).
- Executable runtime identity: **Bun 1.4.3 / Node compatibility v26.3.0 evidence found**; not a Go binary.
- SLSA build provenance: **NOT VERIFIED**.
- Image runtime/exploitability: **NOT TESTED**.

**NO-GO remains** for NOVA runtime integration. Next gates are to obtain and verify SLSA provenance for the exact digest, derive a complete application dependency SBOM from the exact build inputs or build pipeline, and triage the OS findings against Debian security status. No container was started and the executable was not run.


## 16. Debian OS advisory triage and provenance-scope correction — 2026-11-16 UTC

### Debian tracker validation of Trivy findings

The Trivy JSON was parsed directly from the retained image scan artifact:

- Trivy: `0.76.2`
- Target: `ghcr.io/copilotkit/openbot-server@sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Vulnerability match rows: **207**
- Severity rows: High **48**, Medium **90**, Low **64**, Unknown **5**
- Unique advisory IDs: **95**
- Rows with a Trivy `FixedVersion`: **3**; rows without one: **204**

The 207 rows are not 207 unique vulnerabilities or independent exploit paths. Multiple binary packages and shared libraries can map to the same source package/CVE. The 95 unique advisory IDs are the better count for distinct advisory identifiers, but still do not establish reachability.

The image package versions were compared with Debian Security Tracker entries for Debian 13/Trixie. The following matches are confirmed as **vulnerable** in the tracker at audit time:

| Image package(s) | Installed version | Advisory | Debian Trixie status | Qualification |
|---|---|---|---|---|
| `util-linux`, `mount`, `bsdutils`, `libmount1`, `libblkid1`, `libuuid1`, `libsmartcols1`, `liblastlog2-2`, `login` | `2.41.5-0+deb13u1` (related binary package revisions as in image) | CVE-2026-76642, CVE-2026-78408, CVE-2026-78409, CVE-2026-78410 | Vulnerable; some marked `no-dsa` | Mount-helper/post-hook, cgroup authority, detached-tree path and restricted-bind-mount issues. Do not assume the tools are reachable from the OpenBot server process. |
| `libsqlite3-0` | `3.46.1-7+deb13u2` | CVE-2026-119373, CVE-2026-119374, CVE-2026-119379 | Vulnerable; `no-dsa` | FTS5/session-extension preconditions apply; application use of those features and attacker control of database content are not established. |
| `libacl1` | `2.3.2-2+b1` | CVE-2026-54369 | Vulnerable | Local privilege escalation requires a privileged caller to process attacker-controlled path components; reachability not established. |
| `libsystemd0`, `libudev1` | `257.13-1~deb13u1` | CVE-2026-16742 | Vulnerable; `no-dsa` | systemd-homed local privilege-escalation issue; whether systemd-homed is present/enabled/used in this container is not established. |
| `libtinfo6`, `ncurses-base`, `ncurses-bin` | `6.5+20250216-2` | CVE-2025-69720 | Vulnerable; `no-dsa` | Stack overflow in `infocmp`; presence of package does not prove that the affected CLI path is invoked. |
| `perl-base` | `5.40.1-6+deb13u1` | CVE-2026-9538 | Vulnerable; postponed | Archive::Tar memory exhaustion on crafted tar headers; application invocation and untrusted archive handling are not established. |

Debian tracker sources checked:

- https://security-tracker.debian.org/tracker/source-package/util-linux
- https://security-tracker.debian.org/tracker/source-package/sqlite3
- https://security-tracker.debian.org/tracker/CVE-2026-76642
- https://security-tracker.debian.org/tracker/CVE-2026-78408
- https://security-tracker.debian.org/tracker/CVE-2026-119373
- https://security-tracker.debian.org/tracker/CVE-2026-54369
- https://security-tracker.debian.org/tracker/CVE-2026-16742
- https://security-tracker.debian.org/tracker/CVE-2025-69720
- https://security-tracker.debian.org/tracker/CVE-2026-9538

**Interpretation:** `no-dsa` and `postponed` are Debian triage decisions, not statements that a package is fixed or unaffected. These statuses must not be translated into “false positive.” Conversely, “vulnerable” at the OS package level is not proof that an exploitable path is exposed by this application. A runtime reachability review is still needed before assigning application-level severity.

### Remediation direction

1. Ask the upstream image maintainer for a rebuilt server image based on Debian package versions that address the applicable Trixie advisories, or a documented reason for retaining each package version.
2. Do not blindly upgrade the image's OS packages independently; use the upstream reproducible build and test its entrypoint, Chromium, Bun runtime, and database migrations.
3. For each advisory, record package source name, installed binary package version, Debian tracker status, fixed version/backport evidence, and whether the vulnerable executable/library path is used.
4. Re-scan the replacement image by immutable digest and compare unique CVE IDs and package versions. A reduced Trivy row count alone is not an acceptance criterion.

### Corrected build-provenance scope

The upstream `.github/workflows/images.yml` review shows that its BuildKit `provenance: true`/`sbom: true` settings and `actions/attest-build-provenance` step apply to the 13 agent component images listed in `.github/published-images.json`, not to the `openbot-server` backend image. The workflow's `backend-images` job only inspects existing GHCR tags and records their digests.

Accordingly, the earlier suggestion that this workflow itself established provenance for the server image is withdrawn. The SPDX attestation observed on the server image index remains valid evidence of an attached SBOM; it is not SLSA provenance. **SLSA provenance for the exact server image digest remains NOT VERIFIED.**

### Updated assessment

- Debian OS advisories: **CONFIRMED VULNERABLE PACKAGE MATCHES** across multiple Trixie packages; application reachability remains untested.
- Trivy: **207 match rows / 95 unique advisory IDs**; do not treat match rows as unique exploitable flaws.
- Application dependency SBOM: **INCOMPLETE**; image SPDX records Debian packages only.
- Server-image SLSA provenance: **NOT VERIFIED**; workflow provenance steps were scoped to agent component images, not the server image.
- Runtime, tenant isolation, computer policy, and exploitability: **NOT TESTED**.

**NO-GO remains** for NOVA runtime integration. Continue with read-only source/build mapping and request an upstream server-image rebuild plus exact-digest provenance. No container was started, no executable was run, no secrets were supplied, and no NOVA Production resource was changed.


## 17. Exact backend image publishing and attestation path — 2026-11-16 UTC

### Scope of the workflow review

The exact source checkout used for the image audit is commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`. The following workflow files were inspected locally in that checkout:

- `.github/workflows/internal-build.yml`
- `.github/workflows/publish-release.yml`
- `.github/workflows/images.yml`
- `.github/published-images.json`
- `backend-images.env`

The result is more precise than saying the workflow has provenance steps somewhere:

1. `internal-build.yml` passes a `backend_tag` input (default `main`) to the reusable `images.yml` workflow. Its own comment says the OpenBot server, computer, supervisor and all-in-one images are the already-published images at the selected backend tag.
2. `publish-release.yml` calls `images.yml` only after its release checks pass. It does not independently build the backend server image.
3. In `images.yml`, job `backend-images` authenticates to GHCR, runs `docker buildx imagetools inspect` on the four existing `ghcr.io/copilotkit/*` tags, validates platform descriptors, and writes digest references. It has `packages: read`; it does not build or push those backend images and has no `attest-build-provenance` step.
4. The separate `component-images` matrix builds the 13 images in `.github/published-images.json` with BuildKit `provenance: true` and `sbom: true`. The `component-manifests` job then runs `actions/attest-build-provenance` for those component manifest digests. Those are not the `openbot-server` backend image.

### Consequence for the audited digest

The audited image is:

`ghcr.io/copilotkit/openbot-server:main-20261114-78`

Registry index digest:

`sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`

Its image metadata embeds source commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`, which ties the image to a source revision. However, the inspected OpenBot repository workflows only consume/pin the already-published backend tag; they do not show which trusted workflow built and pushed this server digest.

The tag shape `main-20261114-78` is consistent with a dated main-branch build, but a tag name is not provenance. No verified builder identity, workflow run, source repository/build definition, or SLSA statement has yet been linked cryptographically to this exact digest.

### Documentation discrepancy

The current `docs/releasing.md` description says a build provenance attestation is pushed alongside every published image. The inspected reusable workflow does not do this for the four backend images it merely pins; it attests the component images it builds. This is a documentation/supply-chain scope discrepancy that should be clarified by the upstream maintainers. The actual workflow implementation, not the broad prose description, governs this finding.

### Required evidence to close the gap

Request from the upstream maintainer:

1. The exact workflow repository/path and run ID that built and pushed `openbot-server@sha256:13ba8a1d...`.
2. A verifiable SLSA/in-toto provenance statement whose subject digest matches the exact OCI index or platform manifest digest, and whose builder identity is trusted.
3. The build source commit, Dockerfile path, build context, build parameters, and dependency lockfile digest.
4. An application-level SBOM covering the production Bun workspace dependencies in the final image, mapped to the same digest.

Until those artifacts are independently verified, classify server-image provenance as **NOT VERIFIED**. The existing Cosign signature proves that the image digest verifies against the supplied upstream public key, subject to the documented transparency-log bypass; it does not by itself prove which workflow built it.

### Updated assessment

- Exact source revision embedded in image: **IDENTIFIED**.
- Upstream repository workflow responsible for building this backend image: **NOT IDENTIFIED**.
- OpenBot repo release/internal-build workflow provenance for this server image: **NOT PROVIDED by the inspected jobs**; they pin the existing image digest.
- Server image SLSA provenance: **NOT VERIFIED**.
- Component image provenance: **workflow config present**, but it is not transferable to the server image.
- Runtime and tenant isolation: **NOT TESTED**.

**NO-GO remains** for NOVA runtime integration. No container was started, no executable was run, no secrets were supplied, and no NOVA Production resource was changed.


## 18. Cost and licensing gate — 2026-11-16 UTC

### Verified plan facts

The official CopilotKit pricing page currently lists:

- **Developer:** Free forever for one developer; cloud hosting included; limits include 3-day thread retention, 200 maximum threads, 1 GB multimodal storage, and 500 total channel credits.
- **Pro:** USD 39/month.
- **Team:** USD 100/seat/month, up to 5 seats; self-hosting including the database is listed at this tier.
- **Enterprise:** custom pricing.

Official documentation distinguishes cloud-hosted Intelligence from self-hosting. Cloud-hosted use still requires the customer's runtime, agent, and model-provider credentials. Self-hosted Intelligence access is listed for Team self-hosted or Enterprise plans.

The local Intelligence evaluation guide states that the local CLI preview is not a production installation, is currently supported on macOS with Docker Desktop, and requires an evaluation license. The Developer plan qualifies, but non-Enterprise evaluation licenses last 30 days and require online renewal. It also states that model credentials are not included and calls to online model providers still need internet access.

Sources:
- https://www.copilotkit.ai/pricing
- https://docs.copilotkit.ai/agent-spec/intelligence/overview
- https://docs.copilotkit.ai/intelligence/self-hosting-local
- https://docs.copilotkit.ai/a2a/intelligence/self-hosting-local

### Implications for NOVA's zero-cost requirement

1. **Cloud-hosted Developer tier** may allow a no-subscription evaluation, but it is not unlimited: the listed retention, thread, storage, and channel limits apply.
2. **Production self-hosted CopilotKit Intelligence** is not established as a zero-cost option; official plan documentation places self-hosted access at Team self-hosted or Enterprise.
3. OpenBot's run-from-source instructions require a CopilotKit Intelligence project/license and a model key for its proof-of-concept Bot. The provider's model usage is outside the Developer plan's stated included features and may incur separate charges; no provider billing account or quota has been inspected.
4. Local Intelligence preview is not a viable NOVA production assumption: the official guide says macOS-only preview and not production. The user's existing Windows workflow does not meet that documented support scope.
5. OpenBot's optional Composio provisioning, any third-party connectors, storage, egress, and runtime hosting costs have not been measured or proven free.

### Cost decision

- Zero-subscription proof of concept using the hosted Developer plan: **POTENTIALLY FEASIBLE WITH STRICT QUOTAS**, subject to model-provider and integration costs.
- Zero-cost, self-hosted production Intelligence: **NOT ESTABLISHED; official plan gate indicates paid Team/Enterprise**.
- Fully zero-cost OpenBot production: **NOT VERIFIED**.

### Required cost controls before any trial

- Do not enter a payment method or upgrade plan without explicit approval.
- Use a dedicated evaluation project, not a NOVA production project.
- Set provider-side spending caps/alerts before enabling model calls; confirm the provider supports hard limits rather than relying on alerts alone.
- Disable optional Composio provisioning, channels, learning, and multimodal uploads unless the feature is required and its cost/terms are verified.
- Record quotas, retention, renewal date, data export/deletion process, and service shutdown procedure.
- Do not treat "free Developer plan" as proof that the complete OpenBot stack or its model calls are free.

### Updated cost status

- CopilotKit Developer tier: **FREE WITH QUOTAS**.
- Self-hosted Intelligence production entitlement: **PAID PLAN GATE**.
- Model provider spend: **UNASSESSED / POTENTIAL VARIABLE COST**.
- Composio/third-party integrations: **UNASSESSED**.
- Total OpenBot cost at NOVA's required zero-cost operating model: **NOT VERIFIED**.

**NO-GO remains** for NOVA runtime integration. No billing account, payment method, project, or resource was created or changed. No container was started, no executable was run, no secrets were supplied, and no NOVA Production resource was changed.


## 19. Source-tree coverage check — 2026-11-16 UTC

### Exact checkout inspected

The local OpenBot checkout was verified at:

`7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`

A Git tree inventory (`git ls-tree -r --name-only HEAD`) was run against this exact commit. It contains the root `package.json`, `bun.lock`, `app/package.json`, `shared/package.json`, `extension/package.json`, and the agent component Dockerfiles. It does **not** contain:

- a `server/` source directory;
- a server Dockerfile;
- a root Dockerfile for building the audited `openbot-server` image.

The root `package.json` at this commit declares only `app`, `shared`, and `extension` as Bun workspaces. The app manifest includes frontend dependencies such as React, TanStack, CopilotKit React SDK, Better Auth and related UI/runtime libraries. These manifests cannot stand in for the missing server dependency manifest.

The same checkout's `docker-compose.yml` explicitly describes the server image as **PULLED, NEVER BUILT HERE**. Its `backend-images.env` points to a published tag, and the inspected `images.yml` backend job only reads existing registry digests.

### Effect on the earlier source-commit claim

The extracted server binary contains the string/metadata value `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`. This proves that the value is embedded in the binary; it does **not** prove that this checkout supplied the server source or Docker build context.

The exact checkout lacks the server implementation and its Docker build definition. Therefore the earlier wording that the server image's embedded commit identifies the image's source revision was too strong. It is now reclassified as **embedded source-reference metadata only**. A source-to-binary build relationship has not been demonstrated.

### SBOM consequence

- The repository's `bun.lock` and app workspace manifests can support a frontend/workspace dependency inventory.
- They do not cover the compiled server binary's production dependencies.
- The OCI SPDX SBOM remains an OS-package inventory for the audited image and does not close the application dependency gap.
- A complete server SBOM requires the actual server build source, production lockfile/manifests, and build-to-image evidence from the upstream publisher.

### Required upstream evidence

Request the actual server build repository/source archive, Dockerfile and build context, exact source commit, lockfile, builder workflow/run ID, and an application SBOM attested to the audited digest. Do not infer source identity from a label or embedded string alone.

### Updated assessment

- Embedded commit-like string: **PRESENT**.
- Matching server source tree in inspected OpenBot commit: **NOT PRESENT**.
- Server Dockerfile/build context in inspected OpenBot commit: **NOT PRESENT**.
- Source-to-binary reproducible mapping: **NOT ESTABLISHED**.
- Server application dependency SBOM: **NOT AVAILABLE FROM THIS CHECKOUT**.

**NO-GO remains** for NOVA runtime integration. No dependency installation, image rebuild, container start, executable execution, secret use, billing action, or NOVA Production change occurred.
