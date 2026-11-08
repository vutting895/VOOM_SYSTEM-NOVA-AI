# NOVA-owned Video Engine Core

This package introduces NOVA's own orchestration and media-composition core. It is separate from the NOVA Video API Worker: the Worker remains the authenticated control plane, while this package is the execution-engine boundary.

## What NOVA owns

- Brief validation and normalization.
- Deterministic storyboard and timeline planning.
- Scene ordering, duration allocation and aspect-ratio constraints.
- Render lifecycle and fail-closed execution policy.
- A renderer adapter contract, with an optional local FFmpeg still-image compositor.
- A provider registry with explicit commercial-license, zero-cost and review-status gates; no provider is silently selected.

## Current implementation

| Capability | State |
|---|---|
| Brief and storyboard planner | Implemented (deterministic CPU logic) |
| NOVA Director Intelligence | Implemented: beat selection, shot framing, camera, lighting, continuity and frame-accurate timeline |
| Production pipeline planner | Implemented: approval gate, per-scene generation tasks, assembly, QC and delivery dependencies |
| Authenticated-service integration surface | Implemented as a framework-neutral tenant-scoped service for plan/create/list/get/prepare/cancel; it records metadata only and does not invoke AI or dispatch jobs |
| Tenant-scoped job lifecycle | Implemented with in-memory and local append-only journal stores, artifact persistence, idempotency conflict detection, approval transition, retry limit and tenant checks |
| Local durable job journal | Implemented: append-only JSONL, fsync per event, startup replay, idempotency recovery, tenant isolation and a single-writer lock; local development only |
| Video quality control | Implemented: timeline integrity, clip metadata, dimensions, continuity and safe asset paths |
| NOVA model specialization governance | Implemented: dataset provenance, rights, commercial-use permission, privacy review and explicit consent scopes; adaptation remains planning-only |
| Render orchestration and state machine | Implemented |
| FFmpeg still-image-to-MP4 compositor | Implemented as an optional local adapter |
| Multi-clip media assembler | Implemented: concatenates validated generated MP4 scenes, mixes voice/music, adds SRT soft subtitles and re-probes final output; disabled until execution and human approval |
| Provider adapter registry | Implemented; default provider set is empty and all candidates fail closed until evidence is approved |
| Generative Video orchestration | Implemented as a fail-closed Wan 2.2 task adapter contract with output validation |
| Wan 2.2 local runtime adapter | Research prototype only; direct argv, workspace path validation, pre-spawn symlink checks, FFprobe verification, pinned revision and checkpoint gates; now checks at least 24,000 MiB FREE VRAM on one GPU; process isolation is not implemented and execution remains disabled |
| Text-to-video / image-to-video model inference | Not executed; local adapter exists but Wan 2.2 TI2V-5B remains research-only pending compute and review |
| AI scriptwriting / generative storyboard model | Script Intelligence orchestration + structured output validation implemented; actual model inference blocked until provider approval |
| Voice/music mix and SRT soft subtitles | Local assembly lane implemented; no speech synthesis or music generation model connected |
| Video analysis / editing / transcoding pipeline | Not implemented |
| Distributed durable queue, worker dispatch and private asset storage | Not implemented; local journal is single-writer and not a shared cloud queue |
| Supabase production schema / migration | Not included in this package |

The Wan 2.2 adapter is a research-only local prototype. Its preflight now requires an actual NVIDIA `nvidia-smi` report of at least 24,000 MiB of FREE VRAM on one GPU (not merely total installed VRAM), alongside explicit execution, model-license, security, zero-cost-compute, pinned 40-character upstream revision and checkpoint-integrity gates. It never downloads model weights. The adapter inspects the produced MP4 with FFprobe before accepting it. It is not connected to the Cloudflare Worker. `media-assembler.mjs` combines validated scene MP4s, optional voice-over and music tracks, and optional soft subtitles in MP4. It re-probes source and final media metadata and is disabled without explicit execution and human-approval gates. It does not synthesize speech or music. The FFmpeg slideshow adapter creates a silent MP4 from still images. These are composition paths, not generative motion. It requires a locally installed FFmpeg binary and local workspace images; it is not enabled in the Cloudflare Worker.

## Safety defaults

- Rendering is disabled unless an engine instance is explicitly constructed with executionEnabled: true.
- Even with execution enabled, rendering is blocked unless a renderer is explicitly injected.
- The current API and production rollout remain metadata-only.
- This package does not call paid APIs, download models, start GPU workloads, upload media, or create cloud resources.
- FFmpeg is launched with an argument array (never a shell command); all media paths must remain within the configured workspace.
- The renderer currently emits silent MP4 output. It does not claim AI-generated motion.

## Run tests

    node --test integrations/nova-video-engine/engine.test.mjs

## Next engine milestones

1. Review and register a model provider only after independent license, commercial-use and zero-cost compute evidence.
2. Add an end-to-end FFmpeg acceptance fixture with real generated scene clips, audio and SRT inputs, then inspect output on a pinned FFmpeg build.
3. Replace local single-writer journal with a shared distributed queue after two-tenant staging isolation and idempotency/CAS review.
4. Add encrypted tenant-private object storage, signed delivery, retention and deletion only after backup/restore acceptance.
5. Benchmark candidate open models and compute against verified zero-cost eligibility; otherwise keep generative tasks blocked.
6. Prove two-user staging isolation before connecting execution to the production API.

## NOVA Director and production pipeline

`director-intelligence.mjs` is NOVA-owned planning logic: it chooses narrative beats, camera framing/movement, lighting, transitions and continuity constraints, and allocates scenes on a 24 FPS frame timeline. It is deterministic decision logic, not a trained foundation model or an external LLM call. `pipeline-orchestrator.mjs` turns the plan into per-scene Wan task contracts and explicit stage dependencies; it always requires human approval and remains non-executing. `video-job-service.mjs` is the framework-neutral service surface. It expects the calling API to authenticate the user and pass only the verified principal; it never authenticates tokens itself. It supports planning, tenant-scoped metadata job creation, get/list, prepare-for-approval and pre-execution cancellation. The execute method remains fail-closed. `job-lifecycle.mjs` supplies the state machine. `file-job-store.mjs` adds a local append-only journal with fsync-per-event and single-writer locking; it is not encrypted at rest, is not a distributed queue and is not connected to Supabase. `quality-control.mjs` verifies timeline and output metadata, but does not yet inspect actual MP4 frames or perceptual quality. `dataset-governance.mjs` prepares a future NOVA-specific adapter/LoRA path using only datasets with documented provenance, model-training and commercial rights, privacy review and consent where people are identifiable. It validates manifests only; it does not upload data or train weights.

## Model catalog

`model-catalog.json` records Wan 2.2 TI2V-5B as the first research candidate. Its published model card lists Apache-2.0, text/image-to-video, 720p at 24 FPS and a 24 GB VRAM requirement. The model is not downloaded, hosted or enabled. Model license and inference-compute cost are separate gates; the catalog explicitly records that zero-cost compute is not verified.

See `MODEL-SELECTION.md` for the acceptance checklist. `generative-video.mjs` defines the bounded 720p/24fps clip request and validates MP4 outputs, but it does not launch or download the model.

## Script Intelligence

`script-intelligence.mjs` normalizes creative briefs, builds a structured prompt/schema request, and validates the model response. It treats user brief text as data. It does not contain or select a model. Calls are blocked unless execution is explicitly enabled and the provider registry contains a reviewed, commercially permitted, zero-cost provider with evidence URLs and review metadata.

## Local inference preflight (not yet enabled)

The Wan adapter checks gates in this order: explicit execution flag; model-license and independent-security approval flags; externally attested zero-cost compute; pinned 40-character source revision; checkpoint-integrity attestation; configured local paths; then a real `nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits` probe requiring at least 24,000 MiB of FREE VRAM on one GPU (not merely total installed memory). Before any generator process is started, the adapter checks each existing output-directory component with `lstat` and `realpath`, rejects symlinks and group/world-writable output directories, and creates missing components with mode `0700`. It then passes the resolved in-workspace output path to the generator. The adapter also resolves `generate.py` inside the pinned repository and verifies `git rev-parse HEAD` matches the configured revision.

The zero-cost and checkpoint-integrity values are external operator attestations, not facts inferred by the code. They must be supported by independent evidence before a local runtime can be enabled. No checkpoint is downloaded or modified by the adapter.

### Process isolation remains a hard blocker

A hard-coded final preflight gate currently returns `wan22_process_isolation_not_implemented` even when every operator-supplied approval flag, revision, checkpoint and GPU-memory check passes. This prevents a caller from enabling generation merely by setting booleans.

The output-path checks reduce the pre-existing symlink escape risk, but filesystem checks are not a race-resistant sandbox. The current process helper uses `shell:false` and a timeout, but it does not provide process-tree termination, cgroup/container isolation, CPU/RAM/GPU limits, disk quotas, or a deny-by-default network/credential boundary. The approval booleans are operator-supplied configuration assertions, not independently verified evidence. Therefore the local Wan adapter must remain disabled; do not set `executionEnabled=true` merely because the path and VRAM tests pass. Before any real inference, implement and independently validate an ephemeral, resource-limited isolated worker, derive license/checkpoint/cost/security gates from immutable evidence, and prove teardown and rollback. No model download or inference is authorized by this PR.

