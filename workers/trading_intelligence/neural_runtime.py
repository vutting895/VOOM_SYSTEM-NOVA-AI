"""Research-only PyTorch LSTM runtime for NOVA Trading Intelligence.

This module trains a per-symbol/timeframe candidate from finalized OHLCV bars.
It deliberately does not evaluate or read the reserved final holdout, publish a
validated model, connect to a broker, or create executable trading signals.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import math
import random
from datetime import datetime, timezone
from typing import Any, Iterable

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

SCHEMA_VERSION = "nova.lstm-candidate.v1"
FEATURES = (
    "log_return_1", "log_return_3", "realized_vol_10", "rsi_14",
    "ema_gap_12_26", "volume_zscore_20", "candle_body", "candle_range",
)
TIMEFRAME_SECONDS = {
    "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
    "H1": 3600, "H4": 14400, "D1": 86400,
}


def _timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("timestamp must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("timestamp must be valid ISO-8601") from None
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def validate_ohlcv(rows: Iterable[dict[str, Any]], timeframe: str) -> list[dict[str, Any]]:
    """Validate complete, chronological OHLCV bars; reject gaps and duplicates."""
    if timeframe not in TIMEFRAME_SECONDS:
        raise ValueError("unsupported timeframe")
    if not isinstance(rows, (list, tuple)) or len(rows) < 80:
        raise ValueError("at least 80 finalized OHLCV bars are required")
    output: list[dict[str, Any]] = []
    previous = None
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"bar {index} must be an object")
        timestamp = _timestamp(row.get("time"))
        values = {}
        for key in ("open", "high", "low", "close", "volume"):
            try:
                values[key] = float(row[key])
            except (KeyError, TypeError, ValueError):
                raise ValueError(f"bar {index} has invalid {key}") from None
            if not math.isfinite(values[key]):
                raise ValueError(f"bar {index} has non-finite {key}")
        o, h, low, close, volume = (values[k] for k in ("open", "high", "low", "close", "volume"))
        if low <= 0 or volume < 0 or h < max(o, close, low) or low > min(o, close):
            raise ValueError(f"bar {index} has impossible OHLCV bounds")
        if previous is not None:
            delta = (timestamp - previous).total_seconds()
            if delta <= 0:
                raise ValueError("timestamps must be strictly increasing without duplicates")
            if delta != TIMEFRAME_SECONDS[timeframe]:
                raise ValueError("missing or irregular candle interval; quarantine this dataset")
        previous = timestamp
        output.append({"time": timestamp.isoformat().replace("+00:00", "Z"), **values})
    return output


def _rolling_mean(values: np.ndarray, window: int) -> np.ndarray:
    result = np.full(len(values), np.nan, dtype=np.float64)
    if len(values) >= window:
        sums = np.cumsum(np.insert(values, 0, 0.0))
        result[window - 1:] = (sums[window:] - sums[:-window]) / window
    return result


def build_causal_features(rows: list[dict[str, Any]]) -> tuple[np.ndarray, list[str]]:
    """Build features using current and historical bars only (no future values)."""
    close = np.asarray([r["close"] for r in rows], dtype=np.float64)
    high = np.asarray([r["high"] for r in rows], dtype=np.float64)
    low = np.asarray([r["low"] for r in rows], dtype=np.float64)
    open_ = np.asarray([r["open"] for r in rows], dtype=np.float64)
    volume = np.asarray([r["volume"] for r in rows], dtype=np.float64)
    log_close = np.log(close)
    ret1 = np.diff(log_close, prepend=np.nan)
    ret3 = np.concatenate((np.full(3, np.nan), log_close[3:] - log_close[:-3]))
    vol10 = np.full(len(close), np.nan)
    for i in range(10, len(close)):
        vol10[i] = float(np.std(ret1[i - 9:i + 1], ddof=0))
    delta = np.diff(close, prepend=np.nan)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_gain = _rolling_mean(gain, 14)
    avg_loss = _rolling_mean(loss, 14)
    rs = np.divide(avg_gain, avg_loss, out=np.full_like(avg_gain, np.inf), where=avg_loss > 0)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    rsi[(avg_loss == 0) & (avg_gain == 0)] = 50.0
    rsi[(avg_loss == 0) & (avg_gain > 0)] = 100.0
    ema12 = np.full(len(close), np.nan)
    ema26 = np.full(len(close), np.nan)
    alpha12, alpha26 = 2 / 13, 2 / 27
    ema12[0] = close[0]
    ema26[0] = close[0]
    for i in range(1, len(close)):
        ema12[i] = alpha12 * close[i] + (1 - alpha12) * ema12[i - 1]
        ema26[i] = alpha26 * close[i] + (1 - alpha26) * ema26[i - 1]
    ema_gap = (ema12 - ema26) / close
    vol_mean = _rolling_mean(volume, 20)
    vol_std = np.full(len(volume), np.nan)
    for i in range(19, len(volume)):
        vol_std[i] = float(np.std(volume[i - 19:i + 1], ddof=0))
    vol_z = np.divide(volume - vol_mean, vol_std, out=np.zeros_like(volume), where=vol_std > 0)
    body = (close - open_) / close
    candle_range = (high - low) / close
    features = np.column_stack((ret1, ret3, vol10, rsi / 100.0, ema_gap, vol_z, body, candle_range))
    finite_rows = np.isfinite(features).all(axis=1)
    return features.astype(np.float32), np.flatnonzero(finite_rows).tolist()


class LSTMRegimeModel(nn.Module):
    """Small unidirectional LSTM: future candles are never inputs."""
    def __init__(self, input_size: int = len(FEATURES), hidden_size: int = 32, layers: int = 1, dropout: float = 0.0):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size, hidden_size=hidden_size, num_layers=layers,
            batch_first=True, dropout=dropout if layers > 1 else 0.0, bidirectional=False,
        )
        self.head = nn.Sequential(nn.LayerNorm(hidden_size), nn.Linear(hidden_size, 3))

    def forward(self, sequence: torch.Tensor) -> torch.Tensor:
        output, _ = self.lstm(sequence)
        return self.head(output[:, -1, :])


def chronological_windows(sample_indices: list[int], horizon: int, sequence_length: int, n_bars: int) -> dict[str, list[int]]:
    """Create train/validation/reserved-holdout sample end indices with purge gaps."""
    if horizon < 1 or sequence_length < 8:
        raise ValueError("horizon must be positive and sequence_length at least 8")
    train_cut = int(n_bars * 0.70)
    validation_cut = int(n_bars * 0.85)
    train = [i for i in sample_indices if i + horizon < train_cut]
    validation = [i for i in sample_indices if i >= train_cut + horizon and i + horizon < validation_cut]
    # Final OOS indices are deliberately described, not consumed by candidate fitting.
    final_oos = [i for i in sample_indices if i >= validation_cut + horizon and i + horizon < n_bars]
    if len(train) < 20 or len(validation) < 10 or len(final_oos) < 10:
        raise ValueError("insufficient history for purged chronological train/validation/final-OOS partitions")
    return {"train": train, "validation": validation, "final_oos_reserved": final_oos}


def _canonical_hash(rows: list[dict[str, Any]]) -> str:
    payload = json.dumps(rows, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(payload).hexdigest()


def train_candidate(
    rows: Iterable[dict[str, Any]], symbol: str, timeframe: str,
    sequence_length: int = 32, horizon: int = 3, epochs: int = 12,
    hidden_size: int = 32, seed: int = 42,
) -> tuple[bytes, dict[str, Any]]:
    """Train a research candidate; do not evaluate or touch final OOS outcomes."""
    if not isinstance(symbol, str) or not symbol.strip() or len(symbol) > 40:
        raise ValueError("symbol is required")
    if not 8 <= sequence_length <= 256 or not 1 <= horizon <= 24 or not 1 <= epochs <= 100:
        raise ValueError("training parameters are outside safe bounds")
    bars = validate_ohlcv(rows, timeframe)
    features, valid_indices = build_causal_features(bars)
    index_set = set(valid_indices)
    sample_indices = [
        i for i in range(sequence_length - 1, len(bars) - horizon)
        if all(j in index_set for j in range(i - sequence_length + 1, i + 1))
    ]
    partitions = chronological_windows(sample_indices, horizon, sequence_length, len(bars))
    close = np.asarray([r["close"] for r in bars], dtype=np.float64)

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(1)
    model = LSTMRegimeModel(hidden_size=hidden_size)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.0001)
    loss_fn = nn.CrossEntropyLoss()

    def tensors(indices: list[int]) -> tuple[torch.Tensor, torch.Tensor]:
        # Access labels only for the requested train/validation indices.
        # final_oos_reserved indices are never passed to this function.
        x = np.stack([features[i - sequence_length + 1:i + 1] for i in indices])
        forward_returns = np.log(close[np.asarray(indices) + horizon] / close[np.asarray(indices)])
        y = np.where(forward_returns > 0.0002, 0, np.where(forward_returns < -0.0002, 1, 2)).astype(np.int64)
        return torch.tensor(x, dtype=torch.float32), torch.tensor(y, dtype=torch.long)

    train_x, train_y = tensors(partitions["train"])
    val_x, val_y = tensors(partitions["validation"])
    # Fit normalization on training sequences only; never estimate it from validation or holdout.
    feature_mean = train_x.mean(dim=(0, 1))
    feature_std = train_x.std(dim=(0, 1), unbiased=False).clamp_min(1e-6)
    train_x = (train_x - feature_mean) / feature_std
    val_x = (val_x - feature_mean) / feature_std
    loader = DataLoader(TensorDataset(train_x, train_y), batch_size=32, shuffle=True, generator=torch.Generator().manual_seed(seed))
    best_loss = float("inf")
    best_state = None
    best_epoch = 0
    for epoch in range(epochs):
        model.train()
        for batch_x, batch_y in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(batch_x), batch_y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
        model.eval()
        with torch.no_grad():
            validation_loss = float(loss_fn(model(val_x), val_y).item())
        if validation_loss < best_loss:
            best_loss = validation_loss
            best_epoch = epoch + 1
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    if best_state is None:
        raise RuntimeError("candidate training did not produce a model state")
    model.load_state_dict(best_state)
    model.eval()

    feature_manifest = {
        "schema": "nova.ohlcv.features.v1",
        "features": list(FEATURES),
        "sequence_length": sequence_length,
        "horizon": horizon,
        "label_definition": "log_return_horizon > 2bps bullish; < -2bps bearish; otherwise sideways",
        "uses_future_features": False,
    }
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "model": {"id": "nova-lstm-regime", "version": "0.1.0-candidate", "runtime": "pytorch", "status": "research_candidate"},
        "data": {
            "symbol": symbol.strip(), "timeframe": timeframe,
            "datasetSha256": _canonical_hash(bars),
            "featureManifestSha256": hashlib.sha256(json.dumps(feature_manifest, sort_keys=True).encode()).hexdigest(),
            "barsUsed": len(bars), "firstBarAt": bars[0]["time"], "lastClosedBarAt": bars[-1]["time"],
        },
        "training": {
            "seed": seed, "epochsRequested": epochs, "bestEpoch": best_epoch,
            "bestValidationCrossEntropy": best_loss, "trainSamples": len(partitions["train"]),
            "validationSamples": len(partitions["validation"]), "finalOosSamplesReserved": len(partitions["final_oos_reserved"]),
            "finalOosFirstDecisionAt": bars[partitions["final_oos_reserved"][0]]["time"],
            "finalOosLastTargetAt": bars[partitions["final_oos_reserved"][-1] + horizon]["time"],
            "finalOosBarsSha256": _canonical_hash(bars[partitions["final_oos_reserved"][0]:]),
            "finalOosTouched": False,
        },
        "featureManifest": {
            **feature_manifest,
            "normalization": {
                "mean": feature_mean.tolist(),
                "std": feature_std.tolist(),
                "fittedOn": "training_partition_only",
            },
        },
        "evaluation": {"status": "not_evaluated", "finalOosStatus": "reserved_untouched", "promotable": False},
        "safety": {"executionEnabled": False, "liveTradingEnabled": False, "ordersEnabled": False},
    }
    buffer = io.BytesIO()
    torch.save({
        "manifest": manifest,
        "model_state": model.state_dict(),
        "model_config": {"input_size": len(FEATURES), "hidden_size": hidden_size, "layers": 1},
    }, buffer)
    artifact = buffer.getvalue()
    manifest["model"]["artifactSha256"] = hashlib.sha256(artifact).hexdigest()
    return artifact, manifest


def load_candidate(artifact: bytes, expected_sha256: str, expected_symbol: str, expected_timeframe: str) -> tuple[LSTMRegimeModel, dict[str, Any]]:
    """Load only hash-matched research candidates; never promote them implicitly."""
    digest = hashlib.sha256(artifact).hexdigest()
    if not isinstance(expected_sha256, str) or not hmac.compare_digest(digest, expected_sha256):
        raise ValueError("model artifact SHA-256 mismatch")
    payload = torch.load(io.BytesIO(artifact), map_location="cpu", weights_only=True)
    manifest = payload["manifest"]
    if manifest.get("schemaVersion") != SCHEMA_VERSION or manifest["model"]["status"] != "research_candidate":
        raise ValueError("unsupported or untrusted model lifecycle state")
    if manifest["data"]["symbol"] != expected_symbol or manifest["data"]["timeframe"] != expected_timeframe:
        raise ValueError("model symbol/timeframe does not match requested market")
    model = LSTMRegimeModel(**payload["model_config"])
    model.load_state_dict(payload["model_state"], strict=True)
    model.eval()
    return model, manifest


def infer_research_candidate(
    artifact: bytes, expected_sha256: str, rows: Iterable[dict[str, Any]],
    symbol: str, timeframe: str,
) -> dict[str, Any]:
    """Return a shadow-only regime estimate from a hash-verified candidate."""
    bars = validate_ohlcv(rows, timeframe)
    model, manifest = load_candidate(artifact, expected_sha256, symbol, timeframe)
    if bars[-1]["time"] <= manifest["data"]["lastClosedBarAt"]:
        raise ValueError("inference data must advance beyond the candidate training snapshot")
    features, valid = build_causal_features(bars)
    sequence_length = manifest["featureManifest"]["sequence_length"]
    usable = [i for i in valid if i >= sequence_length - 1]
    if not usable:
        raise ValueError("not enough valid causal features for inference")
    end = usable[-1]
    sequence = torch.tensor(features[end - sequence_length + 1:end + 1][None, :, :], dtype=torch.float32)
    normalization = manifest["featureManifest"]["normalization"]
    mean = torch.tensor(normalization["mean"], dtype=torch.float32)
    std = torch.tensor(normalization["std"], dtype=torch.float32)
    sequence = (sequence - mean) / std
    with torch.no_grad():
        probabilities = torch.softmax(model(sequence), dim=-1)[0].cpu().numpy()
    probabilities = probabilities / probabilities.sum()
    entropy = float(-np.sum(probabilities * np.log(np.clip(probabilities, 1e-12, 1.0))) / math.log(3))
    names = ("bullish", "bearish", "sideways")
    return {
        "schemaVersion": "nova.neural-research-output.v1",
        "model": {"id": manifest["model"]["id"], "version": manifest["model"]["version"], "artifactSha256": expected_sha256, "status": "research_candidate"},
        "data": {"symbol": symbol, "timeframe": timeframe, "datasetSha256": _canonical_hash(bars), "lastClosedBarAt": bars[end]["time"], "barsUsed": len(bars)},
        "output": {"regime": names[int(np.argmax(probabilities))], "probabilities": dict(zip(names, map(float, probabilities))), "uncertainty": {"score": entropy, "method": "predictive_entropy"}, "generatedAt": datetime.now(timezone.utc).isoformat()},
        "evaluationStatus": "not_evaluated",
        "researchOnly": True,
        "executionEnabled": False,
        "liveTradingEnabled": False,
        "ordersEnabled": False,
    }
