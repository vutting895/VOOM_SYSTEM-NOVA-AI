# Upstream evidence request — OpenBot backend image provenance

> **Internal draft for review only — not production policy, not sent, and not an opened issue.** Do not contact the upstream maintainers without explicit approval.

## Snapshot and evidence checklist

- **Draft prepared:** 2026-11-16 UTC
- **Upstream source workflow checked:** OpenBot commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`
- **Audited image:** `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- **OCI index digest:** `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- **Linux/amd64 manifest digest:** `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`

| Checked | Not verified / pending |
|---|---|
| OpenBot workflow reviewed; backend job appears to inspect/pin existing images | Builder repository and immutable workflow/run identity |
| Image signature and OS-package SPDX attestation checked, with limitations | Digest-bound SLSA provenance and application dependency SBOM |
| Request text drafted | Maintainer contact, issue creation, and any external action (explicit approval required) |

## Ready-to-send request

Hello CopilotKit maintainers,

We are conducting a security and supply-chain review of the OpenBot backend image below before considering any isolated evaluation:

- Image: `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- OCI index digest: `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Linux/amd64 manifest digest: `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`

In the public OpenBot source workflow at commit `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`, the backend image job appears to inspect and pin pre-published backend images, while build/provenance steps apply to a separate component-image workflow. We may be missing the backend image publishing repository or workflow.

Could you please provide or clarify:

1. **Builder identity:** Which repository and workflow build and publish the exact `openbot-server:main-20261114-78` image?
2. **Immutable run:** The GitHub Actions run URL/ID (or equivalent external build record) and builder identity for this exact digest.
3. **Source mapping:** The exact source repository and commit, Dockerfile path, build context, and relevant build parameters used for this image.
4. **Verifiable provenance:** An in-toto/SLSA provenance statement whose subject digest matches the OCI index digest above or the Linux/amd64 manifest digest above, including the builder and source materials.
5. **Application SBOM:** A machine-readable SBOM covering application/runtime dependencies (not only the base OS packages), tied to the same immutable image digest.
6. **Rebuild and patch policy:** How backend image tags are promoted, how base-image and application vulnerabilities are patched, and whether immutable digests are published for each release.

If the image is built in a private repository or external CI system, a signed provenance statement and the corresponding source/build metadata would be sufficient; access to private source code is not required for this request.

Thank you.

## Evidence acceptance checklist

Do not mark provenance verified until all applicable items are received and validated:

- [ ] Builder identity is attributable to the publisher.
- [ ] Workflow/run identity is immutable and independently inspectable.
- [ ] Provenance subject digest exactly matches the audited index or platform manifest.
- [ ] Provenance materials identify the source repository and exact commit.
- [ ] Dockerfile/build context are identified and consistent with the provenance.
- [ ] Application SBOM is tied to the same image digest.
- [ ] Signature and provenance verification succeed using documented trust roots.
- [ ] Any missing fields or unverifiable claims are recorded as limitations.

## Decision rule

A response that only names a repository, points to a mutable tag, supplies an SBOM without digest binding, or provides a signature without source/build provenance is **not sufficient** to close the source-to-image gap.

Until the evidence is validated, retain **NO-GO for NOVA Runtime integration**. This request does not authorize running containers, connecting credentials, granting access, creating external resources, or changing production.
