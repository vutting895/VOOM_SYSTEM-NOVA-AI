# Internal Quant Engine — Research Foundation

This package currently provides deterministic, standard-library-only primitives:

- strict OHLCV validation with timezone, ordering, price-range, finiteness, whole-interval gap checks and separate irregular-interval warnings;
- canonical SHA-256 fingerprinting for normalized dataset content;
- deterministic experiment-run fingerprinting over dataset, code, strategy, parameters, evaluation plan and seed;
- chronological train/validation/test partitioning with purge bars;
- expanding and rolling walk-forward fold construction; overlapping test folds are rejected by default.
- an explicit purge-policy helper that returns the strategy-derived maximum forward label horizon; callers must persist the derivation in the experiment manifest.

The package does not fetch market data, connect to brokers, train models, persist runs, or submit orders. It is not a production Quant Engine service yet. Heavy calculations must run in a separately authenticated compute process; Cloudflare Workers remain the routing/control plane.

Run contract tests from the repository root:

~~~bash
python -m unittest discover -s tests -p "test_quant_engine.py" -v
~~~
