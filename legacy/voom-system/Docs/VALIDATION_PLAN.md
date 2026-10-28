# Voom_system — Validation status

## Purpose
This folder is the central integration workspace. Source 1 is the authoritative entry/exit strategy (Mean Rejection + SMC/Wave v6.2). Source 2 is permitted only for private connection configuration and MT5/HTTP bridge reference; do not import Source 2 entry/exit decisions into the strategy.

## Safe test sequence
1. Run Python\run_system_checks.py.
2. Run python -m unittest Python\test_risk_guard_optimizer.py -v.
3. Do not enable live orders. Tests are read-only/paper-only.
4. Transfer the original nine Source 1 files into Source1_Extracted before claiming Source 1 is installed.
5. After Source 1 is present, inspect dependencies and configuration names without printing secret values; then add adapter tests with fake MT5/HTTP responses.
6. Validate signal -> risk guard -> MT5 demo account end-to-end. Live mode stays disabled until explicitly reviewed.

## What a PASS means
- Python syntax checks and risk guard unit tests passed.
- It does not prove profitability, real-time connectivity, valid broker order execution, or that the Source 1 strategy is installed.
- A BLOCKED Source 1 result means the integrated system cannot yet be certified.

## Secret handling
Never print, copy into reports, or commit the contents of .env.txt, .bridge_http_token, API keys, or account credentials. Reports may record only whether private files exist.
