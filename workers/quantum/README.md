# NOVA Quantum Quant Engine

Status: **research-only Python module; not connected to production workers, broker routes, chat orchestration, or order execution.**

## Responsibility and boundaries

- Trains an in-memory classical logistic-regression regime baseline.
- Optionally trains a PennyLane Variational Quantum Circuit (VQC) for controlled research experiments.
- Keeps classical and quantum preprocessing statistics separate.
- Calculates an advisory position-size estimate only when explicit account-currency loss metadata and broker volume constraints are supplied.
- Does not fetch market data, generate features, persist model artifacts, authorize a trade, or submit broker orders.
- Emits an uncalibrated 0–1 regime score, not a calibrated probability; downstream consumers must not treat it as a probability until a separately tested calibration artifact exists.
- Does not implement QAOA/QUBO. The legacy `run_qaoa_risk_filter` name is only a compatibility alias for classical arithmetic risk sizing.

The four numeric inputs are an implementation shape, **not a production feature definition**. Do not assign feature names or semantics based on the illustrative sample below.

## Runtime placement and current NOVA architecture

This is a Python module. It is not a Cloudflare Worker and is not imported by the deployed Remote MCP Worker.

The current chat path is:

1. `frontend/app/api/chat/route.js` runs in the Next.js Node.js runtime, authenticates the Supabase bearer session, validates and bounds the conversation, then forwards it to the NOVA AI Worker.
2. `integrations/nova-ai-worker/worker.js` provides the current authenticated AI/research interface and deterministic first-pass intent classification.
3. The owner-scoped `frontend/app/api/agent/threads` and approval routes persist strategy-draft review records. They do **not** currently provide LangGraph execution state, a graph checkpointer, or an Agent runtime for this Python module.

The repository's reviewed architecture decision is to prototype **LangGraph.js in the existing Node runtime with a PostgreSQL checkpointer** if durable graph orchestration is adopted. LangGraph is not currently wired into the chat route. Do not treat the previous Python LangGraph sample as the active repository runtime.

A Python module cannot be imported directly by the JavaScript Cloudflare Workers or Next.js route. Do not add a Python subprocess to an edge Worker, expose a public unauthenticated Python API, or add a second MCP server by default. Before this engine is integrated, select and review one explicit boundary:

- a private, authenticated Python inference adapter with bounded requests, strict typed input/output schemas, timeouts, health behavior and deployment ownership; or
- a reviewed port of the required classical inference path into the existing Node runtime.

The choice requires an architecture decision and tests. Neither boundary is implemented by this PR.

## Integration gates

Keep the engine isolated until all of the following are true:

1. `workers/feature/` or `shared/` defines a versioned, point-in-time feature contract with named features, units, ranges, ordering, schema version, source timestamp and missing/stale-data behavior. The feature contract must also define how historical training labels are generated without look-ahead leakage.
2. The source pipeline produces that exact contract and passes chronological split, leakage and data-quality checks. Existing feature modules are research prototypes; do not infer that they already provide the four engine inputs.
3. A private adapter or reviewed Node port is approved, implemented and tested. The browser must never choose model artifacts, tenant IDs, connection IDs, runtime URLs or backend capabilities.
4. The inference response includes schema/model version, inference time, source-data time, backend used, status and explicit uncertainty/abstention semantics. Missing, stale or invalid features must fail closed.
5. The output remains an advisory research signal. It must not select an order, authorize a strategy, mutate broker state or change account risk limits.

## Risk-policy separation

The engine's position-size calculation is **not** the NOVA Risk Worker or an authorization decision.

The active Remote MCP `validate_paper_risk` tool is a separate paper guardrail. It checks portfolio allocation, daily loss, drawdown, leverage and data age; it does not accept this engine's lot-size result, calculate broker contract loss, or replace symbol-level broker min/max/step constraints. The two interfaces must not be treated as interchangeable.

Any future use of the sizing estimate must pass through the independently maintained server-side risk policy with authenticated owner/tenant context, current account and instrument metadata, and fail-closed handling. Reconcile per-position sizing with portfolio exposure and daily/drawdown limits explicitly. No integration or risk-policy approval is created by this module.

## Installation

Install the isolated research dependency set (Python 3.11 is used by the focused CI job):

```bash
python -m pip install -r workers/quantum/requirements.txt
```

The package import still handles a missing PennyLane installation explicitly, but VQC fitting and simulator forecasts are unavailable without PennyLane. This dependency file belongs to the research module; it is not a new general-purpose backend environment and must not be added to the MT5 Bridge or MCP runtime.

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
