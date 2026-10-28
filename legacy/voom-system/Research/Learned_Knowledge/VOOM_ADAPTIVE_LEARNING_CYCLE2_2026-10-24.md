# VOOM Adaptive Regime — Learning Cycle 2
Date: 2026-10-24
Scope: project folder only; offline research; no MT5 orders.

## Dataset used
- File: Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.csv
- Bars: 117,843 M15 rows
- Range: 2021-10-24 22:00 UTC to 2026-10-23 20:15 UTC
- SHA-256: d4705d36d9128268c3785e825623cc1e2750b846d114a6f43e4f39a2d73bd7fb
- Sources: 100,019 broker-native MT5 XAUUSDc bars; 17,824 external aggregated spot XAUUSD bars.
- Validation: zero duplicate timestamps; zero nulls across time/OHLC/spread fields.
- Source caveat: external gap is not the same broker symbol and does not establish five full years of broker-native history.

## Test evidence
- Research unit tests: 5/5 passed.
- Python syntax compilation: adaptive_regime_backtest.py, tune_adaptive_regime.py and publish_backtest_to_learning.py passed.
- Fresh adaptive backtest output: Backtest/results/adaptive_regime_learning_20261024_cycle2/adaptive_regime_report.json
- Trades: Backtest/results/adaptive_regime_learning_20261024_cycle2/adaptive_regime_trades.csv
- Development: 41 trades; PF proxy 1.0637; return proxy +0.1996%; max DD proxy -0.7986%.
- Validation: 10 trades; PF proxy 2.4967; return proxy +0.9354%; max DD proxy -0.3469%.
- Frozen OOS: 13 trades; PF proxy 1.9980; return proxy +1.1476%; max DD proxy -0.6049%.
- The 0.25% risk setting is a research proxy, not verified broker lot sizing. All P/L figures are normalized proxies.

## Bounded tuning
- A five-candidate search of divergence recency windows [8, 16, 24, 32, 48] was started using development/validation only; target 2R and score threshold 80 remain fixed.
- The final 20% OOS segment must remain frozen and is used only for evaluation after selection.
- At the time this record was written, the tuning process was still running; no new best candidate or promotion decision is claimed from this unfinished cycle.
- Process does not connect to MT5, send orders, train neural-network weights, or deploy a model.

## Learning interpretation and safety
- This cycle is offline evidence accumulation and parameter screening, not online self-learning or LLM fine-tuning.
- Current OOS sample is only 13 trades, and all costs/contract sizing are not broker-realistic. Do not promote or enable live order execution.
- Next evidence needed: finish bounded tuning, inspect candidate results, acquire/verify broker-native XAUUSDc data, confirm tick-value/contract/volume/currency math and real commission/swap/spread, then tick-level MT5 tester and signal-only demo verification.
- Live order execution remains disabled; no customer-facing strategy promotion.
