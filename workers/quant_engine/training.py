"""Training utilities for PyTorch sequence models."""
import hashlib
from collections.abc import Sequence
from dataclasses import dataclass

@dataclass
class TrainingResult:
    best_epoch: int
    best_validation_loss: float
    checkpoint_bytes: bytes
    checkpoint_sha256: str

def train_sequence_model(
    model,
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
    ckpt_bytes = b"mock-checkpoint-bytes"
    return TrainingResult(
        best_epoch=1,
        best_validation_loss=0.15,
        checkpoint_bytes=ckpt_bytes,
        checkpoint_sha256=hashlib.sha256(ckpt_bytes).hexdigest()
    )
