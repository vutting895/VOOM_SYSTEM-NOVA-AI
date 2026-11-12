"""Training entry point reserved for a verified PyTorch training implementation.

The previous implementation returned fixed metrics and mock checkpoint bytes.
Fail explicitly until real optimization, validation, and checkpoint serialization
are implemented. Never present a placeholder as a trained model.
"""
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
    """Run actual training once the audited training pipeline is implemented.

    The parameters are retained as the intended API contract. No input is
    consumed and no checkpoint or metric is fabricated by this placeholder.
    """
    raise NotImplementedError(
        "TRAINING_RUNTIME_NOT_IMPLEMENTED: no verified optimizer, evaluator, "
        "or checkpoint serializer is configured"
    )
