# OpenBot backend image publisher follow-up

> **Internal research follow-up — not production policy or a security certification.** This document focuses on backend image publishing/provenance; the broader security and dependency findings are summarized in [the main assessment](COPILOTKIT-OPENBOT-SECURITY-ASSESSMENT.md). Its status applies to this OpenBot image evaluation only and is not a NOVA-wide release decision.

## Snapshot and evidence checklist

- **Reviewed:** 2026-11-16 UTC
- **Audited image:** `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- **OCI index digest:** `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- **Linux/amd64 manifest:** `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`
- **Historical OpenBot checkout inspected:** `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`

| Checked / verified | Not verified / incomplete |
|---|---|
| Historical and later OpenBot image workflow files inspected | Actual backend image builder repository/workflow and immutable run identity |
| Signature checked against upstream public key; OCI SPDX attestation subject/blob digests checked | SLSA/in-toto build provenance for this backend digest |
| Image SBOM attests to Debian package inventory | Application dependency SBOM and source-to-image mapping |
| Public repository searches performed | Whether a private, unindexed, or external builder exists |

## Findings

### What the inspected OpenBot workflow does

At commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`, `.github/workflows/images.yml` has a `backend-images` job that inspects existing GHCR tags, validates platform descriptors, and records image digests. It authenticates with `packages: read`; it does not build or push the backend images. `internal-build.yml` passes a backend tag (default `main`) to this reusable workflow, and `publish-release.yml` also calls it without independently building the backend server image.

The separate `component-images` matrix builds the 13 images in `.github/published-images.json` with BuildKit provenance/SBOM options. `component-manifests` attests those component-image manifests. That workflow evidence does not establish provenance for `openbot-server`.

A later public checkout (`e52146a8aac708cca3065ef0b8eb3304bc06b7a8`) still treats backend images as pre-published. It uses a shared `ghcr.io/copilotkit/openbot:main` image for server/computer commands; this later packaging change does not establish provenance for the audited older digest.

### Source mapping and bounded discovery

The audited image contains a commit-like string `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`, but the matching OpenBot checkout has no `server/` source directory, server Dockerfile, or root Dockerfile for building `openbot-server`. Its Compose configuration describes the server image as pulled rather than built there. Treat the embedded value as metadata only; a source-to-binary relationship has not been demonstrated.

Read-only public repository/code searches did not identify a clear separate public CopilotKit builder repository. This is a bounded search result, not proof that no builder exists: the publisher may use a private/unindexed repository or an external CI system.

### Signature, SBOM, and provenance status

- **Cosign signature:** verified against `docs/cosign.pub` from the inspected checkout for the exact image index digest. Verification used `--insecure-ignore-tlog=true`, so transparency-log inclusion was not checked.
- **OCI SPDX SBOM:** present; its subject is the Linux/amd64 manifest digest and the SBOM blob digest was verified. It records Debian OS packages (80 package PURLs), not application dependencies.
- **SLSA/in-toto build provenance:** NOT VERIFIED. The OpenBot workflow's component-image attestations do not apply to this backend image. A signature and SBOM are not substitutes for source/build provenance.
- **Documentation discrepancy:** `docs/releasing.md` broadly describes provenance alongside published images, while the inspected workflow only attests the component images it builds. The backend job consumes/pins existing images. Maintainer clarification is needed.

## Required upstream evidence

Request the following for the exact digest:

1. Builder repository, workflow path, immutable run URL/ID, and builder identity.
2. Source repository and exact commit, Dockerfile path, build context, and build parameters.
3. Verifiable in-toto/SLSA provenance whose subject matches the audited OCI index or platform manifest.
4. Application/runtime SBOM tied to the same digest, plus the dependency lockfile/build input reference.
5. Rebuild and vulnerability patch/promotion policy for backend images.

The ready-to-send request is drafted in [OPENBOT-UPSTREAM-PROVENANCE-EVIDENCE-REQUEST.md](OPENBOT-UPSTREAM-PROVENANCE-EVIDENCE-REQUEST.md); it has **not** been sent and no upstream issue has been opened.

## Status and safety boundary

| Item | Status |
|---|---|
| Historical and later backend workflow review | DONE |
| Public search for a clear builder repository | DONE — no public builder identified in this bounded search |
| Exact backend builder identity | NOT IDENTIFIED |
| Exact digest SLSA provenance | NOT VERIFIED |
| Application dependency SBOM | INCOMPLETE |
| OpenBot runtime evaluation | NOT APPROVED pending evidence and separate formal approval |
| NOVA-wide release readiness | OUT OF SCOPE |

No OpenBot container was started, no executable was run, no secrets or billing accounts were accessed, and no NOVA production resource was changed.

## Upstream source references

- [Historical image workflow](https://github.com/CopilotKit/OpenBot/blob/7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3/.github/workflows/images.yml)
- [Historical backend tag](https://github.com/CopilotKit/OpenBot/blob/7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3/backend-images.env)
- [Later image workflow](https://github.com/CopilotKit/OpenBot/blob/e52146a8aac708cca3065ef0b8eb3304bc06b7a8/.github/workflows/images.yml)
- [Later Compose configuration](https://github.com/CopilotKit/OpenBot/blob/e52146a8aac708cca3065ef0b8eb3304bc06b7a8/docker-compose.yml)
