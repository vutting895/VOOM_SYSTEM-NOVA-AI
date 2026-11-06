# NOVA AI Learning Engine v0.1

## Scope

The first release records completed trade experiences, calculates a transparent
risk-aware reward, provides performance aggregates, stores model candidate
metadata, and applies explicit approval gates to candidate promotion.

**Safety invariants**
- No broker adapter is imported or called.
- No order execution is possible from this package.
- Training is offline and is not triggered by API requests.
- Candidate approval does not deploy a model or switch a live strategy.
- Paper/backtest/demo/live environments are recorded separately; use paper as
  the default and do not mix environments in evaluation reports.

## Files

- `models.py`: SQLAlchemy 2.x tables for experiences, model versions and audit.
- `service.py`: idempotent collection, reward calculation, summaries and gates.
- `api.py`: optional FastAPI router.

## Integration

Install compatible dependencies in the backend environment:
```bash
pip install "SQLAlchemy>=2.0,<3" "fastapi>=0.100" "pydantic>=2"
```

Configure `DATABASE_URL` using a PostgreSQL driver, for example:
```text
postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
```

Initialize the learning tables through the project's Alembic migration workflow.
For a local development smoke test only, `LearningBase.metadata.create_all(engine)`
may be used; production schema changes should use migrations.

Mount the router in the existing FastAPI application:
```python
from backend.learning.api import router as learning_router
app.include_router(learning_router)
```

If the project uses a different package root, adjust only this import path.

## API

- `GET /learning/health`
- `POST /learning/experiences`
- `GET /learning/performance?strategy_id=...&environment=paper`
- `POST /learning/models/candidates`
- `POST /learning/models/{model_id}/approve`

Experience `event_id` is unique for idempotent ingestion. Send a stable ID
from the originating trade/agent event. `pnl_pct`, `risk_pct`, and
`drawdown_pct` are percentage-point values (e.g. 1.25 means 1.25%, not 0.0125).

## Promotion policy

A candidate remains non-active until a human approver invokes the approval
endpoint. The service requires at least 100 validation samples, win rate >= 50%,
profit factor >= 1.10, and validation maximum drawdown <= 8%. These are
conservative initial policy defaults, not evidence of strategy profitability.
Promotion only changes metadata to `approved`; a separate reviewed deployment
workflow must be designed before any model can affect an agent.

## Known v0.1 limitations

- No training algorithm, feature store, drift detector or model artifact loader.
- No authentication/RBAC is implemented inside this module; the host API must
  protect the approval endpoint with its existing authenticated approver
  dependency before production exposure.
- The supplied approver field is an audit label, not proof of identity.
- Profit factor and validation metrics must come from a reproducible,
  chronological out-of-sample evaluation. Never calculate them from training
  data or mix paper and live results.
