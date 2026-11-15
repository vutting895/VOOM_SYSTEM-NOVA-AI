# OpenBot backend image publisher follow-up

**Audit date:** 2026-11-16 UTC  
**NOVA repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Branch:** `experiment/copilotkit-openbot-security-audit`  
**NOVA main SHA checked before this write:** `02480d48c421dab573ac976be6d90d9efb46fa17`  
**Upstream OpenBot source commit used for the audited image:** `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3`  
**Audited image:** `ghcr.io/copilotkit/openbot-server:main-20261114-78`  
**Audited OCI index digest:** `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`

## 1. Historical workflow at the audited image's embedded commit

The exact `7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3` version of `.github/workflows/images.yml` has a `backend-images` job that inspects and pins existing registry images. It includes `ghcr.io/copilotkit/openbot-server`, `openbot-agent-computer`, `openbot-supervisor`, and the all-in-one `openbot` image. It checks manifest digests and platform coverage; it does not build or push those backend images.

The same workflow separately builds the component images listed in `.github/published-images.json` and applies BuildKit provenance/SBOM options and GitHub build-provenance attestations to those component images. Those attestations cannot be attributed to the separately pre-published `openbot-server` digest.

At that exact source commit, `backend-images.env` sets `OPENBOT_BACKEND_TAG=main`. The release/internal-build workflow passes this tag to the reusable image workflow. This is evidence that the checked-out OpenBot repo consumes an existing backend image, not evidence of which workflow created it.

## 2. Current upstream workflow cross-check

A later public OpenBot commit, `e52146a8aac708cca3065ef0b8eb3304bc06b7a8`, was also inspected to detect an architectural rename or changed publisher path.

The current workflow comments explicitly say the server/computer/supervisor images are the already-published OpenBot images at a selected backend tag. The backend job still authenticates with `packages: read`, inspects the existing image tags, validates platform descriptors, and records digests. The provenance and SBOM steps remain under the separate component image build jobs.

The later checkout's `backend-images.env` now points to `ghcr.io/copilotkit/openbot:main`; the Compose configuration describes the server and computer as commands running from this shared image. This is a later naming/packaging evolution. It does not retroactively establish provenance for the older `openbot-server:main-20261114-78` digest audited above.

Relevant upstream evidence:
- Historical backend image workflow at the audited source commit: https://github.com/CopilotKit/OpenBot/blob/7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3/.github/workflows/images.yml
- Historical backend tag: https://github.com/CopilotKit/OpenBot/blob/7d1d96c0a38f9b46a2f73179fb00b3bd34f4b2f3/backend-images.env
- Later backend image workflow: https://github.com/CopilotKit/OpenBot/blob/e52146a8aac708cca3065ef0b8eb3304bc06b7a8/.github/workflows/images.yml
- Later Compose configuration: https://github.com/CopilotKit/OpenBot/blob/e52146a8aac708cca3065ef0b8eb3304bc06b7a8/docker-compose.yml
- Later backend tag: https://github.com/CopilotKit/OpenBot/blob/e52146a8aac708cca3065ef0b8eb3304bc06b7a8/backend-images.env

## 3. Public repository discovery

Read-only GitHub searches were performed for repositories and code matching:
- `openbot-server` within the CopilotKit organization;
- `openbot backend` within the CopilotKit organization;
- the exact image name `ghcr.io/copilotkit/openbot-server`;
- `openbot-server Dockerfile` and backend tag references.

No separate public CopilotKit repository clearly identifiable as the server image builder was returned by the organization repository searches. Global code results did not establish a trusted build repository or workflow for the exact audited digest.

This is a bounded search result, **not proof that no builder exists**. The image may be built in a private repository, an unindexed repository, an external build system, or a workflow not discoverable through the public search surface.

## 4. Corrected conclusion

- The audited OpenBot repository commit consumes/pins a pre-published backend image.
- The later OpenBot workflow continues to consume/pin pre-published backend images; it does not show a build of the backend image in that workflow.
- The component image provenance workflow is not provenance for the backend image.
- The actual builder repository, Dockerfile/build context, workflow run ID, and source-to-image relationship for `sha256:13ba8a1d...` remain **NOT IDENTIFIED / NOT VERIFIED**.
- The embedded commit-like string remains metadata only; it is not sufficient to prove source-to-binary mapping.
- The image's verified Cosign signature and OCI SPDX SBOM remain valid evidence within their previously stated limitations, but neither substitutes for SLSA build provenance.

## 5. Required upstream evidence request

Ask the CopilotKit image maintainer to provide:
1. The repository and workflow path that built and pushed `openbot-server:main-20261114-78`.
2. The immutable workflow run URL/run ID and builder identity.
3. The exact source commit, Dockerfile, build context, and build parameters.
4. A verifiable in-toto/SLSA provenance statement whose subject digest matches the audited OCI index or platform manifest.
5. A production application dependency SBOM tied to the same image digest.

Do not open an upstream issue or send a message without explicit approval.

## 6. Status and safety boundary

| Item | Status |
|---|---|
| Historical OpenBot backend workflow inspected | DONE |
| Later upstream workflow cross-check | DONE |
| Public builder-repository search | DONE — no clear public builder identified |
| Exact backend builder identity | BLOCKED — not identified |
| Exact digest SLSA provenance | NOT VERIFIED |
| Application dependency SBOM | INCOMPLETE |
| NOVA Runtime integration | NO-GO |

No OpenBot container was started, no executable was run, no secrets or billing accounts were accessed, and no NOVA Production resource was changed. This follow-up is documentation-only on the existing audit branch; no PR or merge was created.
