"""FastAPI router for Learning Engine.

The host application must override require_learning_approver with its
authenticated RBAC dependency before approval can be performed.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .service import LearningPromotionDenied, LearningService, LearningValidationError

router = APIRouter(prefix="/learning", tags=["Learning"])

_DATABASE_URL = os.getenv("DATABASE_URL")
_engine = create_engine(_DATABASE_URL, pool_pre_ping=True) if _DATABASE_URL else None
_SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False) if _engine else None


def get_learning_session():
    if _SessionLocal is None:
        raise HTTPException(status_code=503, detail="Learning database is not configured (DATABASE_URL)")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_learning_user() -> str:
    """Fail closed until the host injects authenticated owner/tenant RBAC."""
    raise HTTPException(
        status_code=503,
        detail="Learning API is disabled until authenticated owner/tenant RBAC is configured",
    )


def require_learning_evaluator() -> str:
    """Fail closed until a trusted internal evaluator identity is configured."""
    raise HTTPException(
        status_code=503,
        detail="Candidate registration is disabled until trusted evaluator authentication is configured",
    )


def require_learning_approver() -> str:
    """Fail closed until the host injects its authenticated approver/RBAC check."""
    raise HTTPException(
        status_code=503,
        detail="Learning approval is disabled until the host RBAC dependency is configured",
    )


class ExperienceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: str = Field(min_length=1, max_length=128)
    agent_id: str = Field(min_length=1, max_length=128)
    strategy_id: str = Field(min_length=1, max_length=128)
    symbol: str = Field(min_length=1, max_length=64)
    timeframe: str = Field(default="unknown", max_length=16)
    environment: str = Field(default="paper")
    side: str
    entry_price: float = Field(gt=0)
    exit_price: float = Field(gt=0)
    pnl_pct: float
    risk_pct: float = Field(ge=0)
    drawdown_pct: float = Field(default=0.0, ge=0)
    features: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class CandidateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_name: str
    version: str
    artifact_uri: str
    feature_schema_version: str
    metrics: dict[str, Any]
    evaluation_summary: str = ""


@router.post("/experiences", status_code=201)
def record_experience(
    body: ExperienceIn,
    _actor: str = Depends(require_learning_user),
    db: Session = Depends(get_learning_session),
):
    try:
        result = LearningService(db).record_experience(body.model_dump())
        db.commit()
        return result
    except LearningValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/performance")
def performance_summary(strategy_id: str | None = None, environment: str | None = None,
                         _actor: str = Depends(require_learning_user),
                         db: Session = Depends(get_learning_session)):
    return LearningService(db).performance_summary(strategy_id=strategy_id, environment=environment)


@router.post("/models/candidates", status_code=201)
def register_candidate(
    body: CandidateIn,
    _evaluator: str = Depends(require_learning_evaluator),
    db: Session = Depends(get_learning_session),
):
    try:
        result = LearningService(db).register_candidate(**body.model_dump())
        db.commit()
        return result
    except LearningValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/models/{model_id}/approve")
def approve_candidate(
    model_id: int,
    approver: str = Depends(require_learning_approver),
    db: Session = Depends(get_learning_session),
):
    try:
        result = LearningService(db).promote_candidate(model_id, approved_by=approver)
        db.commit()
        return result
    except LearningPromotionDenied as exc:
        db.commit()  # retain denial audit event
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LearningValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/health")
def learning_health():
    return {
        "module": "learning",
        "version": "0.1.0",
        "status": "ready",
        "database_configured": _SessionLocal is not None,
        "approval_rbac_configured": False,
        "auto_training": False,
        "auto_promotion": False,
        "live_trading": False,
    }
