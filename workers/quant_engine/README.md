# Internal Quant Engine — Research Foundation

The package provides strict OHLCV validation, canonical data hashing, deterministic experiment fingerprints, chronological/purged splits, walk-forward windows, 30 native MTRADERS research modules, and a regime-aware Hybrid selector. Python Hybrid voting deduplicates correlated modules into eight independent strategy families; conflicting modules within one family remove that family's vote.

MTRADERS native modules are newly authored baselines based on EA module names and broad technical-analysis families. The original EA's per-module logic is not present in the current checked-in scaffold, so this is not an exact reproduction. Scores are heuristics, not probabilities. FootprintLite is an OHLCV proxy; NeuralPilot is a fixed linear proxy.

Hybrid requires a server-attached quality_receipt with PASS, dataset_id, quality_report_id and dataset_sha256. The authenticated gateway must resolve the receipt against the dataset registry; never trust a user/LLM-supplied receipt. Missing or invalid receipt blocks hybrid candidates. The library is research-only and does not submit orders. The MQL5 `OnTick` controller processes only new completed bars, uses module-strength scores, deduplicates correlated signals into the same eight families, and rejects a family containing opposing module signals. MetaEditor compilation and MT5 Strategy Tester verification are still required.

Run from repository root:
python -m unittest discover -s tests -p "test_quant*.py" -v
python -m unittest discover -s tests -p "test_mtraders*.py" -v

## Decision adapter contract

`mtraders_contract.py` creates a deterministic, versioned research envelope for downstream adapters. It validates canonical symbol/timeframe, UTC closed-bar timestamp, decision/signal consistency, bounded ensemble score, unique family votes, dataset receipt presence, and hard-false execution flags. It emits no order, lot size, SL, TP, or broker command. The gateway must independently resolve the dataset receipt; a client-supplied PASS object is not trusted.
