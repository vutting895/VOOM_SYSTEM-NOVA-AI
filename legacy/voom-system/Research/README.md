# VOOM AI SNIPER — Research Library
**Created:** 2026-10-23  
**Purpose:** Evidence-led research to improve strategy design, risk controls, MT5/Python/Worker engineering, and the VOOM web control panel.

## Library map
- `Trading_Institutional/Institutional_Trading_Playbook.md` — execution, liquidity, order types, trade-cost analysis, and what can/cannot be inferred about large funds.
- `Risk_Management/Risk_Controls_Playbook.md` — position sizing, portfolio limits, kill switches, drawdown and testing.
- `Retail_Strategies/Strategy_Research_Framework.md` — retail strategies, evidence grading, backtesting and avoiding curve fitting.
- `Coding_Engineering/Engineering_Standards.md` — MT5 EA + Python service + Cloudflare Worker + web dashboard design.
- `Web_UI_UX/Dashboard_Design.md` — control-panel information architecture, accessibility, responsive UI and operational safety.
- `Sources/Source_Register.md` — curated primary/official sources and links.

## How VOOM should use this library
1. Treat research as hypotheses, not automatic trading instructions.
2. Convert each candidate idea into a written rule, test it out-of-sample, include spread/commission/slippage, and compare against a baseline.
3. Keep execution rules separate from AI scoring. AI may rank/annotate a valid setup; it must not bypass hard risk limits.
4. Keep secrets in environment/secret storage; never commit API keys, broker credentials, account IDs, or live tokens.
5. No live-trading enablement based on research alone. Require compile checks, reproducible backtests, demo forward tests, and an explicit operator switch.

## Evidence labels
- **A — Primary/official:** regulator, official platform docs, exchange/market infrastructure, standards body.
- **B — Research/education:** established professional education or peer-reviewed work.
- **C — Practitioner claim:** trader/retail strategy source; treat as a hypothesis until independently tested.
- **Unverified:** anecdote, marketing, or claims without data.

## Initial research priorities
- Verify contract/tick value, volume step, minimum stop distance, filling mode, session and symbol suffix for every broker symbol.
- Add order pre-checks, maximum exposure, duplicate-order protection, daily loss lock, stale-data detection, and an auditable event log.
- Use walk-forward/out-of-sample testing and parameter-stability checks before optimizing.
- Report expectancy after costs, max drawdown, profit factor, average R, trade count, exposure, and performance by market regime.


## Trading systems knowledge vault

- Curated trading systems folder: `ระบบเทรด/` (catalog, per-system `SYSTEM.md`, manifests and templates).
- MCP exposes `list_trading_systems` and `get_trading_system`. By default only `approved_for_ai` systems are returned; internal development can explicitly request `include_research=true` to review research-stage systems.
- The initial VOOM Core entry is marked `research`, not approved or profitable. This folder is an AI development knowledge source, not a live-trading switch.

## Security operations dashboard

- Local review dashboard: `../Security_Dashboard/` (launch with `start_dashboard.ps1`, then open `http://127.0.0.1:8765`).
- Reads the security catalog/checklist, displays the finding queue, and writes sanitized candidate reports to `การป้องกันความปลอดภัยระบบ/_incoming/`.
- Runs loopback-only and does not execute commands, deploy changes, alter production permissions, or issue trading commands. The checklist UI is temporary and does not imply controls were tested.

## System security knowledge vault

- Security AI knowledge folder: `การป้องกันความปลอดภัยระบบ/` with threat model, baseline controls, incident response, AI governance and a source-backed finding template.
- MCP exposes `list_security_modules` and `get_security_module`. Research-stage modules require `include_research=true` for internal review; production changes and execution permissions remain disabled.
- Automatic knowledge growth means collecting evidence-backed candidates and proposing tested changes. It does not authorize automatic production deployments or security-policy changes.

## AI knowledge access, semantic search and Skills

The local MCP server in `MCP_Server/` exposes lexical retrieval, multilingual embedding-based semantic search, consented knowledge capture, research queues, and versioned skill export. The persistent vector index is stored in `MCP_Server/data/semantic_index.db` and currently indexes 77 chunks from 26 source documents. See `MCP_Server/README.md` for setup and tests.

Exported knowledge is packaged at `Skills/voom-core/SKILL.md` with a versioned `manifest.json`. The package is marked proprietary; commercial access and usage-metering preparation is documented in `MCP_Server/COMMERCIAL_SKILLS_ACCESS.md` and `MCP_Server/commercial_schema.sql`. No public paid API or billing enforcement is active.

Semantic search and stored skills provide persistent retrieval knowledge; they do not update the base model's weights. Fine-tuning remains a separate future workflow requiring reviewed training examples, evaluation sets, model/version governance, and a chosen training or provider API.
