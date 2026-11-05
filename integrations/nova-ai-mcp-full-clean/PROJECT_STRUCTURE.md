# NOVA Final Clean — Canonical Project Structure

This is the canonical source layout for the NOVA AI MCP project imported into VOOM_SYSTEM-NOVA-AI.

```text
nova-final-clean/
├── mcp-server/
│   └── server.py                 # MCP Server + Quality Gate 60%
├── docker-compose.yml
├── .env.example
├── README.md
└── workers/
    ├── data_ingestion/
    │   └── main.py               # Binance WebSocket, 1-second data target
    ├── feature/
    │   ├── supervised_xgboost.py # Supervised learning
    │   ├── unsupervised_clustering.py # Unsupervised KMeans
    │   ├── cnn_vision.py         # Self-supervised MAE, chart masking target 30%
    │   ├── gnn_correlation.py    # Graph correlation
    │   ├── mamba_long.py         # Long-context sequence model, target 10k candles
    │   ├── diffusion_synthetic.py # Synthetic chart generation
    │   ├── neurosymbolic.py      # Neural + logic, 12-rule target
    │   ├── vlm_multimodal.py    # Chart + news + audio inputs
    │   ├── continual_learning.py # Continual learning
    │   ├── world_model_jepa.py   # World Model JEPA
    │   └── agentic_selfplay.py   # Agentic self-play
    ├── federated/
    │   └── federated_learning.py # Federated learning; keep private data local
    ├── rl/
    │   └── ppo_trader.py         # PPO reinforcement learning
    ├── gen_ai/
    │   └── llm_strategy.py       # Generative AI strategy module
    ├── backtest/
    │   └── engine.py             # 3-year backtest target
    ├── tuning/
    │   └── optuna_tuner.py       # 50 tuning trials target
    ├── risk/
    │   └── manager.py            # VaR risk management
    ├── execution/
    │   └── ccxt_exec.py          # CCXT execution adapter
    └── learning_control.py       # Control plane for all workers
```

## Implementation notes

- The Quality Gate threshold is 60%; treat this as a required minimum, not proof that a strategy is profitable.
- Binance 1-second streaming, 3-year backtesting, 50 tuning trials, 30% chart masking, 10k-candle context and 12 logic rules are targets to validate in implementation, not assumed verified capabilities.
- Keep execution disabled and use Paper/Test Mode until market data, risk checks, backtests, credentials handling and execution safeguards have been independently tested.
- Never commit real credentials. Use `.env.example` with placeholder variable names only.
- Federated learning must not transmit private raw training data.
- The imported prototype contains mocked/synthetic metrics in some modules; results must be clearly labeled until replaced with validated calculations and real historical data.
