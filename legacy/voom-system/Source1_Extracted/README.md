# Source 1 extraction staging folder

The extracted Source 1 bundle is present in this folder and is registered in the Supabase marketplace as `testing` version `6.2-test.1`; it is not approved for customers.

- `main_bot_v62_best.py` — authoritative Mean Rejection SMC Wave v6.2 entry/exit analysis
- `api_server.py` — authenticated local API; candidate/HOLD only
- `dl_models.py`, `auto_tune.py`, `auto_retrain.py` — optional model/optimization scaffolds; auto-tuning and retraining are deliberately blocked until real datasets and genuine validation exist
- `requirements.txt`, `docker-compose.yml`, `.env.example`, `tradingview_pine_v62.pine` — extracted supporting files
- `tests/test_safe_api.py` — repeatable API safety smoke tests using a local test-only token and a read-only sample of historical GOLD M15 candles

This source bundle is separate from the existing SmartScalpingBridge / `smart_scalping.py` execution system. Keep it isolated; do not overwrite the live system. API smoke tests do not establish strategy profitability. Do not use live trading until a reproducible Source 1-specific backtest, untouched out-of-sample validation, demo-forward testing, risk review, and explicit human approval are complete.
- `backtest_source1.py` — isolated historical backtest harness; uses chronological 70/30 split, next-bar entry, simulated UTC sessions and conservative spread/SL/TP assumptions; outputs under `Reports/source1_backtest/`. Results are exploratory only, not broker-validated and never enable live trading.
- `tests/test_backtest_source1.py` — unit checks for drawdown math, input rejection and real-history integrity.

Run the isolated Source 1 simulator against the available three-year MT5 export (does not send orders):

```powershell
Set-Location 'C:\Users\Administrator\Documents\Voom_system\Source1_Extracted'
python .\backtest_source1.py --csv 'C:\Users\Administrator\Documents\Voom_system\Backtest\data\XAUUSDc_M15_20231023_20261023.csv' --output-dir 'C:\Users\Administrator\Documents\Voom_system\Reports\source1_backtest_3y'
```

The report is exploratory and all promotion gates remain false until enough OOS trades, broker cost verification, demo forward testing and independent risk review are complete.
