# Voom_system integration baseline

## Preserved concept
- Source 1 remains authoritative for Mean Rejection + SMC + Wave v6.2 signal rules.
- Original confluence, z-score, ATR distance, volatility, session, price-action and RR framework are preserved.
- Source 2 is used only as the private configuration/MT5 read-only bridge reference.
- The MT5 bridge currently exposes PING, GET_PARAMS and ANALYZE only. It cannot execute orders; no order execution was added.

## Safety changes
- API defaults to paper-only and should be started bound to localhost.
- All control routes except public health/root require VOOM_API_TOKEN or a local .api_token file (at least 40 characters).
- CORS is restricted to local development origins.
- Start/tune/retrain endpoints fail closed because the original fleet loop is a placeholder and tune/retrain use synthetic/random data.
- No secret values are copied into the repository, reports, or logs.

## Important limitations
- The original deep-learning ensemble uses random initialization when model files are absent. Its output is not validated and must not be treated as a trustworthy confidence score.
- The core signal generator accepts an externally supplied dl_score; the EA/bridge adapter is not yet wired to build model tensors or provide real validated model scores.
- Therefore this is a safe integration baseline, not a live-trading-ready bot.

## Start locally after dependencies are installed
PowerShell:
$env:VOOM_API_TOKEN = '<set a new random token locally; do not commit it>'
cd C:\Users\Administrator\Documents\Voom_system\Source1_Extracted
python -m uvicorn api_server:app --host 127.0.0.1 --port 8000

Do not bind to 0.0.0.0 or enable live orders until authenticated dashboard, real market-data ingestion, risk sizing, demo execution, and reconciliation tests are complete.
