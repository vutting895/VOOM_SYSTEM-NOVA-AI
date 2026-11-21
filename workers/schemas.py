"""Typed, execution-disabled contracts for NOVA read-only inference."""
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ConnectionReadinessState(str, Enum):
    unavailable = "unavailable"
    configured = "configured"
    reachable = "reachable"
    authenticated = "authenticated"
    data_verified = "data_verified"
    stale = "stale"
    incomplete = "incomplete"


class ModelMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    framework: Optional[str] = None
    trained_at: Optional[datetime] = None
    feature_schema_version: Optional[str] = None
    artifact_sha256: Optional[str] = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PredictionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: ModelMetadata
    symbol: str = Field(min_length=1)
    timeframe: Optional[str] = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    predictions: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    input_snapshot_id: Optional[str] = None


class InferenceReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str = "nova.inference.v1"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    readiness: ConnectionReadinessState = ConnectionReadinessState.unavailable
    prediction: Optional[PredictionPayload] = None
    warnings: List[str] = Field(default_factory=list)
    executionEnabled: bool = False
    liveTradingEnabled: bool = False

    def model_post_init(self, __context: Any) -> None:
        if self.executionEnabled or self.liveTradingEnabled:
            raise ValueError("Inference reports are strictly read-only")
