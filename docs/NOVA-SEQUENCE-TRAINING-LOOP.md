# NOVA Sequence Training Loop

Status: optional PyTorch training utility; requires runtime verification before use.

## Training contract

- Accepts caller-supplied train and validation sequence partitions only.
- Validates finite values, aligned targets, equal sequence lengths and feature widths.
- Seeds Python, NumPy and PyTorch; uses deterministic PyTorch algorithms where supported.
- Uses AdamW, MSE loss, gradient clipping and early stopping against validation loss only.
- Restores the best validation checkpoint and records model version, dataset/schema SHA-256, input dimensions, seed, best epoch, validation loss, optimizer and loss.
- Returns checkpoint bytes and SHA-256 for downstream immutable artifact storage.

## Limitations

- No final OOS samples are accepted by this API; callers must keep final OOS isolated.
- This loop does not generate dataset splits or fit feature normalization. Use the sequence dataset module and fit normalization on training partition only.
- Deterministic mode is best-effort across hardware and PyTorch versions; record runtime/library versions in the artifact registry before claiming bitwise reproducibility.
- The function does not upload artifacts or enable a model in Meta Decision.
- This does not prove predictive edge; only walk-forward OOF evaluation after costs can establish model utility.
