# CopilotKit OpenBot — NOVA Branch Security & Feasibility Assessment

**Status:** Initial source-based assessment; not a security certification  
**Date:** 2026-11-15  
**Repository under evaluation:** https://github.com/CopilotKit/OpenBot  
**NOVA base:** `main` at `02480d48c421dab573ac976be6d90d9efb46fa17`  
**Assessment branch:** `experiment/copilotkit-openbot-security-audit`

## 1. Scope and change boundary

This branch is an isolated documentation-only assessment. No OpenBot runtime, package, secret, credential, database migration, workflow, or production configuration is installed or changed by this commit.

- Do not merge this branch automatically.
- Do not deploy it to Netlify, Cloudflare, Supabase, or any production environment.
- Do not connect Exness, MT5, broker bridges, order APIs, trading credentials, or NOVA production databases.
- Keep NOVA's existing read-only / execution-disabled controls unchanged.
- Any future prototype must use a separate local environment, synthetic data, disposable database, and test-only credentials.

## 2. Executive assessment

**Recommendation: conditional GO for a local, isolated, read-only prototype; NO-GO for production adoption or Cloudflare Workers hosting.**

OpenBot is a workspace/orchestration product, not a drop-in React copilot component. Its documented architecture includes a React app, Hono API server, PostgreSQL, CopilotKit Intelligence, AG-UI agents, browser-computer containers, and a supervisor. It can connect external agents over AG-UI, which is the most relevant integration seam for NOVA.

The OpenBot template is MIT-licensed. CopilotKit Intelligence is separately licensed: local personal experimentation has a free local license path; Kubernetes evaluation requires a free trial; production Kubernetes use requires a production Intelligence license. Model-provider usage and compute remain separate costs.

## 3. Security findings

### 3.1 Critical configuration risk: permissive shipped computer policy

The current architecture documentation states that the shipped startup default is `deny: []` and `allow: ["true"]` unless replaced by `AGENT_COMPUTER_POLICY` or an administrator policy. It also documents a dry-run mode that records decisions while still allowing actions.

**Required mitigation:** never run the evaluation with the shipped permissive default. Configure an explicit deny-by-default policy before starting any computer runtime. Do not use dry-run as a security control. Verify the effective policy from the running deployment and test denied actions.

### 3.2 Approval is not equivalent to deny-by-default

The approvals documentation says certain high-impact action classes ask for approval, but those classes are open by default and can be allowed once, for a conversation, or always. Routine/check-in tasks ask before every change. Therefore approval UX alone is insufficient for NOVA's safety boundary.

**Required mitigation:** keep all broker/trading capabilities absent, not merely approval-gated. Keep external MCP tools disabled unless individually reviewed. Do not grant a Bot a tool that can place, modify, or close an order.

### 3.3 Isolation and credentials

OpenBot documents separate computer containers and a supervisor, but some deployment modes can share a computer. Its configuration includes credential encryption and multiple service tokens. The development startup script may supply fixed development fallback tokens; these must never be reused in a deployed test environment.

**Required mitigation:**
- Use a disposable local environment and unique random test-only keys.
- Never copy NOVA `.env`, Cloudflare tokens, Supabase service-role keys, model keys, or broker credentials into OpenBot.
- No production database URLs, host Docker socket exposure beyond the isolated supervisor requirement, host filesystem mounts, or shared browser profiles.
- If a later isolated test needs a computer, require per-Bot isolation, browser sandboxing, and a runtime sandbox such as gVisor where supported.
- Restrict outbound network access to an explicit allowlist; deny private, link-local, metadata, and internal production destinations.
- Treat page content, downloaded files, and agent instructions as untrusted input; test prompt-injection attempts before enabling tools.

### 3.4 Identity and public exposure

The deployment documentation requires authentication and TLS. The single-user mode is intended for a private address and refuses a public deployment when configured as an open administrator surface.

**Required mitigation:** local loopback only for the first prototype; no public tunnel, public URL, shared team login, or production SSO configuration.

## 4. Dependencies and supply-chain review

### Observed from repository manifests

- Root workspace uses Bun and declares `playwright-core`; the app manifest includes React 19, CopilotKit React Core 1.88.0, AG-UI Core 1.0.2, Better Auth, TanStack packages, Vite, and related UI dependencies.
- The root manifest pins Bun 1.4.3 and includes a Bun lockfile.
- The application is a multi-package workspace; inspecting only the root and app manifests is not a complete dependency inventory.

### Not yet verified

- Full server, computer, supervisor, and harness dependency manifests and exact resolved versions.
- Current OSV/GHSA/CVE findings for every direct and transitive package.
- License compatibility for every transitive dependency and bundled binary.
- Container image provenance, SBOM, signatures, and reproducible-build status.

**Required next checks before executing code:** enumerate every workspace and image manifest; generate an SBOM; run a lockfile-aware vulnerability scan (OSV or equivalent); review GitHub Dependabot alerts; verify image digests and provenance; inspect install scripts and lifecycle scripts. Do not infer “no vulnerabilities” from the absence of a reviewed advisory.

## 5. Cost and hosting fit

| Area | Assessment |
|---|---|
| OpenBot application template | MIT; no application license fee for the template itself |
| CopilotKit Intelligence | Separate entitlement; free local personal experimentation path, free Kubernetes evaluation trial, production license required for Kubernetes production use |
| Model APIs | Variable provider charges; not included in infrastructure cost |
| Local browser/computer | Uses local CPU, RAM, disk, and Docker; no hosting bill but non-zero machine/resource cost |
| Kubernetes deployment | Documented minimum 1 vCPU / 2 GB RAM and 4 GB disk; recommended 2 vCPU / 4 GB RAM and 8 GB disk; measured image around 1.4 GB |
| NOVA Cloudflare Workers | Not a fit for hosting the complete OpenBot stack: its server, PostgreSQL, persistent storage, browser computer, and supervisor are container-oriented |

**Cost conclusion:** a genuinely zero-billing test is plausible only as a local experiment, subject to Intelligence entitlement and model choice. A public or production deployment cannot be assumed free. Do not create paid resources during this assessment.

## 6. NOVA integration fit

### Recommended boundary

Use OpenBot, if at all, as an optional operator workspace. Keep NOVA's existing backend, policy engine, broker bridge, data stores, and model runtime authoritative. Connect a future NOVA read-only agent to OpenBot through an AG-UI adapter; do not move trading logic or credentials into OpenBot.

### Explicitly out of scope

- Hosting OpenBot on Cloudflare Workers.
- Replacing NOVA's existing dashboard or AI runtime.
- Connecting production Supabase or production secrets.
- Exposing Exness/MT5 tools, order execution, account mutations, or broker credentials.
- Enabling unattended routines, autonomous browser actions, or unrestricted MCP servers.

## 7. Proposed gated test plan

1. **Static review only:** complete workspace inventory, SBOM, vulnerability scan, license scan, image review.
2. **Local boot test:** disposable local environment, loopback-only, synthetic data, no production credentials, no public ingress.
3. **Policy tests:** prove deny-by-default; verify browser, file, shell, MCP, and private-network denials; test approval and audit records.
4. **AG-UI adapter test:** connect a mock NOVA agent exposing read-only synthetic status only.
5. **Cost measurement:** record CPU/RAM/disk, model token usage, and any license/hosting requirements.
6. **Review gate:** produce test evidence and a threat-model update before any proposal to merge or deploy.

Stop immediately if the test requires production secrets, broad host access, a public endpoint, paid resources without explicit approval, or any broker/order capability.

## 8. Decision matrix

| Gate | Current result | Evidence needed |
|---|---|---|
| MIT template license | PASS (template only) | Recheck full dependency and asset licenses |
| AG-UI integration concept | CONDITIONAL | Mock adapter contract and integration test |
| Secure default policy | BLOCKED | Explicit deny-by-default config and negative tests |
| Dependency vulnerability status | NOT VERIFIED | Full SBOM and scanner output |
| Zero-cost production hosting | FAIL / NOT ESTABLISHED | Production Intelligence and infrastructure pricing |
| Cloudflare Workers hosting | NO-GO | Use existing NOVA boundary; do not port full stack |
| Production / broker access | PROHIBITED | No test can override NOVA execution-off policy |

## 9. Sources

- OpenBot repository and license: https://github.com/CopilotKit/OpenBot
- Architecture and browser action governance: https://github.com/CopilotKit/OpenBot/blob/main/docs/architecture.md
- Approvals: https://github.com/CopilotKit/OpenBot/blob/main/docs/approvals.md
- Configuration and required entitlements: https://github.com/CopilotKit/OpenBot/blob/main/docs/configuration.md
- Deployment sizing and hosting constraints: https://github.com/CopilotKit/OpenBot/blob/main/docs/deployment.md
- Development and contribution checks: https://github.com/CopilotKit/OpenBot/blob/main/docs/development.md

---
**Final status:** Branch created and assessment committed as documentation only. No runtime test, dependency scan, deployment, or production change has been performed.
