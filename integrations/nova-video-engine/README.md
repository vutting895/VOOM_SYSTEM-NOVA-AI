# NOVA Video Engine — CPU-first core (0.1.0)

This is the first NOVA-owned engine core: a deterministic Video Director, an inspectable workflow DAG, and safe FFmpeg/FFprobe argument planners.

## Implemented in this slice

- Brief validation and deterministic scene/shot planning.
- Exact duration partitioning and approved aspect-ratio/style presets.
- Workflow graph with explicit blocked states for generation and media processing.
- FFmpeg/FFprobe argv builders that avoid shell interpolation and reject absolute/traversal paths.
- Node built-in tests; no external model SDK, GPU, paid API, cloud worker, or database dependency.

## Not implemented

- No model inference or AI-generated frames.
- No media upload, storage, malware scanning, worker dispatch, FFmpeg process execution, transcoding, or export.
- No production API wiring or Supabase schema changes.
- Generation remains `blocked_no_free_gpu`; processing/export remain `blocked_worker_unavailable`.

The Director is deterministic planning logic, not an LLM. FFmpeg plans are argv arrays only and must be executed later by an isolated, resource-bounded CPU worker after media validation and security review. They must never be passed to a shell.

## Local verification

```sh
node --test integrations/nova-video-engine/tests/*.test.mjs
node --check integrations/nova-video-engine/src/video-director.mjs
node --check integrations/nova-video-engine/src/workflow-planner.mjs
node --check integrations/nova-video-engine/src/ffmpeg-plan.mjs
```
