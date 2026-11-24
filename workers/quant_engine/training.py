"""Deterministic PyTorch training utilities for sequence regression models.

Training is research-only. This module never loads market data, evaluates final
OOS performance, registers/promotes models, or connects to a broker.
"""
from __future__ import annotations

import hashlib
import io
import math
import random
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TrainingResult:
    best_epoch: int
    best_validation_loss: float
    checkpoint_bytes: bytes
    checkpoint_sha256: str


def _require_sha256(value: str, field: str) -> None:
    if not isinstance(value, str) or len(value) != 64:
        raise ValueError(f"{field} must be a 64-character SHA-256 hex digest")
    try:
        int(value, 16)
    except ValueError as exc:
        raise ValueError(f"{field} must be a 64-character SHA-256 hex digest") from exc


def train_sequence_model(
    model: Any,
    train_x: Sequence,
    train_y: Sequence,
    valid_x: Sequence,
    valid_y: Sequence,
    model_version: str,
    dataset_sha256: str,
    feature_schema_sha256: str,
    epochs: int = 2,
    batch_size: int = 4,
    patience: int = 2,
    seed: int = 13,
) -> TrainingResult:
    """Train a PyTorch model using train-only gradient updates and validation MSE.

    The best validation checkpoint is serialized with provenance metadata.
    Validation data is used only for early stopping/model selection; callers
    must keep the final OOS test set entirely outside this function.
    """
    try:
        import torch
        from torch import nn
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for real sequence-model training") from exc

    if not isinstance(model_version, str) or not model_version.strip():
        raise ValueError("model_version must be a non-empty string")
    _require_sha256(dataset_sha256, "dataset_sha256")
    _require_sha256(feature_schema_sha256, "feature_schema_sha256")
    for name, value in (("epochs", epochs), ("batch_size", batch_size), ("patience", patience)):
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ValueError(f"{name} must be a positive integer")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise ValueError("seed must be an integer")

    try:
        parameters = list(model.parameters())
    except AttributeError as exc:
        raise TypeError("model must be a torch.nn.Module") from exc
    if not parameters:
        raise ValueError("model must contain trainable parameters")
    device = parameters[0].device
    if any(parameter.device != device for parameter in parameters):
        raise ValueError("all model parameters must be on the same device")
    if not any(parameter.requires_grad for parameter in parameters):
        raise ValueError("model has no trainable parameters")

    def as_features(values: Sequence, name: str):
        if values is None or len(values) == 0:
            raise ValueError(f"{name} must not be empty")
        tensor = torch.as_tensor(values, dtype=torch.float32)
        if tensor.ndim != 3:
            raise ValueError(f"{name} must have shape [samples, sequence, features]")
        if tensor.shape[0] == 0 or tensor.shape[1] == 0 or tensor.shape[2] == 0:
            raise ValueError(f"{name} dimensions must be non-zero")
        if not torch.isfinite(tensor).all().item():
            raise ValueError(f"{name} contains NaN or infinite values")
        return tensor

    def as_targets(values: Sequence, name: str, expected_rows: int):
        if values is None:
            raise ValueError(f"{name} must not be empty")
        tensor = torch.as_tensor(values, dtype=torch.float32).reshape(-1)
        if tensor.numel() != expected_rows:
            raise ValueError(f"{name} row count must match its feature matrix")
        if not torch.isfinite(tensor).all().item():
            raise ValueError(f"{name} contains NaN or infinite values")
        return tensor

    x_train = as_features(train_x, "train_x")
    x_valid = as_features(valid_x, "valid_x")
    if x_train.shape[1:] != x_valid.shape[1:]:
        raise ValueError("training and validation window shapes must match")
    y_train = as_targets(train_y, "train_y", x_train.shape[0])
    y_valid = as_targets(valid_y, "valid_y", x_valid.shape[0])

    # Validate the model output contract before mutating model weights.
    model.eval()
    with torch.no_grad():
        probe = model(x_train[:1].to(device))
    if not isinstance(probe, torch.Tensor) or probe.numel() != 1:
        raise ValueError("model must return one scalar prediction per sample")
    if not torch.isfinite(probe).all().item():
        raise ValueError("model produced non-finite predictions")

    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    generator = torch.Generator(device="cpu")
    generator.manual_seed(seed)

    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(
        (parameter for parameter in parameters if parameter.requires_grad),
        lr=1e-3,
    )
    best_loss = math.inf
    best_epoch = 0
    best_state = None
    epochs_without_improvement = 0

    for epoch in range(1, epochs + 1):
        model.train()
        permutation = torch.randperm(x_train.shape[0], generator=generator)
        for start in range(0, x_train.shape[0], batch_size):
            indices = permutation[start:start + batch_size]
            batch_x = x_train[indices].to(device)
            batch_y = y_train[indices].to(device)
            optimizer.zero_grad(set_to_none=True)
            predictions = model(batch_x).reshape(-1)
            if predictions.shape != batch_y.shape:
                raise ValueError("model output batch size does not match target batch size")
            loss = criterion(predictions, batch_y)
            if not torch.isfinite(loss).item():
                raise RuntimeError("non-finite training loss; aborting without checkpoint")
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            predictions = model(x_valid.to(device)).reshape(-1)
            if predictions.shape != y_valid.shape:
                raise ValueError("model validation output size does not match targets")
            validation_loss = criterion(predictions, y_valid.to(device)).item()
        if not math.isfinite(validation_loss):
            raise RuntimeError("non-finite validation loss; aborting without checkpoint")

        if validation_loss < best_loss:
            best_loss = validation_loss
            best_epoch = epoch
            best_state = {
                name: tensor.detach().cpu().clone()
                for name, tensor in model.state_dict().items()
            }
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                break

    if best_state is None:
        raise RuntimeError("training did not produce a valid checkpoint")

    # Restore the best validation-selected weights before returning.
    model.load_state_dict(best_state)
    payload = {
        "format": "nova.pytorch-checkpoint.v1",
        "model_version": model_version,
        "dataset_sha256": dataset_sha256,
        "feature_schema_sha256": feature_schema_sha256,
        "seed": seed,
        "best_epoch": best_epoch,
        "best_validation_loss": best_loss,
        "state_dict": best_state,
    }
    buffer = io.BytesIO()
    torch.save(payload, buffer)
    checkpoint_bytes = buffer.getvalue()
    return TrainingResult(
        best_epoch=best_epoch,
        best_validation_loss=float(best_loss),
        checkpoint_bytes=checkpoint_bytes,
        checkpoint_sha256=hashlib.sha256(checkpoint_bytes).hexdigest(),
    )
