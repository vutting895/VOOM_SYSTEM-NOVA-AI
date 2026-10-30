# NOVA Quantum Quant Engine

Status: **research-only Python module; not connected to production workers, broker routes, or order execution.**

## Responsibility and boundaries

- Trains an in-memory classical logistic-regression regime baseline.
- Optionally trains a PennyLane Variational Quantum Circuit (VQC) for controlled research experiments.
- Keeps classical and quantum preprocessing statistics separate.
- Calculates an advisory position-size estimate only when explicit account-currency loss metadata and broker volume constraints are supplied.
- Does not fetch market data, generate features, persist model artifacts, authorize a trade, or submit broker orders.
- Does not implement QAOA/QUBO. The legacy `run_qaoa_risk_filter` name is only a compatibility alias for classical arithmetic risk sizing.

This module is not a replacement for `workers/risk/`. The Risk Worker remains the intended independent, fail-closed policy boundary. The quant engine's sizing result must be treated as advisory and passed through the authoritative risk policy before any future paper-trading workflow.

## Runtime placement

This is a Python module. It is not a Cloudflare Worker and is not imported by the deployed Remote MCP Worker. The Remote MCP Worker remains a stateless TypeScript/JavaScript service; do not try to import this package into that runtime.

The module is intentionally isolated under `workers/quantum/` until:
1. `workers/feature/` defines a versioned, point-in-time feature contract and supplies the exact four-feature vector plus schema/version and source timestamp.
2. The Python Agent runtime and its deployment location are identified and tested.
3. A bounded, authenticated adapter is designed if the model is exposed through MCP or another service.
4. `workers/risk/` remains the independent authority for account-level exposure, leverage, drawdown, stale-data and per-account limits.
5. Integration tests prove tenant isolation, data freshness, risk-policy enforcement and no order side effects.

## Installation

Base classifier and risk sizing require NumPy:

```bash
python -m pip install "numpy>=2.0,<3.0"
```

PennyLane is optional and required only for VQC training/simulation:

```bash
python -m pip install "pennylane>=0.40"
```

## Minimal research usage

```python
import numpy as np
from workers.quantum import QuantumQuantEngine

engine = QuantumQuantEngine(n_qubits=4, seed=42)

# Replace this toy sample with versioned, point-in-time NOVA features and labels.
x_train = np.asarray([
    [-1.0, -0.8, -0.9, -0.7],
    [-0.8, -0.7, -0.6, -0.9],
    [-0.7, -0.9, -0.8, -0.6],
    [-0.9, -0.6, -0.7, -0.8],
    [ 0.7,  0.8,  0.9,  0.6],
    [ 0.8,  0.7,  0.6,  0.9],
    [ 0.9,  0.9,  0.8,  0.7],
    [ 0.6,  0.9,  0.7,  0.8],
])
y_train = np.asarray([0, 0, 0, 0, 1, 1, 1, 1])

engine.fit(x_train, y_train, backend="classical")
forecast = engine.run_quantum_regime_forecast(
    "EURUSD", "H1", [0.8, 0.8, 0.8, 0.8]
)
# forecast["trading_action"] is always "NONE".
```

The sample above is only an API smoke-test fixture; it is not market data and must never be used to claim predictive performance.

## Position-size estimate contract

Supply exactly one loss input:
- `loss_per_lot_account_ccy`: broker-calculated loss for one lot at the actual symbol, side, entry and stop, already converted to account currency; preferred.
- `pip_value_per_lot`: pip value already converted to account currency, paired with stop distance in pips and explicit `pip_value_currency`.

Also require `account_currency`, `min_volume`, `max_volume`, and `volume_step` from the broker's symbol/account metadata. The engine floors to the allowed step and rejects any result below the broker minimum. It never rounds volume up.

The estimate does not automatically include gaps, commissions, swaps, slippage, spread or execution failure. The caller must know whether these are included in its broker-derived loss figure. No broker connection is made here.

## Tests

```bash
python -m unittest discover -s tests -p "test_quantum_quant_engine.py" -v
python -m py_compile workers/quantum/quant_engine.py
```

The focused GitHub Actions workflow installs PennyLane so the simulator smoke test can run. Local environments without PennyLane skip only that optional test.

## Research acceptance gate

Do not promote VQC based on training loss, one random seed or simulator output alone. Use identical point-in-time features, labels, chronological splits, leakage controls and tuned classical baselines. Report predictive calibration and classification metrics, out-of-sample stability, training/inference latency, simulator/hardware time, circuit depth, qubit count, shots, seed variance and confidence intervals. Trading simulation must separately include realistic spread, fees, slippage and fill assumptions. No claim of quantum advantage is made by this module.