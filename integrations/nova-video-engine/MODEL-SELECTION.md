# NOVA Video Model Selection

## Initial candidate: Wan 2.2 TI2V-5B

Wan-AI/Wan2.2-TI2V-5B is the first research candidate for NOVA's self-hosted generative lane because its published model card states Apache-2.0 licensing, text-to-video and image-to-video support, 720p at 24 FPS, and a minimum 24 GB GPU memory configuration using the documented offload options.

Sources:
- Model card and license: https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B
- Official implementation: https://github.com/Wan-Video/Wan2.2

## Why it is not enabled

- A model license does not make inference compute free.
- The model card documents a 24 GB VRAM GPU requirement for its 720p single-GPU path. NOVA has no verified GPU runtime meeting that requirement.
- Hugging Face hosted Inference Providers require an access token and a provider selection; hosted inference is not assumed free and is not enabled.
- No model weights are downloaded and no runtime is provisioned by this change.

## Acceptance gates before registration

1. Independent reviewer checks the exact model card, Apache-2.0 license, dependencies, notices and redistribution obligations.
2. Compute owner proves a compatible GPU runtime and its total cost is zero under the actual account/plan, including storage, egress and idle time.
3. Security review checks model loading, file access, prompt handling, resource limits and tenant isolation.
4. Reproducible benchmark generates and verifies a short text-to-video and image-to-video sample, with resource and latency metrics.
5. Only then can a provider manifest move from research to approved and be registered in the fail-closed registry.

Until all gates pass, the catalog entry remains research-only and provider execution stays disabled.
