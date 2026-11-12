"""Versioned NOVA strategy registry validation.

The registry describes research eligibility and evidence. It is not a broker
authorization layer and never grants order or live-trading permissions.
"""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any

CATALOG_SCHEMA = "nova.strategy-catalog.v1"
CATALOG_PATH = Path(__file__).with_name("strategy-catalog.v1.json")
STATUSES = {"research-only", "blocked", "catalog-only"}
OPERATIONS = {"analyze", "simulate"}
SAFETY_KEYS = {
    "research_only", "trade_authorized", "orders_enabled",
    "execution_enabled", "live_trading_enabled",
}


class StrategyCatalogError(ValueError):
    """Raised when the strategy registry is malformed or unsafe."""


def validate_strategy_catalog(catalog: Any) -> bool:
    if not isinstance(catalog, dict) or set(catalog) != {
        "schema_version", "catalog_version", "strategies", "supporting_models"
    }:
        raise StrategyCatalogError("invalid catalog root shape")
    if catalog["schema_version"] != CATALOG_SCHEMA:
        raise StrategyCatalogError("unsupported catalog schema")
    if not isinstance(catalog["catalog_version"], str) or not catalog["catalog_version"]:
        raise StrategyCatalogError("catalog_version must be non-empty")

    strategies = catalog["strategies"]
    if not isinstance(strategies, list) or not strategies:
        raise StrategyCatalogError("strategies must be a non-empty list")
    seen: set[str] = set()
    for item in strategies:
        if not isinstance(item, dict) or set(item) != {
            "id", "version", "status", "engine", "markets", "timeframes",
            "regimes", "operations", "priority", "evidence", "safety",
        }:
            raise StrategyCatalogError("invalid strategy record shape")
        strategy_id = item["id"]
        if not isinstance(strategy_id, str) or not strategy_id or strategy_id in seen:
            raise StrategyCatalogError("strategy IDs must be unique non-empty strings")
        seen.add(strategy_id)
        if item["status"] not in STATUSES:
            raise StrategyCatalogError(f"{strategy_id}: unsupported lifecycle status")
        if not isinstance(item["version"], str) or not item["version"]:
            raise StrategyCatalogError(f"{strategy_id}: version is required")
        if item["engine"] is not None and (
            not isinstance(item["engine"], str) or ":" not in item["engine"]
        ):
            raise StrategyCatalogError(f"{strategy_id}: engine reference is invalid")
        for field in ("markets", "regimes", "operations"):
            if not isinstance(item[field], list) or any(
                not isinstance(value, str) or not value for value in item[field]
            ):
                raise StrategyCatalogError(f"{strategy_id}: {field} must be a string list")
        if not set(item["operations"]).issubset(OPERATIONS):
            raise StrategyCatalogError(f"{strategy_id}: unsupported operation")
        if item["status"] != "research-only" and item["operations"]:
            raise StrategyCatalogError(f"{strategy_id}: blocked/catalog-only strategy cannot run")
        if item["status"] == "research-only" and not item["operations"]:
            raise StrategyCatalogError(f"{strategy_id}: research strategy needs an explicit operation")
        if not isinstance(item["timeframes"], dict) or not item["timeframes"]:
            raise StrategyCatalogError(f"{strategy_id}: timeframes must be a non-empty object")
        if not isinstance(item["priority"], int) or isinstance(item["priority"], bool):
            raise StrategyCatalogError(f"{strategy_id}: priority must be an integer")
        if not isinstance(item["evidence"], dict) or set(item["evidence"]) != {
            "implementation", "performance", "notes"
        }:
            raise StrategyCatalogError(f"{strategy_id}: invalid evidence record")
        if not isinstance(item["safety"], dict) or set(item["safety"]) != SAFETY_KEYS:
            raise StrategyCatalogError(f"{strategy_id}: invalid safety record")
        safety = item["safety"]
        if safety["research_only"] is not True or any(
            safety[key] is not False for key in SAFETY_KEYS - {"research_only"}
        ):
            raise StrategyCatalogError(f"{strategy_id}: unsafe execution flags")

    models = catalog["supporting_models"]
    if not isinstance(models, list):
        raise StrategyCatalogError("supporting_models must be a list")
    model_ids: set[str] = set()
    for model in models:
        if not isinstance(model, dict) or set(model) != {
            "id", "version", "status", "source_status",
            "probability_calibration", "signal_vote_enabled",
        }:
            raise StrategyCatalogError("invalid supporting model record")
        if not isinstance(model["id"], str) or not model["id"] or model["id"] in model_ids:
            raise StrategyCatalogError("supporting model IDs must be unique")
        model_ids.add(model["id"])
        if model["signal_vote_enabled"] is not False:
            raise StrategyCatalogError("supporting model votes are disabled until calibration is verified")
    return True


def load_strategy_catalog(path: str | Path | None = None) -> dict[str, Any]:
    source = Path(path) if path is not None else CATALOG_PATH
    try:
        catalog = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StrategyCatalogError("strategy catalog cannot be loaded") from exc
    validate_strategy_catalog(catalog)
    return catalog


def get_strategy(strategy_id: str, catalog: dict[str, Any] | None = None) -> dict[str, Any] | None:
    data = deepcopy(catalog if catalog is not None else load_strategy_catalog())
    return next((item for item in data["strategies"] if item["id"] == strategy_id), None)
