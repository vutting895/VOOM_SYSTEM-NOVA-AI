# SMC/Wave MCP Components

Research-only implementation package for VOOM_SYSTEM-NOVA-AI.

## Source preservation
- source_notebooks/elliott_wave_source.ipynb — copy of Elliott Wave.ipynb (11 cells). Its original ML workflow does not implement an auditable Elliott Wave counter, so this package uses a clearly labelled pivot/swing heuristic instead.
- source_notebooks/harmonic_patterns_source.ipynb — copy of hamonic pattren.ipynb (54 cells). The original ind_pattern has inconsistent four/five-point indexing and is not reused; harmonic_patterns.py contains a new XABCD ratio checker.
- source_notebooks/liquidity_sweeps_source.ipynb — copy of Liquidity Sweeps.ipynb (0 cells). liquidity_sweeps.py is a new baseline detector because the source file has no code.

## Modules
- elliott_wave.py: local swing-pivot extraction and six-pivot alternating sequence candidate. This is not a fully validated Elliott Wave count.
- harmonic_patterns.py: XABCD ratio-based candidate checker for Gartley, Bat, Butterfly, and Crab. Five ordered pivot prices must be supplied.
- liquidity_sweeps.py: detects a high/low sweep beyond a prior lookback extreme followed by a close back inside.
- dapter.py: validates OHLC candles and combines research-only candidate analysis. It returns no trade signal and cannot place orders.

## MCP tools
- smc_wave_component_status
- alidate_smc_wave_ohlcv
- nalyze_smc_wave_candidates

## Setup and tests (Windows PowerShell)
`powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m mcp.server.fastmcp --help
`

Run the server using the configured MCP client command and project environment; the server uses stdio.

## Safety / limitations
Live trading and order submission remain disabled. The components are research candidates, not financial advice or validated strategy signals. Run domain review, leakage-safe walk-forward backtests, fees/slippage modelling, and out-of-sample tests before considering any signal use.

[executed on device: 10_3_6_9 (85294689-03d5-431e-abd5-9e27d4c94814)]