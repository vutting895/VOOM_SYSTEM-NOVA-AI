# NOVA Causal Chart Vision MAE

Status: research architecture and optional trainer implemented; not trained on verified Exness chart images.

- Input: normalized RGB tensors [N,3,H,W], finite pixels in [0,1].
- Each image must be rendered only from OHLCV bars available at its decision timestamp. Never include future candles, future swing labels, hindsight zones or later annotations.
- Patch encoder/decoder reconstructs masked patches only.
- Training uses AdamW, deterministic seed control, gradient clipping, fixed validation mask sequence and validation-only early stopping.
- Checkpoints record dataset/schema SHA-256, image geometry, mask ratio, seed, epoch and validation loss.

Before use, create an image manifest linking each image SHA-256 to source CSV SHA-256, input bar range, decision timestamp, renderer version and feature schema. Split windows chronologically, purge overlapping label horizons and exclude every window crossing unexplained gaps. Keep final OOS from 2026-07-01 untouched.

MAE reconstruction loss is a pretraining objective, not trading evidence. A downstream prediction head and aligned OOF evaluation after costs are required before Meta Decision integration. No automatic promotion or order execution.
