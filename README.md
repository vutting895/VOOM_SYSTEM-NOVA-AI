# VOOM System - NOVA AI (React SPA)

JARVIS-inspired multi-broker trading command center, AI research chat, Gen-AI strategy lab, marketplace, and learning universe, rewritten as a modern React SPA on Vite with TypeScript and Tailwind CSS.

## Features
- **JARVIS Command Center**: Overview dashboard with AI Core orb, broker connection monitor, market telemetry, and risk guard.
- **NOVA AI Chat**: Interactive research assistant with quick prompts and safety boundaries.
- **Broker Hub**: Exness MT5 Demo and crypto broker connection status monitor.
- **Gen AI Strategy Lab**: Generate strategy drafts with risk parameters and AI worker insights.
- **Strategy Marketplace**: Explore curated strategy templates.
- **Learning Universe 16**: 16 research and AI worker learning modules.
- **Markets & Video Workspace**: Multi-asset telemetry and Gen-AI video studio.

## Running Locally
- Install dependencies: `npm install`
- Start development server: `npm run dev` (runs on port 3000)
- Build for production: `npm run build`

## Wave3 + SMC research (PR #66; research-only)

- Benchmark contract: v6.2.6.3; Wave3 + Fibonacci + causal SMC + XGBoost + PyTorch LSTM. All entry, scoring, lookback, cost, news and risk thresholds remain frozen.
- Exness XAUUSDm M15 dataset: 101,076 closed bars; SHA-256 \`0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266\`.
- Historical Exness Demo high-impact USD calendar: 2,166 rows; canonical Git LF 386,146 bytes, SHA-256 \`317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37\`. Windows raw CRLF source 388,313 bytes, SHA-256 \`6754d46f34e76fc171e64afec51297dbcd3caf4d4dd196bc1a993b526c\`. Provenance: \`datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.manifest.json\`. Evidence is from the 2026-10-30 export; no fresh MT5 export occurred during the 2026-11-02 Windows inspection.
- Latest candidate-level SMC trace: 34 candidates; BOS20=21, three higher lows + green=12, qualifying OB within $5=1, FVG overlap=7; all-four same-bar=0; maximum score=75; SMC>=85=0. Diagnostic-only; no model training or gate changes.
- Latest completed benchmark remains run #6 (training commit \`5fda3b8eb502d5694639a3afef354de0876ff2de\`): OOS accuracy 41.0602% vs 45.9708% majority baseline; balanced accuracy 38.8382%; macro-F1 38.0253%; closed trades 0/30; net $0; PF unavailable. All five walk-forward folds remain below their baselines. This is not training evidence for the current PR head.
- PR #147 is a separate first-hit/triple-barrier research workstream. Do not fold it into PR #66 or duplicate its implementation here.
- No full benchmark training until P1 semantic review and P2 label methodology are ready. No orders, deployment, merge, or Live Trading.


## Wave3 revalidation — 2026-11-03

- Source of truth remains `main` at `4480d3bf6fa8f390b09334091f697d8359e79085`. PR #66 and PR #147 remain separate Draft/open/unmerged research workstreams; neither is merged or deployed.
- Exact code-head validation for PR #66: SMC/Wave3 CI [run #183](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575193559) passed and Windows Runtime CI [run #277](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575193564) passed. The SMC artifact is [#13203561555](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575193559/artifacts/13203561555), archive SHA-256 `c929fa73ca643aaec34a745361d82cf40d3cb8ea8ce1d3f084cff9045c858970`; trace JSON SHA-256 `117d48fda45c7b74c060be5820e1782d7f5ec72e8599ad5bb4f93cb7e8c3fa4a`.
- Current causal trace remains 34 candidates: BOS20=21, three confirmed higher lows + green=12, OB within $5=1, FVG overlap=7; all-four same closed bar=0, max SMC=75, SMC>=85=0. The FVG first-overlap/full-mitigation/re-touch ambiguity remains a P1 semantic decision; no weight, lookback, threshold or gate was changed.
- Dataset SHA-256 remains `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`; canonical historical calendar SHA-256 remains `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`. Raw MT5 calendar evidence remains the 2026-10-30 terminal log/export (2,166 events, 15,853 queried values, zero unknown time modes); no fresh MT5 export was performed on 2026-11-03.
- Latest completed model training is still run #6, training commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, not the current PR code head. OOS accuracy 41.0602% vs 45.9708% baseline; balanced accuracy 38.8382%; macro-F1 38.0253%; closed trades 0/30; net $0; PF unavailable; all five walk-forward folds below baseline. Do not rewrite the run #6 model manifest without a new training artifact.
- PR #66 daily runner now waits up to 70 minutes for a fresh calendar export whose end-exclusive coverage includes the latest closed M15 bar, verifies the persisted dataset SHA, and retries a dataset/calendar pair unless a matching successful-training marker exists. The marker is written only after the candidate model directory and report exist.
- PR #147 remains independent. Its P2 CI [run #34](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575390274) passed 13 synthetic unit tests, including the exit-UTC-day realized-loss regression. P2 remains blocked on gap-through fills, swap/rollover modeling, independent Exness commission evidence, real-data label integration and a new future final holdout.
- No full benchmark training, broker orders, Live Trading, deployment or merge was performed.
