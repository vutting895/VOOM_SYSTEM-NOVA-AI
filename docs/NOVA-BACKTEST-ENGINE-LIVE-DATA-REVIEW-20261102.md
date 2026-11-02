# NOVA Backtest Engine and Live Market Data Integration

- Date: 2026-11-02
- Implementation branch: `feat/backtest-lab-ui-20261102`
- Scope: Exness MT5 Demo, authenticated market-data reads, research-only simulation
- Safety: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`

## 1. External engine review

| Engine | Execution model | Best fit | Decision for NOVA |
|---|---|---|---|
| VectorBT OSS | Vectorized signal/portfolio simulation | Fast signal screening, indicator research and parameter sweeps | Add as optional benchmark adapter; never the canonical fill ledger |
| NautilusTrader | Rust-native event-driven simulation and live/sandbox architecture | High-fidelity event replay, tick/order-book modelling and eventual same-strategy runtime | Keep as a future migration candidate after NOVA's strategy/data contracts stabilize |
| QuantConnect LEAN | Event-driven research/backtest/live engine | Broad multi-asset brokerage ecosystem and mature runtime | Do not embed yet; C# core and a separate deployment/runtime footprint add unnecessary integration cost for the current MT5 Demo milestone |
| backtesting.py / Backtrader | Python strategy frameworks | Simple strategy prototyping and education | Do not add as a second canonical engine; avoid duplicate accounting/fill semantics |

### Integration decision

NOVA keeps `StrategyBacktestEngine` as the canonical event-driven accounting engine because it explicitly models close-derived signals filling at the next bar open, transaction costs, deterministic trade records and a forced end-of-data close.

VectorBT is integrated as an **optional screening cross-check** for fast parameter sweeps. Its output is not allowed to overwrite NOVA's canonical ledger or acceptance metrics; the adapter explicitly reports that its terminal position is marked to market.

NautilusTrader is the stronger longer-term candidate if NOVA later needs tick/order-book replay and identical strategy code across backtest and sandbox/live runtimes. It is not pulled into this PR because that would replace a narrow engine milestone with a second full trading runtime and would require separate venue adapter and execution safety review.

## 2. Real-time data path

The repository already contains a tenant-isolated MT5 Read-only Bridge and a System Hub endpoint:

```text
Browser (Supabase session)
  -> Next.js /api/market-data
  -> Supabase Auth validation
  -> NOVA System Hub /v1/connections
  -> owner-scoped Exness MT5 Demo connection
  -> NOVA System Hub /v1/connections/{id}/quotes
  -> MT5 Read-only Proxy / Relay
  -> dedicated Windows MT5 terminal
```

The new frontend route does not accept a connection ID, owner ID, tenant ID, upstream URL, or bridge token from the browser. It asks the Hub for the signed-in user's connections, accepts exactly one connected and allocated Exness Demo connection, then requests bounded quote/candle data through the Hub. The Hub remains responsible for owner scoping and tenant isolation.

The route returns:
- Bid/Ask/Last tick and source timestamp
- UTC OHLCV bars and provider symbol/timeframe
- Source and received timestamps
- Freshness state (fresh if tick age is at most 60 seconds; otherwise stale)
- Explicit read-only execution flags

The Backtest page can poll this endpoint every five seconds. This is **near-real-time polling**, not a persistent WebSocket stream. The existing bridge returns a quote snapshot and bars; a streaming adapter would require a separately reviewed subscription implementation.

## 3. Backtest data handoff

`workers/backtest/market_data.py` validates the Hub's `data_verified` response, enforces UTC timestamps, strictly increasing unique bars and OHLC consistency, then normalizes the MT5 volume fields to the engine's `volume` field.

The newest MT5 bar is excluded by default because position zero is the forming candle. The current tick is retained as separate metadata and is never treated as a completed historical bar.

`StrategyBacktestEngine.run_market_data()` hands the normalized closed candles to the canonical engine. Strategy signals must be generated causally from those same closed candles; signal adapters are not allowed to inspect future bars.

## 4. Boundaries and current limitations

- The Next.js route can fetch authenticated live Demo data only when the owner's Exness connection and tenant bridge route are fully provisioned.
- A local Bridge health check, stored connection row or public market quote is not proof of the owner's authenticated end-to-end connection.
- The current Backtest UI can load real candles into its existing **baseline** input. The Wave3/SMC/XGBoost/LSTM signal adapters and a deployed Strategy Simulation API are still separate work.
- The Python engine is currently a research module exercised by CI. It is not yet deployed as a hosted strategy API.
- The MT5 bridge returns bounded OHLC bars and a current tick, not full tick history or Level-2 order book replay.
- The current strategy engine remains long-only and does not yet model stop-loss/take-profit intrabar ordering, swap/rollover, contract-size/tick-value differences, partial fills, margin calls, or broker-specific commission schedules. Do not treat it as final Exness contract-accurate simulation.
- VectorBT benchmark results are supplementary and must not be substituted for the canonical engine.
- No API key, broker password, account secret, bridge token, or customer credential is added to source control or the browser.

## 5. Next engineering gates

1. Verify exact-head Frontend CI and Backtest Research CI.
2. Test authenticated market-data route with an actual owner session; test missing session and foreign-owner denial.
3. Confirm actual Exness Demo symbol and timeframe from the terminal's symbol catalogue.
4. Add causal Wave3 and SMC signal adapters; validate no-lookahead.
5. Add risk sizing, stop/target rules, swap, contract specification and spread/commission calibration.
6. Add walk-forward folds and immutable Final OOS evaluation; retain the frozen OOS period and minimum 30 closed trades gate.
7. Deploy the Strategy Simulation API only after the Python engine runtime and tenant-safe job/result persistence are reviewed.

## 6. References

- VectorBT official getting started: https://vectorbt.dev/
- VectorBT official signal execution and next-bar shift example: https://vectorbt.dev/getting-started/features/
- VectorBT portfolio signal API: https://vectorbt.dev/api/portfolio/base/
- NautilusTrader official architecture: https://nautilustrader.io/docs/
- NautilusTrader backtest execution flow: https://nautilustrader.io/docs/latest/concepts/backtesting/execution-flow/
- MetaTrader 5 Python `copy_rates_from`: https://www.mql5.com/en/docs/python_metatrader5/mt5copyratesfrom_py
- MetaTrader 5 Python `copy_ticks_from`: https://www.mql5.com/en/docs/python_metatrader5/mt5copyticksfrom_py
- Exness API overview and eligibility: https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API
