# CopilotKit OpenBot — NOVA Security & Dependency Audit

> **Historical lockfile note:** This report is a snapshot of the exact tree and dependency files reviewed during 2026-11-15 to 2026-11-16. On the NOVA Bun-to-npm migration branch, the root `bun.lock` is replaced by `package-lock.json`; references and counts for `bun.lock` below remain historical evidence and must not be interpreted as the current npm dependency audit.

> **Internal research artifact — not production policy, a security certification, a NOVA-wide release decision, or authorization to deploy.** Findings are limited to the evidence and versions listed below. Runtime reachability and exploitability were not tested.

## Executive summary

**Preliminary recommendation for this OpenBot evaluation only: do not proceed with runtime installation or NOVA integration on the current evidence.** Any reconsideration requires upstream supply-chain evidence and separate formal platform/security approval. This report does not assess or resolve unrelated NOVA release blockers.

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
