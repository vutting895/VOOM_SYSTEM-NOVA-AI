# OpenBot Security Review — Executive Brief

> **Internal research summary only. This is not production policy, a security certification, a NOVA-wide release decision, or approval to deploy.** It condenses the detailed [security assessment](COPILOTKIT-OPENBOT-SECURITY-ASSESSMENT.md); consult that report for evidence, scope, limitations, and sources.

## Preliminary recommendation — OpenBot evaluation only

**Do not proceed with OpenBot runtime installation or NOVA integration based on the evidence currently available.** This is a preliminary recommendation about this OpenBot evaluation only, pending upstream evidence and separate formal platform/security approval. It does not assess or resolve NOVA's other release blockers and is not a NOVA-wide release decision.

## What was reviewed

- Selected OpenBot source manifests, lockfiles, architecture/deployment documentation, and image workflow configuration.
- Source dependency advisories using OSV-Scanner and the selected immutable backend image using remote Trivy scanning.
- The image signature against the upstream public key and its OCI SPDX SBOM attestation.
- Selected Debian package advisory status and public pricing/licensing documentation.

## Key findings

- Source scans reported affected dependency versions, and the image scan reported Debian OS package advisory matches. These findings do not by themselves prove runtime reachability or exploitability.
- The image signature verified against the supplied upstream key, with transparency-log verification bypassed. The attached SPDX attestation covers OS packages, not application dependencies.
- The backend image's trusted builder identity, digest-bound build provenance, and complete application dependency SBOM remain **unverified or incomplete**. The inspected OpenBot checkout does not contain the backend server build source/context.
- The reviewed docs describe permissive computer-action defaults unless operators override them; dry-run is not enforcement, and shared computer instances are not tenant-isolation boundaries.
- A zero-total-cost operating model has not been established; model-provider and optional integration costs are separate and unassessed.

## Evidence snapshot

- Image: `ghcr.io/copilotkit/openbot-server:main-20261114-78`
- OCI index digest: `sha256:13ba8a1d8b123af597742a0d1f9ee8d2a9de1d7f676240a1d167b8ba9f0a26aa`
- Linux/amd64 manifest digest: `sha256:249fcc737b98e6bb15cb43f1bdfcd0ccd5b265e324b78bca6d6706ad9c98a90c`
- Image scan: Trivy v0.76.2; 207 match rows / 95 unique advisory IDs, with no Critical matches in that database snapshot.
- Source scan: OSV-Scanner v2.7.1 at the referenced checkout; see the detailed assessment for counts and coverage qualifications.

## Conditions before reconsidering this OpenBot evaluation

1. Verify trusted builder identity and in-toto/SLSA provenance bound to the exact image digest.
2. Obtain a complete application/runtime SBOM for that digest and map dependencies to the actual build inputs.
3. Triage and remediate applicable dependency and OS findings for the intended deployment.
4. Test deny-by-default computer policy, isolation, and network restrictions in a disposable environment.
5. Confirm entitlements, quotas, and provider-side spending limits before enabling model calls.
6. Obtain separate formal platform/security approval before any OpenBot runtime integration or deployment.

Other NOVA release blockers (CI evidence, dataset completeness, risk-policy approval, hosting, database migration/restore, and MT5 runtime validation) are outside this OpenBot audit and must be tracked and cleared independently. This document does not mark them resolved or authorize NOVA release.

No OpenBot runtime was installed or executed, no upstream request was sent, and no NOVA production resource or configuration was changed.
