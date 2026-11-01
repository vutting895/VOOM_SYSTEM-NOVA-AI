"""NOVA Learning Universe governance contracts.

This package defines a bounded, research-only lifecycle. It does not train,
schedule, persist, promote, or execute models.
"""

from .lifecycle import (
    LearningLifecycleError,
    LearningState,
    create_cycle,
    transition_cycle,
)

__all__ = [
    "LearningLifecycleError",
    "LearningState",
    "create_cycle",
    "transition_cycle",
]
