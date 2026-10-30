"""Hybrid quantum/classical quantitative research engine for NOVA.

Research and sizing only: this module never places orders or enables live trading.
Classical logistic regression is the default. PennyLane VQC is optional/research-only.
Risk sizing requires explicit broker loss metadata and never rounds volume upward.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Optional, Sequence, Tuple

import numpy as np

try:
    import pennylane as qml
    from pennylane import numpy as pnp
    PENNYLANE_AVAILABLE = True
except ImportError:  # Optional dependency
    qml = None
    pnp = None
    PENNYLANE_AVAILABLE = False


class QuantumQuantEngine:
    """Classical-first hybrid regime classifier and fail-closed risk sizer."""

    def __init__(
        self,
        n_qubits: int = 4,
        max_allowed_risk: float = 2.0,
        seed: int = 42,
        classical_l2: float = 1e-3,
    ) -> None:
        if isinstance(n_qubits, bool) or not isinstance(n_qubits, int) or n_qubits < 1:
            raise ValueError("n_qubits must be a positive integer")
        self.max_allowed_risk = self._positive_float(max_allowed_risk, "max_allowed_risk")
        if self.max_allowed_risk > 2.0:
            raise ValueError("max_allowed_risk cannot exceed the hard 2.0% policy cap")
        self.classical_l2 = self._non_negative_float(classical_l2, "classical_l2")
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise ValueError("seed must be an integer")

        self.n_qubits = n_qubits
        self.seed = seed
        self._rng = np.random.default_rng(seed)
        self._classical_feature_mean: Optional[np.ndarray] = None
        self._classical_feature_scale: Optional[np.ndarray] = None
        self._quantum_feature_mean: Optional[np.ndarray] = None
        self._quantum_feature_scale: Optional[np.ndarray] = None
        self._classical_weights: Optional[np.ndarray] = None
        self._quantum_weights: Any = None
        self._quantum_qnode: Any = None
        self._quantum_layers = 2

        if PENNYLANE_AVAILABLE:
            self.dev = qml.device("default.qubit", wires=n_qubits, shots=None)

            @qml.qnode(self.dev, interface="autograd", diff_method="backprop")
            def circuit(weights: Any, features: Any) -> Tuple[Any, ...]:
                # Map the validated, scaled feature vector to qubit rotation angles.
                # The caller/feature contract owns semantic meaning and feature order.
                qml.AngleEmbedding(
                    features=features,
                    wires=range(n_qubits),
                    rotation="Y",
                )
                for layer in range(weights.shape[0]):
                    for wire in range(n_qubits):
                        qml.RY(weights[layer, wire], wires=wire)
                    for wire in range(n_qubits - 1):
                        qml.CNOT(wires=[wire, wire + 1])
                return tuple(qml.expval(qml.PauliZ(wire)) for wire in range(n_qubits))

            self._quantum_qnode = circuit

    @staticmethod
    def _numeric(value: Any, name: str) -> float:
        if isinstance(value, (bool, np.bool_)):
            raise ValueError(f"{name} must be numeric, not boolean")
        try:
            result = float(value)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f"{name} must be a finite number") from exc
        if not math.isfinite(result):
            raise ValueError(f"{name} must be finite")
        return result

    @classmethod
    def _positive_float(cls, value: Any, name: str) -> float:
        result = cls._numeric(value, name)
        if result <= 0:
            raise ValueError(f"{name} must be greater than zero")
        return result

    @classmethod
    def _non_negative_float(cls, value: Any, name: str) -> float:
        result = cls._numeric(value, name)
        if result < 0:
            raise ValueError(f"{name} cannot be negative")
        return result

    def _validate_training_data(
        self, features: Sequence[Sequence[float]], labels: Sequence[Any]
    ) -> Tuple[np.ndarray, np.ndarray]:
        x = np.asarray(features, dtype=float)
        y = np.asarray(labels)
        if x.ndim != 2 or x.shape[1] != self.n_qubits or x.shape[0] < 4:
            raise ValueError(f"features must have shape (n_samples, {self.n_qubits}) with at least 4 rows")
        if not np.isfinite(x).all():
            raise ValueError("features contain NaN or infinite values")
        if y.ndim != 1 or y.shape[0] != x.shape[0]:
            raise ValueError("labels must be a 1-D array matching the feature row count")
        unique = set(np.unique(y).tolist())
        if unique.issubset({0, 1}):
            y01 = y.astype(float)
        elif unique.issubset({-1, 1}):
            y01 = (y.astype(float) + 1.0) / 2.0
        else:
            raise ValueError("labels must contain only {0, 1} or {-1, 1}")
        if len(np.unique(y01)) != 2:
            raise ValueError("training data must contain both classes")
        return x, y01

    def _fit_standardizer(self, x: np.ndarray, *, backend: str = "classical") -> np.ndarray:
        mean = np.mean(x, axis=0)
        scale = np.std(x, axis=0)
        scale = np.where(scale > 1e-12, scale, 1.0)
        if backend == "classical":
            self._classical_feature_mean = mean
            self._classical_feature_scale = scale
        elif backend == "quantum":
            self._quantum_feature_mean = mean
            self._quantum_feature_scale = scale
        else:
            raise ValueError("backend must be 'classical' or 'quantum'")
        return (x - mean) / scale

    def _transform_features(
        self, features: Sequence[float], *, backend: str = "classical"
    ) -> np.ndarray:
        if backend == "classical":
            mean, scale = self._classical_feature_mean, self._classical_feature_scale
        elif backend == "quantum":
            mean, scale = self._quantum_feature_mean, self._quantum_feature_scale
        else:
            raise ValueError("backend must be 'classical' or 'quantum'")
        if mean is None or scale is None:
            raise RuntimeError(f"{backend} model is not trained; call fit() first")
        x = np.asarray(features, dtype=float)
        if x.shape != (self.n_qubits,):
            raise ValueError(f"features must contain exactly {self.n_qubits} values")
        if not np.isfinite(x).all():
            raise ValueError("features contain NaN or infinite values")
        return (x - mean) / scale

    @staticmethod
    def _sigmoid(values: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(values, -35.0, 35.0)))

    def fit_classical(
        self,
        features: Sequence[Sequence[float]],
        labels: Sequence[Any],
        *,
        epochs: int = 800,
        learning_rate: float = 0.05,
    ) -> Dict[str, Any]:
        """Fit a deterministic logistic-regression baseline."""
        x, y = self._validate_training_data(features, labels)
        if isinstance(epochs, bool) or not isinstance(epochs, int) or epochs < 1:
            raise ValueError("epochs must be a positive integer")
        lr = self._positive_float(learning_rate, "learning_rate")
        x_scaled = self._fit_standardizer(x)
        x_aug = np.column_stack((np.ones(len(x_scaled)), x_scaled))
        weights = np.zeros(x_aug.shape[1], dtype=float)
        for _ in range(epochs):
            probabilities = self._sigmoid(x_aug @ weights)
            gradient = (x_aug.T @ (probabilities - y)) / len(y)
            gradient[1:] += self.classical_l2 * weights[1:]
            weights -= lr * gradient
        self._classical_weights = weights
        return {
            "status": "TRAINED",
            "backend": "CLASSICAL_LOGISTIC_REGRESSION",
            "samples": int(len(y)),
            "epochs": epochs,
            "seed": self.seed,
            "training_metric": "not_reported_out_of_sample",
            "warning": "Use a separate chronological validation/test split.",
        }

    def fit_quantum(
        self,
        features: Sequence[Sequence[float]],
        labels: Sequence[Any],
        *,
        epochs: int = 80,
        learning_rate: float = 0.05,
    ) -> Dict[str, Any]:
        """Train an optional PennyLane VQC; research-only."""
        if not PENNYLANE_AVAILABLE or self._quantum_qnode is None:
            raise RuntimeError("PennyLane is not installed")
        x, y01 = self._validate_training_data(features, labels)
        if isinstance(epochs, bool) or not isinstance(epochs, int) or epochs < 1:
            raise ValueError("epochs must be a positive integer")
        lr = self._positive_float(learning_rate, "learning_rate")
        x_scaled = self._fit_standardizer(x, backend="quantum")
        x_angles = np.tanh(x_scaled) * math.pi
        y_signed = y01 * 2.0 - 1.0
        initial = self._rng.normal(0.0, 0.1, size=(self._quantum_layers, self.n_qubits))
        weights = pnp.array(initial, requires_grad=True)
        x_pl = [pnp.array(row, requires_grad=False) for row in x_angles]
        y_pl = pnp.array(y_signed, requires_grad=False)

        def objective(candidate: Any) -> Any:
            outputs = []
            for row in x_pl:
                measurements = self._quantum_qnode(candidate, row)
                outputs.append(pnp.mean(pnp.stack(measurements)))
            return pnp.mean((pnp.stack(outputs) - y_pl) ** 2)

        optimizer = qml.AdamOptimizer(stepsize=lr)
        for _ in range(epochs):
            weights = optimizer.step(objective, weights)
        self._quantum_weights = np.asarray(weights, dtype=float)
        return {
            "status": "TRAINED",
            "backend": "PENNYLANE_VQC_DEFAULT_QUBIT",
            "samples": int(len(y01)),
            "epochs": epochs,
            "qubits": self.n_qubits,
            "layers": self._quantum_layers,
            "seed": self.seed,
            "training_metric": "not_reported_out_of_sample",
            "warning": "Simulator training is not evidence of quantum advantage.",
        }

    def fit(
        self,
        features: Sequence[Sequence[float]],
        labels: Sequence[Any],
        *,
        backend: str = "classical",
        epochs: int = 800,
        learning_rate: float = 0.05,
    ) -> Dict[str, Any]:
        """Fit the selected backend; classical is the production default."""
        if not isinstance(backend, str):
            raise ValueError("backend must be a string")
        selected = backend.strip().lower()
        if selected == "classical":
            return self.fit_classical(features, labels, epochs=epochs, learning_rate=learning_rate)
        if selected == "quantum":
            if not PENNYLANE_AVAILABLE:
                result = self.fit_classical(features, labels, epochs=epochs, learning_rate=learning_rate)
                return {
                    **result,
                    "status": "FALLBACK_CLASSICAL",
                    "requested_backend": "quantum",
                    "fallback_reason": "PennyLane is not installed",
                }
            return self.fit_quantum(
                features, labels, epochs=min(epochs, 200), learning_rate=learning_rate
            )
        raise ValueError("backend must be 'classical' or 'quantum'")

    def run_quantum_regime_forecast(
        self,
        symbol: str,
        timeframe: str,
        features: Optional[Sequence[float]] = None,
        *,
        backend: str = "classical",
        neutral_band: float = 0.05,
    ) -> Dict[str, Any]:
        """Forecast using real input features; no synthetic sample is generated."""
        if not isinstance(symbol, str) or not symbol.strip():
            return {"status": "INVALID_INPUT", "reason": "symbol_required"}
        if not isinstance(timeframe, str) or not timeframe.strip():
            return {"status": "INVALID_INPUT", "reason": "timeframe_required"}
        if features is None:
            return {
                "status": "FEATURES_REQUIRED",
                "symbol": symbol,
                "timeframe": timeframe,
                "predicted_regime": "UNAVAILABLE",
                "message": "Supply a validated feature vector; synthetic values are not used.",
            }
        if not isinstance(backend, str):
            return {"status": "INVALID_INPUT", "reason": "backend_must_be_a_string"}
        requested = backend.strip().lower()
        if requested not in {"classical", "quantum", "auto"}:
            return {"status": "INVALID_INPUT", "reason": "unsupported_backend"}

        use_quantum = requested == "quantum" and self._quantum_weights is not None
        fallback_reason = None
        if requested == "quantum" and not use_quantum:
            fallback_reason = "PennyLane unavailable" if not PENNYLANE_AVAILABLE else "VQC not trained"
        if requested == "auto":
            use_quantum = False  # Deliberately prefer the trained classical baseline.

        try:
            x_scaled = self._transform_features(
                features, backend="quantum" if use_quantum else "classical"
            )
            band = self._non_negative_float(neutral_band, "neutral_band")
        except (ValueError, RuntimeError) as exc:
            return {
                "status": "MODEL_NOT_READY" if isinstance(exc, RuntimeError) else "INVALID_INPUT",
                "symbol": symbol,
                "timeframe": timeframe,
                "predicted_regime": "UNAVAILABLE",
                "reason": str(exc),
            }

        if use_quantum:
            angles = np.tanh(x_scaled) * math.pi
            measured = self._quantum_qnode(
                pnp.array(self._quantum_weights, requires_grad=False),
                pnp.array(angles, requires_grad=False),
            )
            expectation_by_wire = [
                float(value) for value in np.asarray(measured, dtype=float).reshape(-1)
            ]
            expectation = float(np.mean(expectation_by_wire))
            bullish_probability = float(np.clip((expectation + 1.0) / 2.0, 0.0, 1.0))
            model_backend = "PENNYLANE_VQC"
        else:
            if self._classical_weights is None:
                return {
                    "status": "MODEL_NOT_TRAINED",
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "predicted_regime": "UNAVAILABLE",
                    "requested_backend": requested,
                    "message": "Train a classifier with labelled historical data first.",
                }
            augmented = np.concatenate(([1.0], x_scaled))
            bullish_probability = float(self._sigmoid(
                np.asarray([augmented @ self._classical_weights])
            )[0])
            expectation = 2.0 * bullish_probability - 1.0
            model_backend = "CLASSICAL_LOGISTIC_REGRESSION"

        regime = "BULLISH_MSS" if expectation > band else (
            "BEARISH_MSS" if expectation < -band else "NEUTRAL"
        )
        result = {
            "status": "FORECAST_READY",
            "symbol": symbol,
            "timeframe": timeframe,
            "predicted_regime": regime,
            "regime_score": round(expectation, 6),
            "bullish_probability": round(bullish_probability, 6),
            "model_backend": model_backend,
            "qubits_allocated": self.n_qubits if use_quantum else 0,
            "quantum_circuit_status": "EXECUTED" if use_quantum else "NOT_USED",
            "trading_action": "NONE",
            "live_trading_enabled": False,
        }
        if use_quantum:
            # Preserve the aggregate score and the per-wire measurements for auditability.
            result["quantum_expectation_value"] = round(expectation, 6)
            result["quantum_expectation_by_wire"] = [
                round(value, 6) for value in expectation_by_wire
            ]
        if fallback_reason:
            result["fallback_reason"] = fallback_reason
        return result

    def run_risk_filter(
        self, symbol: str, account_balance: float, stop_loss_pips: float = 100.0,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Calculate a volume estimate only; never submit orders.

        Provide exactly one of:
        - loss_per_lot_account_ccy: broker-calculated one-lot stop loss in account currency.
        - pip_value_per_lot: explicit pip value already in account currency.

        Explicit account currency and broker min/max/step volume metadata are required.
        """
        return self._calculate_risk_size(
            symbol=symbol, account_balance=account_balance,
            stop_loss_pips=stop_loss_pips, **kwargs,
        )

    def run_qaoa_risk_filter(
        self, symbol: str, account_balance: float, stop_loss_pips: float = 100.0,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Backward-compatible alias; this method does not run QAOA or QUBO."""
        result = self._calculate_risk_size(
            symbol=symbol, account_balance=account_balance,
            stop_loss_pips=stop_loss_pips, **kwargs,
        )
        result["legacy_method_name"] = "run_qaoa_risk_filter"
        result["quantum_optimizer"] = "NOT_USED_CLASSICAL_RISK_GUARD"
        result["optimizer_note"] = "Classical arithmetic sizing only; no QAOA/QUBO solver ran."
        return result

    def _calculate_risk_size(
        self, *, symbol: str, account_balance: float, stop_loss_pips: float,
        pip_value_per_lot: Optional[float] = None,
        loss_per_lot_account_ccy: Optional[float] = None,
        risk_percent: Optional[float] = None,
        account_currency: Optional[str] = None,
        pip_value_currency: Optional[str] = None,
        min_volume: Optional[float] = None,
        max_volume: Optional[float] = None,
        volume_step: Optional[float] = None,
    ) -> Dict[str, Any]:
        base = {
            "symbol": symbol if isinstance(symbol, str) else "",
            "recommended_action": "NO_TRADE",
            "calculated_volume_lots": 0.0,
            "applied_risk_percent": None,
            "risk_usd": None,
            "estimated_stop_loss_account_ccy": 0.0,
            "status": "REJECTED",
            "live_trading_enabled": False,
            "order_submission_enabled": False,
        }

        def reject(code: str, message: str) -> Dict[str, Any]:
            return {**base, "status": "REJECTED", "reason_code": code, "message": message}

        if not isinstance(symbol, str) or not symbol.strip():
            return reject("INVALID_SYMBOL", "A non-empty broker symbol is required.")
        try:
            balance = self._positive_float(account_balance, "account_balance")
            stop_pips = self._positive_float(stop_loss_pips, "stop_loss_pips")
            requested_risk = (
                self.max_allowed_risk if risk_percent is None
                else self._positive_float(risk_percent, "risk_percent")
            )
        except ValueError as exc:
            return reject("INVALID_NUMERIC_INPUT", str(exc))
        if requested_risk > self.max_allowed_risk or requested_risk > 2.0:
            return reject(
                "RISK_LIMIT_EXCEEDED",
                f"Requested risk {requested_risk:.4f}% exceeds hard cap {self.max_allowed_risk:.4f}%.",
            )
        if (pip_value_per_lot is None) == (loss_per_lot_account_ccy is None):
            return reject(
                "MISSING_OR_AMBIGUOUS_LOSS_METADATA",
                "Supply exactly one of loss_per_lot_account_ccy or pip_value_per_lot.",
            )
        if not isinstance(account_currency, str) or not account_currency.strip():
            return reject("MISSING_ACCOUNT_CURRENCY", "Explicit account_currency metadata is required.")
        if pip_value_per_lot is not None and (
            not isinstance(pip_value_currency, str) or not pip_value_currency.strip()
        ):
            return reject("MISSING_PIP_VALUE_CURRENCY", "pip_value_currency is required for pip-value sizing.")
        if pip_value_currency and account_currency and pip_value_currency.upper() != account_currency.upper():
            return reject(
                "PIP_VALUE_CURRENCY_MISMATCH",
                "pip_value_per_lot must be in account currency; use broker-calculated loss otherwise.",
            )

        try:
            if loss_per_lot_account_ccy is not None:
                loss_per_lot = self._positive_float(
                    loss_per_lot_account_ccy, "loss_per_lot_account_ccy"
                )
                loss_source = "BROKER_CALCULATED_ACCOUNT_CURRENCY_LOSS_PER_LOT"
            else:
                pip_value = self._positive_float(pip_value_per_lot, "pip_value_per_lot")
                loss_per_lot = stop_pips * pip_value
                loss_source = "EXPLICIT_ACCOUNT_CURRENCY_PIP_VALUE"
            minimum = self._positive_float(min_volume, "min_volume")
            maximum = self._positive_float(max_volume, "max_volume")
            step = self._positive_float(volume_step, "volume_step")
        except ValueError as exc:
            return reject("MISSING_OR_INVALID_BROKER_METADATA", str(exc))

        if minimum > maximum:
            return reject("INVALID_VOLUME_CONSTRAINTS", "min_volume cannot exceed max_volume.")
        if not math.isclose(minimum / step, round(minimum / step), rel_tol=0.0, abs_tol=1e-8):
            return reject("INVALID_VOLUME_CONSTRAINTS", "min_volume must align with volume_step.")

        risk_budget = balance * (requested_risk / 100.0)
        raw_volume = risk_budget / loss_per_lot
        bounded_volume = min(raw_volume, maximum)
        steps = math.floor((bounded_volume / step) + 1e-10)
        volume = round(steps * step, 10)
        if volume + 1e-10 < minimum:
            return {
                **base,
                "reason_code": "BELOW_MIN_VOLUME",
                "message": "Safe size is below broker minimum; volume is not rounded upward.",
                "applied_risk_percent": requested_risk,
                "risk_budget_account_ccy": round(risk_budget, 8),
                "loss_per_lot_account_ccy": round(loss_per_lot, 8),
                "loss_metadata_source": loss_source,
                "account_currency": account_currency,
            }

        estimated_loss = volume * loss_per_lot
        while volume > 0 and estimated_loss > risk_budget:
            steps -= 1
            volume = round(max(0, steps) * step, 10)
            estimated_loss = volume * loss_per_lot
        if volume + 1e-10 < minimum or volume <= 0:
            return reject("BELOW_MIN_VOLUME", "No valid broker volume fits the hard risk budget.")

        capped = raw_volume > maximum
        return {
            **base,
            "status": "SIZED_ONLY_NO_ORDER",
            "reason_code": "VOLUME_CAPPED_AT_BROKER_MAX" if capped else "RISK_SIZE_VALID",
            "calculated_volume_lots": volume,
            "applied_risk_percent": requested_risk,
            "risk_usd": round(risk_budget, 8) if account_currency.upper() == "USD" else None,
            "risk_budget_account_ccy": round(risk_budget, 8),
            "estimated_stop_loss_account_ccy": round(estimated_loss, 8),
            "loss_per_lot_account_ccy": round(loss_per_lot, 8),
            "loss_metadata_source": loss_source,
            "account_currency": account_currency,
            "volume_constraints": {
                "min_volume": minimum, "max_volume": maximum, "volume_step": step,
            },
            "risk_utilization_percent": round((estimated_loss / balance) * 100.0, 6),
            "qaoa_executed": False,
            "live_trading_enabled": False,
            "order_submission_enabled": False,
            "message": "Sizing only. No BUY/SELL direction or broker order is authorized.",
        }


quant_engine = QuantumQuantEngine()

__all__ = ["PENNYLANE_AVAILABLE", "QuantumQuantEngine", "quant_engine"]
