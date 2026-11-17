# External Source Register — NOVA v1.0

Review date: 2026-11-18
Target: vutting895/VOOM_SYSTEM-NOVA-AI

| # | Source | License / rights finding | Candidate material | NOVA decision |
|---:|---|---|---|---|
| 1 | https://github.com/zero-was-here/tradingbot | MIT confirmed | Dukascopy XAUUSD bid/ask acquisition design, canonical bars, point-in-time availability, macro/event schemas | Adopt data contracts and acquisition design. Do not redistribute downloaded market history without checking provider terms. |
| 2 | https://github.com/ChristopherCC-Liu/AI-SMC | README states MIT; root LICENSE not found in this check | XAUUSD M1 archive, Parquet workflow, CSV/MT5 adapters, SMC event ideas | Reference only until license and bundled dataset provenance are verified. No code/data imported. |
| 3 | https://github.com/triqbit/mt5-ai-xauusd-trader | README states MIT; root LICENSE not found in this check | Risk, model, test and data-governance docs | Reference only pending full license and third-party dependency audit. No weights/data copied. |
| 4 | https://github.com/MirandaCR/Nexus-Trading-System-MT5 | AGPL-3.0 confirmed | Architecture/API concepts | No code or derivative implementation imported; legal review required before reuse beyond high-level observations. |
| 5 | https://github.com/EA31337/EA31337 | GPL-3.0 confirmed | MQL strategy/indicator examples | No source imported; reference only due copyleft obligations. |
| 6 | https://github.com/TheSnowGuru/PyTrader-python-mt4-mt5-trading-api-connector-drag-n-drop | No root LICENSE found; compiled EA artifacts and commercial full-version references present | WebSocket protocol and MT5 bridge concepts | No code, binaries, tick data or docs copied. Reimplement independently after specification review. |
| 7 | https://github.com/Ichinga-Samuel/aiomql | MIT confirmed | Async lifecycle, reconnect and scheduling concepts | Reference only. Python requirement differs from NOVA Python 3.11 target; no package vendored. |
| 8 | https://github.com/geraked/metatrader5 | MIT confirmed | MQL5 indicator/EA examples | Reference only. No trading EA source copied into Nova's EA. |
| 9 | https://github.com/Lumiwealth/lumibot | GPL-3.0 confirmed | Backtest/data abstraction concepts | No code imported; independent API contracts only. |
| 10 | https://github.com/OpenByteInc/QuantDinger | Backend Apache-2.0 confirmed; frontend has separate source-available terms | Worker, audit, API and persistence architecture | Backend may be considered after per-file notices/dependency review. No frontend or branding copied. |

A repository-level license does not automatically license every dataset, model weight, third-party asset, compiled binary or submodule. Each artifact requires its own provenance and rights check. This register is not legal advice.
