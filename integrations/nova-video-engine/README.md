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
| Render orchestration and state machine | Implemented |
| FFmpeg still-image-to-MP4 compositor | Implemented as an optional local adapter |
| Provider adapter registry | Implemented; default provider set is empty and all candidates fail closed until evidence is approved |
| Text-to-video / image-to-video model inference | Not implemented; blocked pending approved compute and model review |
| AI scriptwriting / generative storyboard model | Adapter boundary only; deterministic planner is not a generative model |
| Voice, music, subtitles and audio mix | Not implemented |
| Video analysis / editing / transcoding pipeline | Not implemented |
| Persistent queue, worker dispatch and private asset storage | Not implemented |
| Supabase production schema / migration | Not included in this package |

The FFmpeg adapter creates a silent MP4 slideshow from scene images. It is a real composition path, not generative video. It requires a locally installed FFmpeg binary and local workspace images; it is not enabled in the Cloudflare Worker.

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

1. Add a reviewed provider-adapter interface and model/license manifest.
2. Add a CPU-capable audio/subtitle composition lane.
3. Add isolated job queue, cancellation, retries and idempotency.
4. Add private object storage and signed delivery only after tenant isolation and backup/restore acceptance.
5. Benchmark candidate open models and compute against verified zero-cost eligibility; otherwise keep generative tasks blocked.
6. Prove two-user staging isolation before connecting execution to the production API.
