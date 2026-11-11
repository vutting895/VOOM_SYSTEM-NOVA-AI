"""Optional deterministic PyTorch training loop for sequence research models.

Training consumes caller-supplied chronological train/validation partitions.
It never reads broker state, tunes on final OOS, or submits orders.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import math
import random
from typing import Sequence


class TrainingError(ValueError):
    """Invalid training data or configuration."""


@dataclass(frozen=True)
class TrainingResult:
    checkpoint_bytes: bytes
    checkpoint_sha256: str
    model_version: str
    best_epoch: int
    epochs_completed: int
    best_validation_loss: float
    seed: int
    optimizer: str
    loss_name: str


def validate_training_inputs(
    train_sequences: Sequence[Sequence[Sequence[float]]],
    train_targets: Sequence[float],
    validation_sequences: Sequence[Sequence[Sequence[float]]],
    validation_targets: Sequence[float],
    *,
    epochs: int,
    batch_size: int,
    patience: int,
    learning_rate: float,
    seed: int,
) -> tuple[int, int]:
    """Validate array shapes and finite values without importing PyTorch."""
    for name, value, minimum in (
        ("epochs", epochs, 1), ("batch_size", batch_size, 1),
        ("patience", patience, 1), ("seed", seed, 0),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise TrainingError(f"{name} must be an integer >= {minimum}")
    if isinstance(learning_rate, bool) or not isinstance(learning_rate, (int, float)) or not math.isfinite(float(learning_rate)) or learning_rate <= 0:
        raise TrainingError("learning_rate must be finite and positive")
    for name, sequences, targets in (
        ("train", train_sequences, train_targets),
        ("validation", validation_sequences, validation_targets),
    ):
        if not sequences or len(sequences) != len(targets):
            raise TrainingError(f"{name} sequences and targets must be non-empty and aligned")
        sequence_length = len(sequences[0])
        if sequence_length < 2:
            raise TrainingError(f"{name} sequence length must be at least 2")
        feature_count = len(sequences[0][0]) if sequences[0] else 0
        if feature_count < 1:
            raise TrainingError(f"{name} feature width must be positive")
        for sample_index, sequence in enumerate(sequences):
            if len(sequence) != sequence_length:
                raise TrainingError(f"{name} sequences must have equal lengths")
            for row in sequence:
                if len(row) != feature_count:
                    raise TrainingError(f"{name} feature rows must have equal widths")
                for value in row:
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                        raise TrainingError(f"{name} contains non-finite feature values")
            target = targets[sample_index]
            if isinstance(target, bool) or not isinstance(target, (int, float)) or not math.isfinite(float(target)):
                raise TrainingError(f"{name} contains non-finite target values")
    train_shape = (len(train_sequences[0]), len(train_sequences[0][0]))
    validation_shape = (len(validation_sequences[0]), len(validation_sequences[0][0]))
    if train_shape != validation_shape:
        raise TrainingError("train and validation sequence shapes must match")
    return train_shape[1], train_shape[0]


def train_sequence_model(
    model,
    train_sequences: Sequence[Sequence[Sequence[float]]],
    train_targets: Sequence[float],
    validation_sequences: Sequence[Sequence[Sequence[float]]],
    validation_targets: Sequence[float],
    *,
    model_version: str,
    dataset_sha256: str,
    feature_schema_sha256: str,
    epochs: int = 100,
    batch_size: int = 64,
    patience: int = 10,
    learning_rate: float = 0.001,
    seed: int = 42,
    weight_decay: float = 0.0001,
) -> TrainingResult:
    """Train on train partition and early-stop only against validation loss."""
    import re
    if not isinstance(model_version, str) or not model_version.strip():
        raise TrainingError("model_version is required")
    for name, digest in (("dataset_sha256", dataset_sha256), ("feature_schema_sha256", feature_schema_sha256)):
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise TrainingError(f"{name} must be a lowercase SHA-256 digest")
    if isinstance(weight_decay, bool) or not isinstance(weight_decay, (int, float)) or not math.isfinite(float(weight_decay)) or weight_decay < 0:
        raise TrainingError("weight_decay must be finite and non-negative")
    input_size, sequence_length = validate_training_inputs(
        train_sequences, train_targets, validation_sequences, validation_targets,
        epochs=epochs, batch_size=batch_size, patience=patience,
        learning_rate=learning_rate, seed=seed,
    )
    try:
        import numpy as np
        import torch
        from torch import nn
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError as exc:
        raise RuntimeError("PyTorch and NumPy are required for model training") from exc

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)
    generator = torch.Generator().manual_seed(seed)

    train_x = torch.tensor(train_sequences, dtype=torch.float32)
    train_y = torch.tensor(train_targets, dtype=torch.float32)
    valid_x = torch.tensor(validation_sequences, dtype=torch.float32)
    valid_y = torch.tensor(validation_targets, dtype=torch.float32)
    if train_x.ndim != 3 or train_x.shape[1:] != (sequence_length, input_size):
        raise TrainingError("training tensors have an invalid shape")
    if valid_x.ndim != 3 or valid_x.shape[1:] != (sequence_length, input_size):
        raise TrainingError("validation tensors have an invalid shape")

    loader = DataLoader(TensorDataset(train_x, train_y), batch_size=batch_size,
                        shuffle=True, generator=generator, drop_last=False)
    criterion = nn.MSELoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=float(learning_rate), weight_decay=float(weight_decay))
    best_loss = float("inf")
    best_epoch = 0
    best_state = None
    stale_epochs = 0
    epochs_completed = 0

    for epoch in range(1, epochs + 1):
        model.train()
        for batch_x, batch_y in loader:
            optimizer.zero_grad(set_to_none=True)
            prediction = model(batch_x).reshape(-1)
            loss = criterion(prediction, batch_y)
            if not torch.isfinite(loss):
                raise TrainingError("non-finite training loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
        model.eval()
        with torch.no_grad():
            prediction = model(valid_x).reshape(-1)
            validation_loss = criterion(prediction, valid_y)
        if not torch.isfinite(validation_loss):
            raise TrainingError("non-finite validation loss")
        current = float(validation_loss.item())
        epochs_completed = epoch
        if current < best_loss:
            best_loss = current
            best_epoch = epoch
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= patience:
                break

    if best_state is None:
        raise TrainingError("training did not produce a valid checkpoint")
    model.load_state_dict(best_state)
    buffer = BytesIO()
    torch.save({
        "state_dict": best_state,
        "metadata": {
            "schema_version": "nova.sequence-model-artifact.v1",
            "model_version": model_version,
            "dataset_sha256": dataset_sha256,
            "feature_schema_sha256": feature_schema_sha256,
            "input_size": input_size,
            "sequence_length": sequence_length,
            "seed": seed,
            "best_epoch": best_epoch,
            "epochs_completed": epochs_completed,
            "best_validation_loss": best_loss,
            "optimizer": "AdamW",
            "loss": "MSELoss",
            "validation_only_early_stopping": True,
        },
    }, buffer)
    payload = buffer.getvalue()
    return TrainingResult(
        checkpoint_bytes=payload,
        checkpoint_sha256=sha256(payload).hexdigest(),
        model_version=model_version,
        best_epoch=best_epoch,
        epochs_completed=epochs_completed,
        best_validation_loss=best_loss,
        seed=seed,
        optimizer="AdamW",
        loss_name="MSELoss",
    )
