# VOOM Learning Cycle — Initial Evidence Record

Date: 2026-10-24
Scope: offline research only.

## Pipeline status
- VOOM MCP learning/privacy tests: 7/7 passed.
- VOOM learning engine tests: 5/5 passed.
- SFT dataset: absent, 0 examples.
- Active foundation model: none.
- PyTorch, Transformers, PEFT and Datasets: not installed in checked runtime.
- Neural-network/LLM fine-tuning is not active. The capability used here is offline parameter search plus research evidence storage.

## Input and search
- Input: Backtest/data/XAUUSD_M15_hybrid_learning_input.csv
- Bars: 117,843; derived from mixed-source hybrid history. Source labels were excluded from the simple EMA comparator.
- Report: Research/aiเทรด/reports/training_report_20261024_034819.json
- Dataset SHA-256: 97a2ff734ef59604ab8e8314fabfa302d7775cd9058644b55b40171c37010e9d
- Chronological split: 82,490 development bars / 35,353 holdout bars (70/30).
- 25 EMA pairs tested with RSI14 thresholds 52/48, max hold 12 bars.
- Cost assumption: generic 2 basis points per side, not verified broker spread/commission/swap.
- Best by development ranking: EMA20/60; development return -51.40%, max drawdown 53.91%; holdout return -17.21%, max drawdown 21.59%, 589 trades.
- Positive holdout variants: 0/25.
- Candidate trained-97a2ff734e-ema20-60 remains research, failed preliminary holdout screen, hidden from customers, with demo test and approval pending.

## Decision
Do not promote or deploy the EMA candidate. Build a separate research backtester for VOOM Adaptive Regime + EMA/RSI Divergence v0.1 (H4 regime + H1 structure + confirmed M15 trigger, divergence, >=80/100 score, 2R target experiment and risk gates) before further parameter search. Preserve the final holdout and do not tune on it.

## Boundaries
Research-only; no orders sent. Live trading and customer strategy selection remain disabled. No automatic retraining, model deployment, or live adaptation is enabled.
