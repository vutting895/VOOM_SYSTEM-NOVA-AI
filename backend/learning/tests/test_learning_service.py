"""Focused unit tests for Learning Engine policy and persistence behavior."""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.learning.api import require_learning_approver
from backend.learning.models import LearningBase, LearningExperience, LearningModelVersion
from backend.learning.service import (
    LearningPolicy, LearningPromotionDenied, LearningService, calculate_reward,
)


def make_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    LearningBase.metadata.create_all(engine)
    return Session(engine)


def sample_payload(event_id="trade-001"):
    return {
        "event_id": event_id, "agent_id": "agent-1", "strategy_id": "strategy-a",
        "symbol": "XAUUSD", "side": "BUY", "entry_price": 2000,
        "exit_price": 2005, "pnl_pct": 1.0, "risk_pct": 1.0,
        "drawdown_pct": 0.5, "environment": "paper",
        "features": {"rsi": 52.0}, "context": {"source": "unit-test"},
    }


def test_reward_penalizes_risk_and_drawdown_breaches():
    result = calculate_reward(2.0, 3.0, 12.0)
    assert result.risk_breach is True
    assert result.drawdown_breach is True
    assert result.reward < result.pnl_component


def test_reward_rejects_negative_risk_and_drawdown():
    with pytest.raises(ValueError):
        calculate_reward(1.0, -0.1, 0.0)
    with pytest.raises(ValueError):
        calculate_reward(1.0, 0.1, -0.1)


def test_record_experience_is_idempotent():
    with make_session() as db:
        service = LearningService(db)
        first = service.record_experience(sample_payload())
        second = service.record_experience(sample_payload())
        assert first["duplicate"] is False
        assert second["duplicate"] is True
        assert db.query(LearningExperience).count() == 1


def test_summary_separates_environment():
    with make_session() as db:
        service = LearningService(db)
        service.record_experience(sample_payload())
        live = sample_payload("trade-002")
        live["environment"] = "live"
        service.record_experience(live)
        db.flush()
        assert service.performance_summary(environment="paper")["sample_count"] == 1
        assert service.performance_summary(environment="live")["sample_count"] == 1


def test_candidate_requires_explicit_approval_and_quality_gates():
    with make_session() as db:
        service = LearningService(db, LearningPolicy(min_candidate_samples=10))
        candidate = service.register_candidate(
            model_name="signal-model", version="0.1.0", artifact_uri="models/candidate.bin",
            feature_schema_version="features-v1",
            metrics={"sample_count": 10, "win_rate": 0.55, "profit_factor": 1.2, "max_drawdown_pct": 4.0},
        )
        row = db.get(LearningModelVersion, candidate["id"])
        assert row.status == "candidate"
        approved = service.promote_candidate(candidate["id"], approved_by="reviewer-1")
        assert approved["status"] == "approved"
        assert approved["live_deployment"] is False


def test_candidate_fails_closed_when_validation_metrics_fail():
    with make_session() as db:
        service = LearningService(db)
        candidate = service.register_candidate(
            model_name="signal-model", version="0.1.1", artifact_uri="models/bad.bin",
            feature_schema_version="features-v1",
            metrics={"sample_count": 5, "win_rate": 0.3, "profit_factor": 0.7, "max_drawdown_pct": 15.0},
        )
        with pytest.raises(LearningPromotionDenied):
            service.promote_candidate(candidate["id"], approved_by="reviewer-1")
        assert db.get(LearningModelVersion, candidate["id"]).status == "candidate"


def test_approval_endpoint_denies_by_default_until_host_rbac_override():
    with pytest.raises(HTTPException) as exc:
        require_learning_approver()
    assert exc.value.status_code == 503
