"""Deprecated compatibility wrapper for the NOVA XGBoost research adapter.

The former implementation generated random funding values, trained and scored
on the same rows, and mislabeled the incomplete future tail. This wrapper
requires timestamped OHLCV and uses chronological purged validation instead.
"""
from __future__ import annotations

from workers.quant_engine.xgboost_data import (
    build_xgboost_samples, fit_xgboost_classifier, split_xgboost_samples,
)


class SupervisedWorker:
    def __init__(self, *, label_horizon_bars: int = 5, seed: int = 42):
        self.label_horizon_bars = label_horizon_bars
        self.seed = seed
        self.model = None
        self.trained = False

    def train(self, frame):
        """Train on chronological OHLCV records; return validation metadata, not accuracy."""
        if not hasattr(frame, "to_dict"):
            raise TypeError("train expects a pandas DataFrame with timestamped OHLCV columns")
        required = {"timestamp", "open", "high", "low", "close", "volume"}
        if not required.issubset(set(frame.columns)):
            raise ValueError("timestamp, open, high, low, close and volume columns are required")
        samples = build_xgboost_samples(
            frame.to_dict(orient="records"),
            label_horizon_bars=self.label_horizon_bars,
        )
        partitions = split_xgboost_samples(
            samples, label_horizon_bars=self.label_horizon_bars,
        )
        self.model = fit_xgboost_classifier(partitions, seed=self.seed)
        self.trained = True
        return {
            "status": "TRAINED_RESEARCH_ONLY",
            "train_samples": len(partitions.train),
            "validation_samples": len(partitions.validation),
            "test_samples": len(partitions.test),
            "purged_samples": len(partitions.purged_indices),
            "best_iteration": getattr(self.model, "best_iteration", None),
            "test_evaluated": False,
            "production_eligible": False,
        }

    def predict(self, features):
        if not self.trained or self.model is None:
            raise RuntimeError("XGBoost model has not been trained")
        if len(features) != 6:
            raise ValueError("features must follow the fixed six-column NOVA XGBoost schema")
        return float(self.model.predict_proba([features])[0][1])


if __name__ == "__main__":
    raise SystemExit(
        "This prototype no longer creates synthetic market data. "
        "Use timestamped, provenance-verified OHLCV through the NOVA research pipeline."
    )
