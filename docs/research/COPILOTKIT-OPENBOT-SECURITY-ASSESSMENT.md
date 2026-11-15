# CopilotKit OpenBot — NOVA Security & Dependency Audit

> **Internal research artifact — not production policy, a security certification, or authorization to deploy.** Findings are limited to the evidence and versions listed below. Runtime reachability and exploitability were not tested.

## Executive summary

**Decision: NO-GO for NOVA runtime installation or production integration.** Continue only read-only review. Reconsider an isolated evaluation only after the open supply-chain, dependency, policy, and cost gates below are addressed.

The review identified vulnerability matches in OpenBot source lockfiles and Debian OS packages in the selected backend image. These are evidence of affected package versions, not proof that vulnerable code paths are reachable or exploitable in a particular deployment. The backend image's signing key verification and OCI SPDX SBOM were checked, but its trusted builder/source-to-image provenance and application dependency inventory remain unverified/incomplete.

### Source and audit snapshot

- **Audit period:** 2026-11-15 to 2026-11-16 UTC
- **Upstream:** [CopilotKit/OpenBot](https://github.com/CopilotKit/OpenBot)
- **Source tree initially reviewed:** `main`, tree `93e1d5dbc57960682b9b1168ed98ceb66d755379`
- **Image-matched checkout reviewed:** commit-like metadata `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3` (the checkout does not contain the backend server implementation/build context; this metadata does not prove source-to-image mapping)
- **Scanned image:** `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- **OCI index digest:** `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- **Platform manifest:** Linux/amd64, `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`
- **NOVA base SHA checked:** `02480d48c421dab573ac976be6d90d9efb46fa17`

### Evidence status at a glance

| Checked / verified | Not checked / unresolved |
|---|---|
| Read-only review of selected source manifests, lockfiles, architecture/deployment docs, and workflow files | Runtime reachability, exploitability, penetration testing, or actual OpenBot execution |
| OSV-Scanner v2.7.1 source scan at the image's embedded commit-like reference; Trivy v0.76.2 remote scan of the immutable image digest | Trusted builder identity, build workflow/run, and cryptographic source-to-image provenance for the backend image |
| Cosign signature verified against upstream `docs/cosign.pub` (transparency-log verification bypassed); OCI SPDX attestation subject/blob digest checked | Complete application/runtime dependency SBOM for the backend image; the attached SPDX records OS packages only |
| Debian tracker checks for selected image package findings; image config reports non-root user and no detected secrets | Full license assessment, complete Python environment audit, and remediation validation |
| Cost-plan documentation reviewed | Actual model-provider, connector, hosting, or total operating costs |

## Evidence

### Source dependency findings

The initial targeted lockfile review found `proxy-addr@2.0.7` in `bun.lock` (advisory says versions below `2.0.8` are affected) and Rust `zip@2.4.2` in `desktop/src-tauri/Cargo.lock` (RUSTSEC-2026-0369 reports versions below `9.0.0` as affected). Presence in a lockfile does not establish image inclusion or reachability; the Rust finding is scoped to the optional desktop build.

A subsequent OSV-Scanner v2.7.1 scan at `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3` reported **275 lockfile-backed package/advisory rows**, **84 unique PURLs**, and **190 raw advisory IDs** across 31 lockfile groups. The root `bun.lock` accounted for 133 rows and 117 distinct advisory IDs. Additional manifest-derived Python results were kept separate because requirements files do not provide fully resolved environments. These are scanner matches, not unique exploitable defects or evidence that all workspaces ship in the backend image.

### Backend image findings

Trivy v0.76.2 scanned the immutable GHCR image remotely for Linux/amd64: **207 match rows / 95 unique advisory IDs** (48 High, 90 Medium, 64 Low, 5 Unknown; no Critical matches in that database snapshot). Debian tracker review confirmed vulnerable package-version matches for selected packages including util-linux, SQLite, ACL, systemd, ncurses, and Perl. Application reachability was not established. The image config identifies user `openbot:openbot` (non-root); the config scan found no secrets and one Low finding for missing HEALTHCHECK.

Cosign v3.1.4 verified the image digest against the upstream public key, but used `--insecure-ignore-tlog=true`; this verifies the signature against the supplied key, not transparency-log inclusion or the build process. An OCI SPDX 2.3 attestation is present and digest-checked, but it contains Debian OS package records and does not provide an application dependency SBOM or SLSA build provenance.

### Security posture and operating boundaries

The reviewed upstream docs describe a permissive computer-action default unless replaced by an explicit policy; dry-run records decisions but does not enforce them. Shared computer instances are not tenant-isolation boundaries, and the supervisor requires Docker socket access. Approval cards are not a complete authorization boundary.

Any future isolated test must use synthetic/read-only data, loopback-only access, disposable credentials, deny-by-default computer policy, and network allowlisting. Do not expose broker/trading operations, NOVA production secrets, unrestricted MCP, public ingress, or production data.

### Cost and platform caveat

The reviewed pricing/docs describe a free Developer tier with quotas, while self-hosted Intelligence is listed under paid Team self-hosted or Enterprise plans. Model-provider and optional integration charges are separate and were not measured. Therefore zero total cost is **not verified**.

## Upstream evidence required

Before reconsidering runtime use, request the actual backend image builder repository/workflow and immutable run identity; exact build source, Dockerfile/context and parameters; verifiable provenance bound to the audited digest; and a production application SBOM tied to that digest. The detailed findings and evidence request are in [the backend publisher follow-up](COPILOTKIT-OPENBOT-BACKEND-PUBLISHER-FOLLOWUP.md) and [the draft maintainer request](OPENBOT-UPSTREAM-PROVENANCE-EVIDENCE-REQUEST.md). The request has not been sent.

## Final recommendation and gates

**NO-GO remains for NOVA runtime integration.** Do not install or deploy the image based on this audit alone. Reconsider only after:

1. Upstream supplies and the reviewer verifies digest-bound build provenance and the backend builder identity.
2. The image has a complete application/runtime SBOM, and OS and source dependency findings have been triaged/remediated for the intended deployment.
3. Explicit deny-by-default controls and isolation are tested negatively in a disposable environment.
4. Provider entitlements, quotas, and hard spending limits are confirmed before any model calls.

No OpenBot runtime was installed or executed. No dependency was modified, no external request was sent, and no NOVA production resource or configuration was changed.

## Source references

- [OpenBot repository](https://github.com/CopilotKit/OpenBot)
- [OpenBot architecture](https://github.com/CopilotKit/OpenBot/blob/main/docs/architecture.md), [approvals](https://github.com/CopilotKit/OpenBot/blob/main/docs/approvals.md), [configuration](https://github.com/CopilotKit/OpenBot/blob/main/docs/configuration.md), [deployment](https://github.com/CopilotKit/OpenBot/blob/main/docs/deployment.md)
- [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [RUSTSEC-2026-0369](https://rustsec.org/advisories/RUSTSEC-2026-0369)
- Debian Security Tracker: [util-linux](https://security-tracker.debian.org/tracker/source-package/util-linux), [sqlite3](https://security-tracker.debian.org/tracker/source-package/sqlite3), [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642), [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408), [CVE-2026-119373](https://security-tracker.debian.org/tracker/CVE-2026-119373), [CVE-2026-54369](https://security-tracker.debian.org/tracker/CVE-2026-54369), [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742), [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720), [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)
- [CopilotKit pricing](https://www.copilotkit.ai/pricing), [Intelligence overview](https://docs.copilotkit.ai/agent-spec/intelligence/overview), [local self-hosting guide](https://docs.copilotkit.ai/intelligence/self-hosting-local)
