"""Learning collection, reward calculation, evaluation and gated promotion.

This service deliberately does not train models or execute trades. Training is
an offline worker concern; promotion is an explicit approval workflow.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite
from typing import Any, Mapping

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import LearningAuditEvent, LearningExperience, LearningModelVersion


@dataclass(frozen=True)
class LearningPolicy:
    max_risk_pct: float = 2.0
    max_drawdown_pct: float = 10.0
    pnl_weight: float = 1.0
    risk_penalty_weight: float = 0.25
    drawdown_penalty_weight: float = 0.5
    min_candidate_samples: int = 100
    min_win_rate: float = 0.50
    min_profit_factor: float = 1.10
    max_validation_drawdown_pct: float = 8.0


@dataclass(frozen=True)
class RewardBreakdown:
    reward: float
    pnl_component: float
    risk_penalty: float
    drawdown_penalty: float
    risk_breach: bool
    drawdown_breach: bool


class LearningValidationError(ValueError):
    """Raised when an experience or model candidate violates the data contract."""


class LearningPromotionDenied(RuntimeError):
    """Raised when a model cannot be promoted under the current safety policy."""


def _finite_number(name: str, value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise LearningValidationError(f"{name} must be numeric") from exc
    if not isfinite(number):
        raise LearningValidationError(f"{name} must be finite")
    return number


def calculate_reward(
    pnl_pct: float,
    risk_pct: float,
    drawdown_pct: float,
    policy: LearningPolicy | None = None,
) -> RewardBreakdown:
    """Return a bounded, auditable reward in percentage-point units."""
    policy = policy or LearningPolicy()
    pnl = _finite_number("pnl_pct", pnl_pct)
    risk = max(0.0, _finite_number("risk_pct", risk_pct))
    drawdown = max(0.0, _finite_number("drawdown_pct", drawdown_pct))

    risk_breach = risk > policy.max_risk_pct
    drawdown_breach = drawdown > policy.max_drawdown_pct
    pnl_component = pnl * policy.pnl_weight
    risk_penalty = max(0.0, risk - policy.max_risk_pct) * policy.risk_penalty_weight
    drawdown_penalty = max(0.0, drawdown - policy.max_drawdown_pct) * policy.drawdown_penalty_weight
    reward = pnl_component - risk_penalty - drawdown_penalty
    return RewardBreakdown(
        reward=round(reward, 8),
        pnl_component=round(pnl_component, 8),
        risk_penalty=round(risk_penalty, 8),
        drawdown_penalty=round(drawdown_penalty, 8),
        risk_breach=risk_breach,
        drawdown_breach=drawdown_breach,
    )


class LearningService:
    def __init__(self, session: Session, policy: LearningPolicy | None = None):
        self.session = session
        self.policy = policy or LearningPolicy()

    def record_experience(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        required = (
            "event_id", "agent_id", "strategy_id", "symbol", "side",
            "entry_price", "exit_price", "pnl_pct", "risk_pct",
        )
        missing = [key for key in required if payload.get(key) is None]
        if missing:
            raise LearningValidationError(f"Missing required fields: {', '.join(missing)}")

        event_id = str(payload["event_id"]).strip()
        if not event_id or len(event_id) > 128:
            raise LearningValidationError("event_id must contain 1..128 characters")
        side = str(payload["side"]).upper()
        if side not in {"BUY", "SELL", "LONG", "SHORT"}:
            raise LearningValidationError("side must be BUY, SELL, LONG or SHORT")
        environment = str(payload.get("environment", "paper")).lower()
        if environment not in {"paper", "demo", "live", "backtest"}:
            raise LearningValidationError("environment must be paper, demo, live or backtest")

        entry = _finite_number("entry_price", payload["entry_price"])
        exit_price = _finite_number("exit_price", payload["exit_price"])
        pnl = _finite_number("pnl_pct", payload["pnl_pct"])
        risk = _finite_number("risk_pct", payload["risk_pct"])
        drawdown = _finite_number("drawdown_pct", payload.get("drawdown_pct", 0.0))
        if entry <= 0 or exit_price <= 0 or risk < 0 or drawdown < 0:
            raise LearningValidationError("prices must be positive; risk and drawdown cannot be negative")

        existing = self.session.scalar(
            select(LearningExperience).where(LearningExperience.event_id == event_id)
        )
        if existing:
            return {"id": existing.id, "event_id": event_id, "duplicate": True, "reward": existing.reward}

        breakdown = calculate_reward(pnl, risk, drawdown, self.policy)
        row = LearningExperience(
            event_id=event_id,
            agent_id=str(payload["agent_id"]),
            strategy_id=str(payload["strategy_id"]),
            symbol=str(payload["symbol"]).upper(),
            timeframe=str(payload.get("timeframe", "unknown")),
            environment=environment,
            side=side,
            entry_price=entry,
            exit_price=exit_price,
            pnl_pct=pnl,
            risk_pct=risk,
            drawdown_pct=drawdown,
            reward=breakdown.reward,
            outcome="win" if pnl > 0 else ("loss" if pnl < 0 else "flat"),
            features=dict(payload.get("features") or {}),
            context=dict(payload.get("context") or {}),
        )
        self.session.add(row)
        try:
            self.session.flush()
        except IntegrityError:
            self.session.rollback()
            duplicate = self.session.scalar(
                select(LearningExperience).where(LearningExperience.event_id == event_id)
            )
            if duplicate:
                return {"id": duplicate.id, "event_id": event_id, "duplicate": True, "reward": duplicate.reward}
            raise
        return {
            "id": row.id,
            "event_id": event_id,
            "duplicate": False,
            "reward": breakdown.reward,
            "risk_breach": breakdown.risk_breach,
            "drawdown_breach": breakdown.drawdown_breach,
        }

    def performance_summary(
        self,
        strategy_id: str | None = None,
        environment: str | None = None,
    ) -> dict[str, Any]:
        filters = []
        if strategy_id:
            filters.append(LearningExperience.strategy_id == strategy_id)
        if environment:
            filters.append(LearningExperience.environment == environment.lower())
        stmt = select(
            func.count(LearningExperience.id),
            func.coalesce(func.sum(LearningExperience.pnl_pct), 0.0),
            func.coalesce(func.avg(LearningExperience.reward), 0.0),
            func.sum(func.case((LearningExperience.outcome == "win", 1), else_=0)),
        ).where(*filters)
        total, pnl_sum, avg_reward, wins = self.session.execute(stmt).one()
        total = int(total or 0)
        wins = int(wins or 0)
        return {
            "sample_count": total,
            "pnl_pct_sum": round(float(pnl_sum or 0.0), 6),
            "average_reward": round(float(avg_reward or 0.0), 6),
            "win_rate": round(wins / total, 6) if total else None,
            "strategy_id": strategy_id,
            "environment": environment,
        }

    def register_candidate(
        self,
        *,
        model_name: str,
        version: str,
        artifact_uri: str,
        feature_schema_version: str,
        metrics: Mapping[str, Any],
        evaluation_summary: str = "",
    ) -> dict[str, Any]:
        if not all(str(x).strip() for x in (model_name, version, artifact_uri, feature_schema_version)):
            raise LearningValidationError("model identity, artifact URI and feature schema are required")
        required_metrics = ("sample_count", "win_rate", "profit_factor", "max_drawdown_pct")
        missing = [key for key in required_metrics if metrics.get(key) is None]
        if missing:
            raise LearningValidationError(f"Missing evaluation metrics: {', '.join(missing)}")
        normalized = {
            "sample_count": int(metrics["sample_count"]),
            "win_rate": _finite_number("win_rate", metrics["win_rate"]),
            "profit_factor": _finite_number("profit_factor", metrics["profit_factor"]),
            "max_drawdown_pct": _finite_number("max_drawdown_pct", metrics["max_drawdown_pct"]),
        }
        if normalized["sample_count"] < 0 or not 0 <= normalized["win_rate"] <= 1:
            raise LearningValidationError("sample_count or win_rate is outside its valid range")
        if normalized["profit_factor"] < 0 or normalized["max_drawdown_pct"] < 0:
            raise LearningValidationError("profit_factor and max_drawdown_pct cannot be negative")

        row = LearningModelVersion(
            model_name=model_name,
            version=version,
            artifact_uri=artifact_uri,
            feature_schema_version=feature_schema_version,
            metrics=normalized,
            evaluation_summary=evaluation_summary,
            status="candidate",
        )
        self.session.add(row)
        self.session.flush()
        self._audit("learning-service", "candidate_registered", f"{model_name}:{version}", normalized)
        return {"id": row.id, "model_name": model_name, "version": version, "status": row.status}

    def promote_candidate(self, model_id: int, *, approved_by: str) -> dict[str, Any]:
        """Promote only after explicit human approval and strict evaluation gates."""
        if not approved_by or not approved_by.strip():
            raise LearningPromotionDenied("An authenticated approver is required")
        row = self.session.get(LearningModelVersion, model_id)
        if row is None:
            raise LearningValidationError("Model candidate not found")
        if row.status != "candidate":
            raise LearningPromotionDenied(f"Only candidate models can be promoted (status={row.status})")

        metrics = row.metrics or {}
        failures = []
        if int(metrics.get("sample_count", 0)) < self.policy.min_candidate_samples:
            failures.append("insufficient_validation_samples")
        if float(metrics.get("win_rate", 0.0)) < self.policy.min_win_rate:
            failures.append("win_rate_below_threshold")
        if float(metrics.get("profit_factor", 0.0)) < self.policy.min_profit_factor:
            failures.append("profit_factor_below_threshold")
        if float(metrics.get("max_drawdown_pct", float("inf"))) > self.policy.max_validation_drawdown_pct:
            failures.append("validation_drawdown_above_limit")
        if failures:
            self._audit(approved_by, "candidate_promotion_denied", f"{row.model_name}:{row.version}", {"failures": failures})
            raise LearningPromotionDenied(", ".join(failures))

        row.status = "approved"
        row.approved_by = approved_by
        row.approved_at = datetime.now(timezone.utc)
        self._audit(approved_by, "candidate_approved", f"{row.model_name}:{row.version}", metrics)
        return {"id": row.id, "model_name": row.model_name, "version": row.version, "status": row.status,
                "approved_by": approved_by, "live_deployment": False}

    def _audit(self, actor: str, action: str, subject: str, details: Mapping[str, Any]) -> None:
        self.session.add(LearningAuditEvent(
            actor=actor, action=action, subject=subject, details=dict(details)
        ))
