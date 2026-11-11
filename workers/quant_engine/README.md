# Internal Quant Engine — Research Foundation

The package provides strict OHLCV validation, canonical data hashing, deterministic experiment fingerprints, chronological/purged splits, walk-forward windows, 30 native MTRADERS research modules, and a regime-aware Hybrid selector.

MTRADERS native modules are newly authored baselines based on EA module names and broad technical-analysis families. The original EA's per-module logic is not present in the current checked-in scaffold, so this is not an exact reproduction. Scores are heuristics, not probabilities. FootprintLite is an OHLCV proxy; NeuralPilot is a fixed linear proxy.

Hybrid requires a server-attached quality_receipt with PASS, dataset_id, quality_report_id and dataset_sha256. The authenticated gateway must resolve the receipt against the dataset registry; never trust a user/LLM-supplied receipt. Missing or invalid receipt blocks hybrid candidates. The library is research-only and does not submit orders.

Run from repository root:
python -m unittest discover -s tests -p "test_quant*.py" -v
python -m unittest discover -s tests -p "test_mtraders*.py" -v
