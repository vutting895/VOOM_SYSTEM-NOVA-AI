# NOVA AI Video Skill Registry

Date: 2026-10-31  
Delivery: API-only; the consumer frontend is hosted separately.  
Policy: free-only; execution remains disabled by default.

The machine-readable registry is `docs/NOVA-VIDEO-SKILL-REGISTRY.yaml`.

## Capability inventory

| Group | Skills | Current state |
|---|---|---|
| Generation | Text-to-Video, Image-to-Video, Video-to-Video, Storyboard Generation | Rendering blocked; storyboard is research only |
| Analysis | Scene Detection, Object Detection, Action Recognition, OCR, Speech-to-Text, Subtitles, Video Summary, Video Q&A | Research candidates only; no NOVA inference is enabled |
| Editing | Auto Cut, Smart Highlight, Audio/Video Sync, Background Removal, Resolution Enhancement, Export Validation | Research/planned; no media processing is enabled |
| Production | Script-to-Video Planning, Voice-over, Multilingual Subtitles, Social Formatting | Research/planned; no media processing is enabled |

## What the status means

- `planned`: identified as a product capability, not implemented.
- `research`: candidate tools identified; no production-ready integration claim.
- `blocked_no_free_compute`: no qualifying zero-cost compute has been verified.
- `blocked_license_review`: exact model/checkpoint/voice license and usage rights remain unverified.
- `blocked_runtime`: required runtime or worker is not available.
- `implemented_metadata_only`: API records a request but does not execute the skill.
- `staging_verified`: reproducible staging test passed on a reviewed commit.
- `production_enabled`: only after explicit owner approval and release evidence.

## Free-only qualification gates

A candidate may be promoted only after recording all of the following:

1. Exact repository, model/checkpoint, version and immutable revision.
2. License for code, weights, tokenizer, datasets and voice assets; commercial-use and redistribution restrictions.
3. Provider and account eligibility proving compute is genuinely zero-cost (not a trial, promotional credit or card-backed offer).
4. GPU/VRAM or CPU/RAM/disk requirements, duration/resolution limits, concurrency and quotas.
5. Privacy, retention, region, network-egress and data-processing terms.
6. Reproducible benchmark, quality result, runtime logs and zero-cost evidence.
7. Tenant isolation, private asset handling, deletion and abuse/safety tests.

No engine listed in the registry is approved merely by being listed. In particular, Wan 2.2 TI2V-5B is a benchmark candidate, not an enabled service. The upstream example configuration has significant VRAM requirements; unknown GPU availability is a hard blocker.

## API mapping

The current API job types are coarse-grained:

- `video_generation`: generation family; remains `blocked_no_free_gpu`.
- `video_analysis`: analysis family; remains `blocked_worker_unavailable`.
- `video_edit_export`: editing/export family; remains `blocked_worker_unavailable`.

The registry is exposed through the authenticated, read-only `GET /api/video/skills` endpoint. It returns registry version, groups, skill IDs, candidate engines, compute lanes and readiness status. Every entry explicitly reports `executionEnabled: false` and `estimatedCost: 0`; listing a skill does not make it executable.

## Current release boundary

No media upload, private object storage, worker dispatch, model inference, GPU execution, video generation, analysis, editing or export is enabled by this registry. No paid resource may be created. Production activation requires separate explicit approval.

Related:
- `docs/NOVA-AI-VIDEO-PLATFORM-SPEC.md`
- `docs/NOVA-VIDEO-API-INTEGRATION.md`
- `docs/openapi/nova-video-api.yaml`
- Acceptance tracker: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/169
