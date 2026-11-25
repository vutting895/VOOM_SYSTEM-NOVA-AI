"""Dependency-free validation for NOVA EA -> Brain read-only events."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Any

_SHA256 = re.compile(r"^[A-Fa-f0-9]{64}$")
_GIT_SHA = re.compile(r"^[A-Fa-f0-9]{40}$")
_FORBIDDEN_KEYS = {
    "account_login", "account_number", "server_name", "password",
    "token", "secret", "api_key", "access_token", "refresh_token",
}
_EVENT_TYPES = {
    "market_snapshot", "signal", "decision", "risk_check",
    "execution_audit", "trade_outcome",
}


class EventValidationError(ValueError):
    """Raised when an event violates the NOVA Brain telemetry contract."""


def _fail(message: str) -> None:
    raise EventValidationError(message)


def _walk_forbidden(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in _FORBIDDEN_KEYS:
                _fail(f"forbidden sensitive field at {path}.{key}")
            _walk_forbidden(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_forbidden(child, f"{path}[{index}]")


def _utc_z(value: Any, field: str) -> None:
    if not isinstance(value, str) or not value.endswith("Z"):
        _fail(f"{field} must be an ISO-8601 UTC timestamp ending in Z")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        _fail(f"{field} is not a valid ISO-8601 timestamp")
    if parsed.utcoffset() is None:
        _fail(f"{field} must include UTC timezone")


def _required_object(event: dict, key: str, required: set[str]) -> dict:
    value = event.get(key)
    if not isinstance(value, dict):
        _fail(f"{key} must be an object")
    missing = required - value.keys()
    if missing:
        _fail(f"{key} missing required fields: {', '.join(sorted(missing))}")
    return value



def _reject_unknown(value: dict, allowed: set[str], field: str) -> None:
    unknown = value.keys() - allowed
    if unknown:
        _fail(f"unknown fields in {field}: {', '.join(sorted(unknown))}")


def validate_event(event: Any) -> dict:
    """Validate and return the same event; raise EventValidationError on failure.

    This validator intentionally checks the safety-critical subset without
    third-party packages. The JSON Schema remains the full interchange contract.
    """
    if not isinstance(event, dict):
        _fail("event must be an object")
    _walk_forbidden(event)

    allowed = {
        "schema_version", "event_id", "event_type", "occurred_at",
        "source", "scope", "market", "signal", "decision", "risk",
        "execution_audit", "outcome",
    }
    unknown = event.keys() - allowed
    if unknown:
        _fail(f"unknown top-level fields: {', '.join(sorted(unknown))}")

    required = {"schema_version", "event_id", "event_type", "occurred_at", "source", "scope"}
    missing = required - event.keys()
    if missing:
        _fail(f"event missing required fields: {', '.join(sorted(missing))}")
    if event["schema_version"] != "1.0":
        _fail("unsupported schema_version")
    if not isinstance(event["event_id"], str) or not re.fullmatch(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}",
        event["event_id"],
    ):
        _fail("event_id must be a UUID")
    if event["event_type"] not in _EVENT_TYPES:
        _fail("unsupported event_type")
    _utc_z(event["occurred_at"], "occurred_at")

    source = _required_object(event, "source", {
        "component", "ea_version", "source_sha256", "repo_commit", "symbol", "timeframe"
    })
    _reject_unknown(source, {"component", "ea_version", "source_sha256", "repo_commit", "symbol", "timeframe", "model_version"}, "source")
    if source["component"] != "mt5_ea":
        _fail("source.component must be mt5_ea")
    if not isinstance(source["source_sha256"], str) or not _SHA256.fullmatch(source["source_sha256"]):
        _fail("source.source_sha256 must be a SHA-256 hex digest")
    if not isinstance(source["repo_commit"], str) or not _GIT_SHA.fullmatch(source["repo_commit"]):
        _fail("source.repo_commit must be a 40-character Git SHA")
    if source["timeframe"] not in {"M1", "M5", "M15", "M30", "H1", "H4", "D1"}:
        _fail("unsupported timeframe")
    if not isinstance(source["symbol"], str) or not source["symbol"]:
        _fail("source.symbol is required")

    scope = _required_object(event, "scope", {"account_scope_hmac", "magic_scope"})
    _reject_unknown(scope, {"account_scope_hmac", "magic_scope"}, "scope")
    if not isinstance(scope["account_scope_hmac"], str) or not _SHA256.fullmatch(scope["account_scope_hmac"]):
        _fail("scope.account_scope_hmac must be an HMAC-SHA-256 pseudonymous scope")
    if not isinstance(scope["magic_scope"], int) or scope["magic_scope"] < 0:
        _fail("scope.magic_scope must be a non-negative integer")

    if event["event_type"] == "signal":
        signal = _required_object(event, "signal", {"strategy", "side", "score"})
        _reject_unknown(signal, {"strategy", "side", "score", "reason_codes", "feature_hash"}, "signal")
        if signal["side"] not in {"BUY", "SELL", "NONE"}:
            _fail("signal.side must be BUY, SELL, or NONE")
        if not isinstance(signal["score"], (int, float)) or not 0 <= signal["score"] <= 1:
            _fail("signal.score must be between 0 and 1")

    if event["event_type"] == "decision":
        decision = _required_object(event, "decision", {"result", "model_version", "reason_codes"})
        _reject_unknown(decision, {"result", "model_version", "reason_codes", "confidence", "feature_hash"}, "decision")
        if decision["result"] not in {"ACCEPT", "REJECT", "ABSTAIN"}:
            _fail("decision.result must be ACCEPT, REJECT, or ABSTAIN")
        if not isinstance(decision["reason_codes"], list) or not decision["reason_codes"]:
            _fail("decision.reason_codes must be a non-empty list")

    if event["event_type"] == "execution_audit":
        audit = _required_object(event, "execution_audit", {
            "mode", "broker_request_attempted", "broker_transport_calls"
        })
        _reject_unknown(audit, {"mode", "broker_request_attempted", "broker_transport_calls", "blocked_mutation_attempts"}, "execution_audit")
        if audit["mode"] != "READ_ONLY" or audit["broker_request_attempted"] is not False:
            _fail("execution audit must be READ_ONLY with no broker request")
        if audit["broker_transport_calls"] != 0:
            _fail("execution audit must report zero broker transport calls")

    if "market" in event:
        market = event["market"]
        if not isinstance(market, dict):
            _fail("market must be an object")
        _reject_unknown(market, {"bid", "ask", "spread_points", "atr", "bar_time_utc", "bar_closed", "data_quality"}, "market")
        if "bar_time_utc" in market:
            _utc_z(market["bar_time_utc"], "market.bar_time_utc")
        if market.get("bar_closed") is False and event["event_type"] in {"signal", "decision"}:
            _fail("signals and decisions must be based on closed bars")

    if "risk" in event:
        risk = event["risk"]
        if not isinstance(risk, dict):
            _fail("risk must be an object")
        _reject_unknown(risk, {"allowed", "account_currency", "proposed_risk_pct", "proposed_risk_money", "open_risk_pct", "position_count", "reason_codes"}, "risk")
    if "outcome" in event:
        outcome = event["outcome"]
        if not isinstance(outcome, dict):
            _fail("outcome must be an object")
        _reject_unknown(outcome, {"closed_volume", "realized_pnl", "commission", "swap", "account_currency", "close_reason", "position_fingerprint"}, "outcome")

    return event
