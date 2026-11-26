# NOVA v1.0 Repository Map

This map adds a modular Python engine beside the existing React/Vite application. It does not assert that every module is implemented.

```text
.
├── src/                         # Existing React application (preserve)
├── server.ts                    # Existing Express/Vite server (refactor later)
├── engine/
│   └── python/
│       ├── pyproject.toml
│       ├── nova_engine/
│       │   ├── domain/           # Canonical contracts
│       │   ├── data/             # Ingestion and validation
│       │   ├── features/         # Indicators and SMC
│       │   ├── strategies/       # SMC / Wave3 / technical signals
│       │   ├── decision/         # Ensemble and meta decision
│       │   ├── risk/             # Independent risk governor
│       │   ├── research/         # Backtest and WFO
│       │   └── api/              # Future service boundary
│       └── tests/
├── mt5/
│   └── Novas/                    # MQL5 read-only EA (planned)
├── docs/
│   └── architecture/
└── config/                       # Environment-neutral config templates (planned)
```

## Integration rule

The existing frontend/server and new Python package communicate only through versioned contracts/API. Do not import UI/server implementation details into the research engine. Do not move existing files until each current route, data source, environment variable and test has been mapped.

## Next implementation sequence

1. Validate these contracts and repo paths.
2. Implement data validation + UTC candle ingestion.
3. Add deterministic indicators and no-look-ahead SMC events.
4. Add strategy signal interfaces and baseline backtest.
5. Implement risk governor with persistence and tests.
6. Connect read-only Nova's EA bridge.
7. Add model training only after dataset provenance and OOS split are frozen.
