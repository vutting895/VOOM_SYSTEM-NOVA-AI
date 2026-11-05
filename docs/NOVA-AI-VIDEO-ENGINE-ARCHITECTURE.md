# NOVA AI Video Engine — Owned Architecture

## Product boundary

NOVA owns the control plane, creative planning, story/shot decisions, prompt contracts, provider governance, job lifecycle, media composition and quality gates. Foundation video weights are separate model assets; the initial generative candidate is Wan 2.2 TI2V-5B and remains research-only. NOVA does not claim to have trained its own foundation video model.

## Architecture

1. **Creative Intelligence** — creative brief normalization, language/audience/platform and campaign objective.
2. **NOVA Director Intelligence** — narrative beats, shot framing, camera movement, lighting, transition and subject continuity; frame-accurate 24 FPS timeline.
3. **Script Intelligence** — strict structured request/response contract and output validation; model invocation requires an approved provider.
4. **Generative Model Adapter** — task contract for text-to-video/image-to-video, safe source asset path and strict output metadata; model runtime remains disabled.
5. **Job Orchestration** — tenant-scoped state transitions, approval gate, idempotency, bounded retries and artifact metadata. The local append-only JSONL journal fsyncs each event and replays after restart; it is single-writer, unencrypted at rest and not a distributed/cloud queue.
6. **Composition** — local FFmpeg still-image compositor plus a multi-clip assembler for already-generated MP4 scenes, optional voice-over/music mixing and SRT soft subtitles. It validates source/final metadata and prevents output overwrite; speech/music synthesis is not included.
7. **Quality Control** — timeline continuity, frame count, duration, dimensions, content type, continuity group, safe asset paths and FFprobe metadata checks in local runtime/assembly. Pixel/perceptual checks and visual acceptance datasets remain pending.
8. **Delivery** — planned only; private object storage, signed URLs and retention/deletion are blocked pending tenant and backup gates.

## NOVA specialization and data rights

`dataset-governance.mjs` validates dataset provenance, hash declarations, training/commercial-use rights, privacy review, and explicit scopes for identifiable people before an adaptation plan can become ready for manual approval. It does not ingest or upload files and does not train weights. LoRA/adapter training is not promised until the chosen base model documents compatible fine-tuning, derivative rights are confirmed, and compute/dataset rights are proven.

## Model ownership strategy

- NOVA does not train a new foundation model from scratch in this phase. That requires a licensed dataset, substantial compute, evaluation and ongoing maintenance that cannot be justified under the current zero-cost constraint.
- NOVA owns its Director Intelligence, prompt compiler, policy gates, orchestration, job semantics, compositing pipeline and evaluation criteria.
- External/open model weights remain replaceable adapters. Provider eligibility requires independent license review, commercial-use evidence, zero-cost compute evidence, security review and reproducible output benchmarks.
- Wan 2.2 TI2V-5B is research-only; no checkpoint download, GPU runtime, provider call or billing action has occurred. The local adapter requires a pinned source revision, externally verified checkpoint integrity and an actual NVIDIA `nvidia-smi` result showing at least 24,000 MiB on one GPU before preflight can pass.

## Release phases

- **Phase 1 — Core planning:** Director, storyboard, timeline, task contracts, job states and metadata QC.
- **Phase 2 — Local inference proof:** compatible hardware discovery, manual opt-in local installation, model hash/license manifest, benchmark and first accepted clip.
- **Phase 3 — Shared durable execution:** distributed queue/worker dispatch, encrypted private object storage, cancellation/retry, retention/deletion, and two-user Supabase staging isolation. The local journal is a development durability layer only.
- **Phase 4 — Full creator pipeline:** actual AI-generated multi-clip motion continuity, generated voice/music options, richer subtitle timing, perceptual quality inspection and export profiles. Local assembly of pre-generated MP4/audio/SRT inputs is implemented.
- **Phase 5 — NOVA specialization:** collect permissioned examples and ratings; build evaluation sets and consider LoRA/adapters only after compute, dataset rights and measurable benefit are proven.

## Non-negotiable controls

- All execution flags default false; human approval required before generation.
- No paid API, GPU, trial-credit fallback or automatic top-up.
- No secrets in prompts, logs or job records.
- No Production migration, RLS change, Worker deployment or Affiliate activation through this PR.
- A successful plan or accepted job is not proof that an MP4 was generated. Completion requires real artifact inspection.
