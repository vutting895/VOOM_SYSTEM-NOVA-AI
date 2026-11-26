"""Deterministic PyTorch training utilities for sequence models.

Training is deliberately offline and CPU-first. It never downloads data, writes
model files to disk, or connects to a broker. The returned checkpoint is an
in-memory artifact whose digest can be recorded in an experiment manifest.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import math
import re
from collections.abc import Sequence
from typing import Any

_SHA256 = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class TrainingResult:
    best_epoch: int
    best_validation_loss: float
    checkpoint_bytes: bytes
    checkpoint_sha256: str


def _tensor(torch: Any, values: Any, label: str, *, target: bool = False):
    try:
        tensor = torch.as_tensor(values, dtype=torch.float32, device="cpu")
    except (TypeError, ValueError, RuntimeError) as exc:
        raise ValueError(f"{label} must be a rectangular numeric array") from exc
    if tensor.numel() == 0 or not torch.isfinite(tensor).all().item():
        raise ValueError(f"{label} must be non-empty and finite")
    if target:
        if tensor.ndim == 2 and tensor.shape[1] == 1:
            tensor = tensor.reshape(-1)
        if tensor.ndim != 1:
            raise ValueError(f"{label} must be one-dimensional")
    elif tensor.ndim != 3:
        raise ValueError(f"{label} must have shape [samples, sequence, features]")
    return tensor.contiguous()


def train_sequence_model(
    model,
    train_x: Sequence,
    train_y: Sequence,
    valid_x: Sequence,
    valid_y: Sequence,
    model_version: str,
    dataset_sha256: str,
    feature_schema_sha256: str,
    epochs: int = 20,
    batch_size: int = 32,
    patience: int = 5,
    seed: int = 13,
    learning_rate: float = 1e-3,
) -> TrainingResult:
    """Train a torch module with chronological caller-supplied train/valid sets.

    The caller is responsible for creating leakage-safe splits and for freezing
    the final OOS period. This function does not split, shuffle across, or tune
    against a final OOS dataset.
    """
    try:
        import torch
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for model training; install the approved torch runtime") from exc

    for name, value in (("model_version", model_version),):
        if not isinstance(value, str) or not value.strip() or len(value) > 128:
            raise ValueError(f"{name} must be a non-empty string of at most 128 characters")
    for name, digest in (("dataset_sha256", dataset_sha256), ("feature_schema_sha256", feature_schema_sha256)):
        if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
            raise ValueError(f"{name} must be a lowercase SHA-256 digest")
    for name, value, minimum in (("epochs", epochs, 1), ("batch_size", batch_size, 1), ("patience", patience, 1)):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise ValueError(f"{name} must be an integer >= {minimum}")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**31 - 1:
        raise ValueError("seed must be an integer in range 0..2^31-1")
    if isinstance(learning_rate, bool) or not isinstance(learning_rate, (int, float)) or not math.isfinite(learning_rate) or learning_rate <= 0:
        raise ValueError("learning_rate must be a finite positive number")

    x_train = _tensor(torch, train_x, "train_x")
    y_train = _tensor(torch, train_y, "train_y", target=True)
    x_valid = _tensor(torch, valid_x, "valid_x")
    y_valid = _tensor(torch, valid_y, "valid_y", target=True)
    if len(x_train) != len(y_train) or len(x_valid) != len(y_valid):
        raise ValueError("feature and target sample counts must match")
    if len(x_train) < 2 or len(x_valid) < 1:
        raise ValueError("training requires at least two train samples and one validation sample")
    if x_train.shape[1:] != x_valid.shape[1:]:
        raise ValueError("train_x and valid_x sequence/feature dimensions must match")
    if not isinstance(model, torch.nn.Module):
        raise TypeError("model must be a torch.nn.Module")

    torch.manual_seed(seed)
    generator = torch.Generator(device="cpu")
    generator.manual_seed(seed)
    loader = DataLoader(
        TensorDataset(x_train, y_train),
        batch_size=min(batch_size, len(x_train)),
        shuffle=True,
        generator=generator,
        drop_last=False,
    )
    model = model.to("cpu")
    optimizer = torch.optim.Adam(model.parameters(), lr=float(learning_rate))
    loss_fn = torch.nn.MSELoss()

    best_loss = math.inf
    best_epoch = 0
    best_state = None
    stale_epochs = 0
    for epoch in range(1, epochs + 1):
        model.train()
        for batch_x, batch_y in loader:
            optimizer.zero_grad(set_to_none=True)
            predictions = model(batch_x)
            if predictions.ndim != 1 or predictions.shape[0] != batch_y.shape[0]:
                raise ValueError("model output must have shape [batch]")
            loss = loss_fn(predictions, batch_y)
            if not torch.isfinite(loss).item():
                raise ValueError("training loss became non-finite")
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            predictions = model(x_valid)
            validation_loss = float(loss_fn(predictions, y_valid).item())
        if not math.isfinite(validation_loss):
            raise ValueError("validation loss became non-finite")
        if validation_loss < best_loss:
            best_loss = validation_loss
            best_epoch = epoch
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= patience:
                break

    if best_state is None:
        raise RuntimeError("training completed without a valid checkpoint")
    model.load_state_dict(best_state)
    checkpoint = {
        "schema_version": "nova.model-checkpoint.v1",
        "model_version": model_version,
        "dataset_sha256": dataset_sha256,
        "feature_schema_sha256": feature_schema_sha256,
        "seed": seed,
        "best_epoch": best_epoch,
        "best_validation_loss": best_loss,
        "model_state_dict": best_state,
    }
    buffer = BytesIO()
    torch.save(checkpoint, buffer)
    checkpoint_bytes = buffer.getvalue()
    return TrainingResult(
        best_epoch=best_epoch,
        best_validation_loss=best_loss,
        checkpoint_bytes=checkpoint_bytes,
        checkpoint_sha256=sha256(checkpoint_bytes).hexdigest(),
    )
