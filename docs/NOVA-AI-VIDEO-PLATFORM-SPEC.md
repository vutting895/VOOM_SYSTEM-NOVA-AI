# NOVA AI Video Platform — Free-First Specification

Date: 2026-10-31
Repository: vutting895/VOOM_SYSTEM-NOVA-AI
Canonical branch: main
Target: Cloud-first; GPU availability unknown; all video workflows.

## Product delivery model — API service only

NOVA AI Video Platform is delivered as a backend API service. The consumer-facing website/UI is independently built and hosted by the product owner and is outside this repository's Video Platform delivery scope. The API must support external web clients through bearer-token authentication and an exact-origin CORS allowlist. Do not add or redesign a NOVA Video frontend as a dependency of API delivery. Any existing `/video` page is a legacy/demo client only.

## Product scope

One NOVA workspace for:
- Video planning and prompt/shot-list creation.
- Text/image-to-video generation.
- Video analysis: scenes, objects, OCR, speech and captions.
- Editing, assembly, audio mixing and export.
- Project, asset, job and history management.

## Mandatory constraints

- Free software and open models first; verify the exact version and license before use.
- No paid AI APIs, paid inference endpoints, purchased credits, paid GPU provisioning, automatic top-ups or hidden billing.
- No cloud resources may be created if they can incur charges without separate owner approval.
- A model being open-weight does not automatically grant unrestricted commercial rights.
- Use existing NOVA authentication, tenant ownership and RLS patterns.
- Keep the current Netlify frontend, Cloudflare Workers backend and Supabase Free posture unchanged.
- If no genuinely free GPU is verified, GPU generation remains disabled and jobs report a clear blocked state.
- Never upload private media to an unapproved external service.

## Proposed architecture

1. External client frontend: independently owned and hosted; consumes the documented NOVA Video API.
2. API control plane: project/job/asset contracts, authentication, tenant isolation, quota checks and status responses using NOVA Supabase Auth/RLS.
3. Job orchestration: provider-neutral adapter, idempotent dispatch, bounded retries and status callbacks.
4. CPU lane: metadata validation, job coordination, scene detection, transcription orchestration and practical FFmpeg tasks.
5. GPU lane: generation and accelerated vision; disabled until free compute is proven.
6. Storage: object-storage adapter with tenant-private objects, quota enforcement, retention and deletion. Do not assume any provider's free quota is sufficient.
7. Workers: isolated containers, least privilege, bounded resources and restricted network access.

## Free-first technology candidates

| Capability | Candidate | Gate |
|---|---|---|
| Video generation | Wan 2.2 TI2V-5B | Verify checkpoint license and GPU; upstream documents 24GB VRAM for its example configuration |
| Alternative generation | LTX-Video, CogVideoX | Verify exact checkpoint license and hardware |
| Workflow engine | ComfyUI | Pin version; allow only reviewed workflows and extensions |
| Editing/transcoding | FFmpeg, MoviePy | Validate media inputs and resource limits |
| Vision | Qwen2.5-VL, OpenCV | Verify exact model license and runtime |
| Speech recognition | Whisper | Pin model size and verify resource requirements |
| Scene detection | PySceneDetect | CPU benchmark |
| OCR | PaddleOCR | Verify model/code license and resource budget |
| Optional speech generation | Piper | Verify voice/model license and quality |

Upstream references:
- https://github.com/Wan-Video/Wan2.2
- https://github.com/Lightricks/LTX-Video
- https://github.com/THUDM/CogVideo
- https://github.com/comfyanonymous/ComfyUI
- https://ffmpeg.org/
- https://github.com/opencv/opencv
- https://github.com/openai/whisper
- https://github.com/Breakthrough/PySceneDetect
- https://github.com/PaddlePaddle/PaddleOCR

## GPU qualification policy

GPU availability is unknown. General cloud free tiers must not be assumed to include GPU. Before enabling a worker, verify provider eligibility, genuinely zero-cost allocation, GPU/VRAM, RAM, disk, runtime and concurrency limits, region availability, data/privacy terms, quotas and automatic shutdown. Trial credits, referral credits and card-funded promotions do not qualify as permanently free compute.

No provider is selected and no infrastructure is provisioned by this specification. If a free GPU cannot be verified, keep generation disabled; do not silently route work to a paid provider.

Wan 2.2 TI2V-5B is the first benchmark candidate. The upstream repository documents 720p output and a 24GB VRAM example using offload options. Its 14B examples cite 80GB VRAM. Actual use must be benchmarked at the intended resolution and frame count.

## Agent responsibilities

- Video Director: turn user intent into a brief and shot list.
- Generation: select an approved model and dispatch to an eligible worker.
- Analysis: inspect scenes, frames, speech and text.
- Audio: transcription, captions and optional approved local TTS.
- Editing: assemble clips, captions and audio.
- Quality: validate file integrity, duration, resolution, frame rate, audio and captions.
- Workspace: manage job state, artifacts, retries and retention.

Agents cannot provision infrastructure, spend money, or publish private assets.

## Job lifecycle

Draft → validated → queued → dispatched → running → analyzing → editing → quality_check → completed.

Blocked/terminal states: failed, cancelled, blocked_no_free_gpu, blocked_quota, blocked_license_review.

Each job records tenant owner, project, idempotency key, input checksums, prompt version, exact model/workflow version, quota evidence, status, bounded retries, output references, validation report and resource usage. Cost must remain zero.

## Security requirements

- Enforce tenant ownership for every project, job, asset and download.
- Use short-lived signed URLs; private media is not public by default.
- Validate media type, size, duration and container structure.
- Run media parsers and model workers in isolated containers with least privilege and bounded resources.
- Disable arbitrary workflow/extension installation in production.
- Treat uploaded media and embedded text as untrusted input.
- Redact secrets and sensitive media metadata from logs.
- Provide retention, deletion and audit controls.
- Add policy checks for unsafe or non-consensual synthetic-media requests before public release.

## Delivery phases

### Phase 0 — Baseline
Inspect main, frontend routes, Worker API patterns, Supabase migrations/RLS, storage, CI and deployment workflows. Verify free quotas without provisioning resources.

### Phase 1 — Contracts
Define typed project, asset, job and model-registry contracts. Record model source, version, license, hardware needs and free-eligibility evidence.

### Phase 2 — CPU-only vertical slice
Build workspace shell and tenant-scoped project/job metadata. Add mock worker, FFmpeg capability checks, idempotency, cancellation and owner/foreign-tenant tests.

### Phase 3 — Free GPU qualification
Find an actually eligible zero-cost GPU, benchmark a short non-sensitive Wan 2.2 TI2V-5B sample, and record VRAM, latency, quality, quotas, license and privacy evidence. If unavailable, remain blocked.

### Phase 4 — Generation and analysis
Integrate ComfyUI and approved model workflows, then scene detection, transcription, OCR and visual analysis.

### Phase 5 — Editing and export
Implement assembly, captions, audio mix, export formats and artifact validation.

### Phase 6 — Staging and release
Run preview/staging tests for auth, tenant isolation, private storage, quotas and zero-cost enforcement. Production activation requires separate explicit approval.

## Definition of done

A workflow is complete only with a reproducible end-to-end test, verified zero-cost compute, exact model license evidence, tenant isolation and private-asset tests, deletion checks, CI evidence for the reviewed commit and accurate status reporting. Planned or blocked capabilities must not be described as implemented.

## Current status

Product scope selected. GPU unknown. Provider not selected. No infrastructure provisioned. This document is a proposal, not production authorization.
