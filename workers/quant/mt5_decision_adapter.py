"""Adapter for the existing NOVA HybridQuantumQuantEngine.

This is research telemetry only. The returned directional score is not calibrated,
not a trained model output, and never authorizes broker execution.
"""
from __future__ import annotations

from dataclasses import asdict
from functools import lru_cache
from math import isfinite
from typing import Any

from backend.quant_engine import HybridQuantumQuantEngine


FEATURE_KEYS = (
    "price_return_norm",
    "volatility_atr_norm",
    "liquidity_imbalance",
    "momentum_rsi_norm",
)


@lru_cache(maxsize=1)
def _engine() -> HybridQuantumQuantEngine:
    # Fixed seed makes a given code/data request reproducible in this research adapter.
    return HybridQuantumQuantEngine(n_qubits=4, n_layers=3, backend_device="default.qubit", seed=42)


def evaluate_mt5_event(event: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(event, dict) or event.get("schema_version") != "nova.mt5-event.v1":
        raise ValueError("unsupported_mt5_event_contract")
    payload = event.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("event_payload_required")
    features = payload.get("quant_features")
    if not isinstance(features, dict):
        raise ValueError("quant_features_required")

    values: list[float] = []
    for key in FEATURE_KEYS:
        value = features.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError(f"invalid_quant_feature:{key}")
        if value < -1.0 or value > 1.0:
            raise ValueError(f"quant_feature_out_of_range:{key}")
        values.append(float(value))

    telemetry = _engine().forecast_regime_vqc(
        price_return_norm=values[0],
        volatility_atr_norm=values[1],
        liquidity_imbalance=values[2],
        momentum_rsi_norm=values[3],
    )
    output = asdict(telemetry)
    probability = output.get("directional_probability_up")
    if isinstance(probability, bool) or not isinstance(probability, (int, float)) or not 0.0 <= probability <= 1.0:
        raise RuntimeError("quant_engine_returned_invalid_score")

    return {
        "engine": "HybridQuantumQuantEngine",
        "engine_version": "2.0",
        "event_id": event.get("event_id"),
        "module_id": event.get("module_id"),
        "backend": output["backend"],
        "regime_classification": output["regime_classification"],
        "directional_probability_up": probability,
        "telemetry": output,
        "evaluation_status": "research_only",
        "score_calibration": "not_calibrated",
        "trained_model": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
    }
