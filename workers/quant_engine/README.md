# Internal Quant Engine — Research Foundation

This package currently provides deterministic, standard-library-only primitives:

- strict OHLCV validation with timezone, ordering, price-range, finiteness and optional gap checks;
- canonical SHA-256 fingerprinting for normalized dataset content;
- deterministic experiment-run fingerprinting over dataset, code, strategy, parameters, evaluation plan and seed;
- chronological train/validation/test partitioning with purge bars;
- expanding and rolling walk-forward fold construction;\n- strict `nova.quant-experiment.v1` validation for immutable dataset, strategy/feature, code/runtime, fold, purge/embargo, cost, baseline and evaluator references;
- fail-closed research job lifecycle primitives with allowlisted job types, legal transitions, terminal immutability and tenant-scoped event values.

The experiment validator checks a bounded specification only; it validates the declared purge gap but leaves embargo enforcement to the evaluator. It does not execute folds or prove that referenced artifacts exist. The package does not fetch market data, connect to external accounts, train models, persist runs, or submit orders. It is not a production Quant Engine service yet. Heavy calculations must run in a separately authenticated compute process; Cloudflare Workers remain the routing/control plane.

Run contract tests from the repository root:

~~~bash
python -m unittest discover -s tests -p "test_quant_engine.py" -v
~~~


## Leakage-control contract

- Split APIs require an explicit purge_bars; callers must not inherit an implicit zero. Use derive_purge_policy(label_horizons_bars, embargo_bars=...) to derive the maximum forward-label horizon plus an explicitly recorded additional boundary buffer, then persist policy.to_manifest() with the experiment.
- A zero purge is permitted only when the experiment explicitly passes purge_bars=0 and has no forward-looking label/holding horizon.
- Walk-forward test folds must not overlap. step_bars < test_bars is rejected so aggregate OOS metrics cannot double-count test bars.
- The generic OHLCV validator counts missing intervals only for exact multiples of the expected interval. Non-integral intervals are reported separately and fail reject_gaps=True; source adapters must resolve session/calendar alignment rather than fabricate candles.
- The helper's embargo is an additional pre-holdout exclusion buffer for this strictly chronological splitter. It is not a post-test embargo for combinatorial CV; those evaluation designs require a distinct policy.


## Durable research job store

`SQLiteResearchJobStore` persists research job snapshots, append-only transition
events, and tenant-scoped idempotency records in a local SQLite database. Writes
use `BEGIN IMMEDIATE` and update the job snapshot and event ledger atomically.
Lookups require a tenant ID; reusing an idempotency key with a different request
is rejected. The store only accepts the research job types and `free-cpu`
resource profile defined by the lifecycle contract.

This adapter requires a persistent filesystem path. It is suitable as a
single-node worker persistence foundation, not as a distributed queue or
multi-region database. It does not provide Hub authentication, network APIs,
worker dispatch/leases, cross-process authorization, artifact storage, or
production backup/restore. The trusted Hub must resolve tenant identity before
calling it, and production deployment requires a persistent volume and an
operational backup/restore procedure.
