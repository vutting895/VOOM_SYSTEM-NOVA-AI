"""Versioned, fail-closed model plugin contracts for NOVA research inference.

Adapters must be deterministic for a fixed artifact and point-in-time input.
This registry does not load arbitrary Python modules or execute user-provided code.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
import hashlib
import json
import math
import re
from typing import Any, Mapping, Protocol, runtime_checkable

MODEL_FAMILIES = frozenset({"lstm", "deep_learning", "xgboost", "vision"})
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class ModelPluginError(ValueError):
    """Invalid plugin registration, feature payload, or model output."""


@dataclass(frozen=True)
class ModelInput:
    decision_timestamp: str
    dataset_sha256: str
    feature_schema_sha256: str
    feature_values: Mapping[str, float]
    timeframe: str

    def validate(self) -> None:
        _timestamp(self.decision_timestamp, "decision_timestamp")
        _sha(self.dataset_sha256, "dataset_sha256")
        _sha(self.feature_schema_sha256, "feature_schema_sha256")
        if not self.timeframe or not isinstance(self.timeframe, str):
            raise ModelPluginError("timeframe is required")
        if not isinstance(self.feature_values, Mapping) or not self.feature_values:
            raise ModelPluginError("feature_values must be a non-empty mapping")
        for key, value in self.feature_values.items():
            if not isinstance(key, str) or not key:
                raise ModelPluginError("feature names must be non-empty strings")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                raise ModelPluginError(f"feature {key!r} must be finite numeric data")


@dataclass(frozen=True)
class ModelOutput:
    family: str
    model_version: str
    decision_timestamp: str
    dataset_sha256: str
    feature_schema_sha256: str
    direction: int
    score: float
    evaluation_ref: str

    def validate_against(self, model_input: ModelInput) -> None:
        if self.family not in MODEL_FAMILIES:
            raise ModelPluginError("unsupported model family")
        if not self.model_version or not self.evaluation_ref:
            raise ModelPluginError("model_version and evaluation_ref are required")
        if self.decision_timestamp != model_input.decision_timestamp:
            raise ModelPluginError("model output timestamp does not match decision timestamp")
        if self.dataset_sha256 != model_input.dataset_sha256:
            raise ModelPluginError("model output dataset SHA does not match input")
        if self.feature_schema_sha256 != model_input.feature_schema_sha256:
            raise ModelPluginError("model output feature schema SHA does not match input")
        if isinstance(self.direction, bool) or not isinstance(self.direction, int) or self.direction not in (-1, 0, 1):
            raise ModelPluginError("direction must be integer -1, 0 or 1")
        if isinstance(self.score, bool) or not isinstance(self.score, (int, float)) or not math.isfinite(float(self.score)) or not 0 <= self.score <= 1:
            raise ModelPluginError("score must be finite and within [0, 1]")
        if (self.direction == 0) != (float(self.score) == 0.0):
            raise ModelPluginError("neutral direction and zero score must occur together")


@runtime_checkable
class ModelPlugin(Protocol):
    family: str
    model_version: str
    feature_schema_sha256: str

    def predict(self, model_input: ModelInput) -> ModelOutput:
        """Produce a point-in-time research vote; never place an order."""


class ModelPluginRegistry:
    """Explicit allow-list registry. Duplicate family/version registrations fail."""

    def __init__(self) -> None:
        self._plugins: dict[tuple[str, str], ModelPlugin] = {}

    def register(self, plugin: ModelPlugin) -> None:
        family = getattr(plugin, "family", None)
        version = getattr(plugin, "model_version", None)
        schema = getattr(plugin, "feature_schema_sha256", None)
        if family not in MODEL_FAMILIES or not isinstance(version, str) or not version.strip():
            raise ModelPluginError("plugin family and model_version are invalid")
        _sha(schema, "plugin.feature_schema_sha256")
        if not isinstance(plugin, ModelPlugin):
            raise ModelPluginError("plugin does not implement the required predict contract")
        key = (family, version)
        if key in self._plugins:
            raise ModelPluginError(f"plugin already registered: {family}@{version}")
        self._plugins[key] = plugin

    def predict(self, family: str, version: str, model_input: ModelInput) -> ModelOutput:
        model_input.validate()
        plugin = self._plugins.get((family, version))
        if plugin is None:
            raise ModelPluginError(f"plugin not registered: {family}@{version}")
        if plugin.feature_schema_sha256 != model_input.feature_schema_sha256:
            raise ModelPluginError("input feature schema does not match registered plugin")
        output = plugin.predict(model_input)
        if not isinstance(output, ModelOutput):
            raise ModelPluginError("plugin must return ModelOutput")
        if output.family != family or output.model_version != version:
            raise ModelPluginError("plugin returned mismatched family or version")
        output.validate_against(model_input)
        return output

    def registered_versions(self) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {}
        for family, version in sorted(self._plugins):
            result.setdefault(family, []).append(version)
        return result


def feature_schema_sha256(feature_names: list[str]) -> str:
    """Stable SHA-256 for an ordered feature schema."""
    if not feature_names or any(not isinstance(name, str) or not name for name in feature_names):
        raise ModelPluginError("feature_names must be a non-empty list of non-empty strings")
    if len(set(feature_names)) != len(feature_names):
        raise ModelPluginError("feature_names must be unique")
    payload = json.dumps(feature_names, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _sha(value: Any, label: str) -> None:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise ModelPluginError(f"{label} must be a lowercase SHA-256 hex digest")


def _timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ModelPluginError(f"{label} is required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ModelPluginError(f"{label} must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ModelPluginError(f"{label} must include a timezone")
    return parsed
