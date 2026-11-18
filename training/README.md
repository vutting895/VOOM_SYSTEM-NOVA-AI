# NOVA Training Orchestration

Training is hybrid: local CPU for validation/smoke tests and ephemeral Kaggle/Colab runners for bounded batch jobs. The control plane records and authorizes jobs; it does not train inside Cloudflare Workers.

## Run contract
Every run pins:
- approved dataset ID and SHA-256;
- feature schema and label version;
- code commit and config SHA-256;
- model family, hyperparameters, seed, runtime and dependency versions;
- split/purge/embargo policy and frozen OOS boundary;
- evaluator version, cost assumptions, and artifact output prefix.

## Learning mode
Continuous data/feedback capture + scheduled or event-triggered batch retraining. No online weight mutation. New runs produce candidates; they do not replace approved models.

## Initial model order
1. XGBoost baseline on tabular features.
2. LSTM/PyTorch sequence model after leakage-safe windows exist.
3. Vision model only after chart/image generation is deterministic and aligned to the same timestamps and labels.
4. Meta Decision Layer consumes calibrated out-of-fold predictions; it does not train or place orders.

## Current blocker
`workers/quant_engine/training.py` returns mock checkpoint bytes. Replace it with real training code and tests before any run can be marked successful. Existing `splits.py` and `quality.py` are the baseline contracts to reuse.
