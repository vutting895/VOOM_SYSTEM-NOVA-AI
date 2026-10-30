"""Strict NOVA strategy catalog and research-run contract validation.

This module is a registry/control contract. It does not execute a strategy,
fetch market data, authorize broker access, or submit orders.
"""
from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import json
from pathlib import Path
import re
from typing import Any

CATALOG_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "data"
    / "nova-strategy-catalog.v1.json"
)
CATALOG_SCHEMA = "nova.strategy-catalog.v1"
SELECTION_SCHEMA = "nova.customer-workspace.v1"
RUN_SCHEMA = "nova.strategy-run.v1"

_ROOT_KEYS = {"schemaVersion", "catalogVersion", "markets", "riskProfiles", "analysisStyles", "strategies"}
_STRATEGY_KEYS = {
    "id", "code", "name", "description", "focus", "markets", "supportedMarkets",
    "defaultMarket", "timeframe", "supportedTimeframes", "strategyVersion", "status",
    "statusLabel", "statusDetail", "researchOperations", "engine", "evidence", "safety",
}
_ENGINE_KEYS = {"id", "state", "sourcePath", "version"}
_EVIDENCE_KEYS = {"implementation", "performance", "notes"}
_SAFETY_KEYS = {"researchOnly", "tradeAuthorized", "orderSubmissionEnabled", "liveTradingEnabled"}
_ALLOWED_STATUSES = {"research-only", "blocked", "catalog-only"}
_ALLOWED_OPERATIONS = {"analyze", "backtest"}
_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class StrategyCatalogError(ValueError):
    """Raised when the shared strategy catalog is malformed or unsafe."""


class StrategyNotRunnableError(StrategyCatalogError):
    """Raised when a strategy is not eligible for the requested research operation."""


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise StrategyCatalogError(f"{field} must be a non-empty string")
    return value


def _validate_options(items: Any, field: str, *, require_detail: bool = False) -> set[str]:
    if not isinstance(items, list) or not items:
        raise StrategyCatalogError(f"{field} must be a non-empty list")
    values: set[str] = set()
    expected_keys = {"value", "label", "detail"} if require_detail else {"value", "label"}
    for index, item in enumerate(items):
        if not isinstance(item, Mapping) or set(item) != expected_keys:
            raise StrategyCatalogError(f"{field}[{index}] has an invalid shape")
        value = _require_string(item.get("value"), f"{field}[{index}].value")
        _require_string(item.get("label"), f"{field}[{index}].label")
        if require_detail:
            _require_string(item.get("detail"), f"{field}[{index}].detail")
        if value in values:
            raise StrategyCatalogError(f"{field} contains duplicate value {value}")
        values.add(value)
    return values


def validate_strategy_catalog(catalog: Any) -> bool:
    """Validate schema, allowlists, engine state and immutable safety invariants."""
    if not isinstance(catalog, Mapping) or set(catalog) != _ROOT_KEYS:
        raise StrategyCatalogError("catalog has an invalid root shape")
    if catalog.get("schemaVersion") != CATALOG_SCHEMA:
        raise StrategyCatalogError("unsupported strategy catalog schema")
    _require_string(catalog.get("catalogVersion"), "catalogVersion")

    markets = _validate_options(catalog.get("markets"), "markets")
    risks = _validate_options(catalog.get("riskProfiles"), "riskProfiles", require_detail=True)
    analyses = _validate_options(catalog.get("analysisStyles"), "analysisStyles")
    strategies = catalog.get("strategies")
    if not isinstance(strategies, list) or not strategies:
        raise StrategyCatalogError("strategies must be a non-empty list")

    seen_ids: set[str] = set()
    for index, strategy in enumerate(strategies):
        prefix = f"strategies[{index}]"
        if not isinstance(strategy, Mapping) or set(strategy) != _STRATEGY_KEYS:
            raise StrategyCatalogError(f"{prefix} has an invalid shape")
        strategy_id = _require_string(strategy.get("id"), f"{prefix}.id")
        if not _ID_PATTERN.fullmatch(strategy_id) or strategy_id in seen_ids:
            raise StrategyCatalogError(f"{prefix}.id must be unique and slug-safe")
        seen_ids.add(strategy_id)

        for field in ("code", "name", "description", "focus", "markets", "timeframe",
                      "strategyVersion", "statusLabel", "statusDetail"):
            _require_string(strategy.get(field), f"{prefix}.{field}")
        if strategy.get("status") not in _ALLOWED_STATUSES:
            raise StrategyCatalogError(f"{prefix}.status is unsupported")

        supported_markets = strategy.get("supportedMarkets")
        supported_timeframes = strategy.get("supportedTimeframes")
        if not isinstance(supported_markets, list) or not supported_markets:
            raise StrategyCatalogError(f"{prefix}.supportedMarkets must be a non-empty list")
        if any(not isinstance(x, str) or x not in markets for x in supported_markets):
            raise StrategyCatalogError(f"{prefix}.supportedMarkets contains an unknown market")
        if len(set(supported_markets)) != len(supported_markets):
            raise StrategyCatalogError(f"{prefix}.supportedMarkets contains duplicates")
        if strategy.get("defaultMarket") not in supported_markets:
            raise StrategyCatalogError(f"{prefix}.defaultMarket must be a supported market")
        if not isinstance(supported_timeframes, list) or not supported_timeframes:
            raise StrategyCatalogError(f"{prefix}.supportedTimeframes must be a non-empty list")
        if any(not isinstance(x, str) or not x.strip() for x in supported_timeframes):
            raise StrategyCatalogError(f"{prefix}.supportedTimeframes contains an invalid value")
        if len(set(supported_timeframes)) != len(supported_timeframes):
            raise StrategyCatalogError(f"{prefix}.supportedTimeframes contains duplicates")

        operations = strategy.get("researchOperations")
        if not isinstance(operations, list) or any(x not in _ALLOWED_OPERATIONS for x in operations):
            raise StrategyCatalogError(f"{prefix}.researchOperations is invalid")
        if len(set(operations)) != len(operations):
            raise StrategyCatalogError(f"{prefix}.researchOperations contains duplicates")

        engine = strategy.get("engine")
        if not isinstance(engine, Mapping) or set(engine) != _ENGINE_KEYS:
            raise StrategyCatalogError(f"{prefix}.engine has an invalid shape")
        for field in ("id", "state", "version"):
            _require_string(engine.get(field), f"{prefix}.engine.{field}")
        source_path = engine.get("sourcePath")
        if source_path is not None and (not isinstance(source_path, str) or source_path.startswith("/") or ".." in Path(source_path).parts):
            raise StrategyCatalogError(f"{prefix}.engine.sourcePath is unsafe")
        if engine["state"] == "implemented":
            if not source_path:
                raise StrategyCatalogError(f"{prefix}.engine.sourcePath is required for implemented engines")
            repo_root = CATALOG_PATH.parents[2]
            if not (repo_root / source_path).is_file():
                raise StrategyCatalogError(f"{prefix}.engine source file is missing")
            if strategy["status"] != "research-only" or not operations:
                raise StrategyCatalogError(f"{prefix}: implemented engine must remain research-only with explicit operations")
        elif operations:
            raise StrategyCatalogError(f"{prefix}: non-implemented engine cannot expose research operations")

        evidence = strategy.get("evidence")
        if not isinstance(evidence, Mapping) or set(evidence) != _EVIDENCE_KEYS:
            raise StrategyCatalogError(f"{prefix}.evidence has an invalid shape")
        for field in _EVIDENCE_KEYS:
            _require_string(evidence.get(field), f"{prefix}.evidence.{field}")

        safety = strategy.get("safety")
        if not isinstance(safety, Mapping) or set(safety) != _SAFETY_KEYS:
            raise StrategyCatalogError(f"{prefix}.safety has an invalid shape")
        if safety.get("researchOnly") is not True:
            raise StrategyCatalogError(f"{prefix}: all catalog strategies must remain research-only")
        for field in ("tradeAuthorized", "orderSubmissionEnabled", "liveTradingEnabled"):
            if safety.get(field) is not False:
                raise StrategyCatalogError(f"{prefix}: {field} must remain false")

    return True


def load_strategy_catalog(path: str | Path | None = None) -> dict[str, Any]:
    """Load and validate the versioned catalog shared with the customer frontend."""
    source = Path(path) if path is not None else CATALOG_PATH
    try:
        catalog = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StrategyCatalogError("strategy catalog could not be loaded") from exc
    validate_strategy_catalog(catalog)
    return catalog


def get_strategy(strategy_id: str, *, catalog: Mapping[str, Any] | None = None) -> dict[str, Any] | None:
    """Return a detached strategy record, or None for an unknown ID."""
    if not isinstance(strategy_id, str):
        return None
    selected_catalog = catalog if catalog is not None else load_strategy_catalog()
    for strategy in selected_catalog["strategies"]:
        if strategy["id"] == strategy_id:
            return deepcopy(dict(strategy))
    return None


def validate_customer_selection(value: Any, *, catalog: Mapping[str, Any] | None = None) -> dict[str, str]:
    """Normalize a customer preference using only catalog-backed values.

    This is preference validation, not identity or tenant authorization.
    The trusted System Hub must inject owner context separately.
    """
    if not isinstance(value, Mapping):
        raise StrategyCatalogError("selection must be an object")
    allowed_keys = {"schemaVersion", "strategyId", "market", "riskProfile", "analysisStyle"}
    if set(value).difference(allowed_keys):
        raise StrategyCatalogError("selection contains unsupported fields")
    schema = value.get("schemaVersion", SELECTION_SCHEMA)
    if schema != SELECTION_SCHEMA:
        raise StrategyCatalogError("unsupported customer selection schema")

    strategy_id = value.get("strategyId")
    if not isinstance(strategy_id, str):
        raise StrategyCatalogError("strategyId must be a string")
    strategy = get_strategy(strategy_id, catalog=catalog)
    if strategy is None:
        raise StrategyCatalogError("unknown strategyId")

    market = value.get("market", strategy["defaultMarket"])
    if not isinstance(market, str) or market not in strategy["supportedMarkets"]:
        raise StrategyCatalogError("market is not supported by the selected strategy")

    selected_catalog = catalog if catalog is not None else load_strategy_catalog()
    risk_values = {item["value"] for item in selected_catalog["riskProfiles"]}
    analysis_values = {item["value"] for item in selected_catalog["analysisStyles"]}
    risk_profile = value.get("riskProfile", "low")
    analysis_style = value.get("analysisStyle", "guided")
    if not isinstance(risk_profile, str) or risk_profile not in risk_values:
        raise StrategyCatalogError("riskProfile is unsupported")
    if not isinstance(analysis_style, str) or analysis_style not in analysis_values:
        raise StrategyCatalogError("analysisStyle is unsupported")

    return {
        "schemaVersion": SELECTION_SCHEMA,
        "strategyId": strategy_id,
        "market": market,
        "riskProfile": risk_profile,
        "analysisStyle": analysis_style,
    }


def build_strategy_run_spec(
    selection: Any,
    operation: str,
    *,
    catalog: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Compile a bounded research request; never grants trading authority."""
    if operation not in _ALLOWED_OPERATIONS:
        raise StrategyNotRunnableError("unsupported research operation")
    normalized = validate_customer_selection(selection, catalog=catalog)
    strategy = get_strategy(normalized["strategyId"], catalog=catalog)
    if strategy is None or operation not in strategy["researchOperations"]:
        raise StrategyNotRunnableError("strategy is not ready for the requested research operation")

    return {
        "schemaVersion": RUN_SCHEMA,
        "strategyId": strategy["id"],
        "strategyVersion": strategy["strategyVersion"],
        "market": normalized["market"],
        "operation": operation,
        "engineId": strategy["engine"]["id"],
        "engineVersion": strategy["engine"]["version"],
        "status": strategy["status"],
        "researchOnly": True,
        "tradeAuthorized": False,
        "executionEnabled": False,
        "orderSubmissionEnabled": False,
        "liveTradingEnabled": False,
    }
