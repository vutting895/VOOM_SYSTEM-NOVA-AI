# NOVA Gold Lab Notebook Index

This directory is reserved for reproducible NOVA AI Trading research notebooks.

## Notebook catalog

| Notebook | Purpose | Status |
|---|---|---|
| `NOVA_XAUUSD_H1_CPU_Research.ipynb` | Exness XAUUSDm H1 data validation, CPU research, and chronological model evaluation | Candidate in [PR #243](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/243); not yet integrated into current `main` |
| `../colab/nova-auto-learning/NOVA_Colab_Runtime_Preflight.ipynb` | Colab runtime and environment preflight | Present on current `main`; not a model-training notebook |

## Authoring requirements

- Keep notebooks focused: one research question and a reproducible execution path per notebook.
- Record parameters, UTC time ranges, dataset identity, source provenance, code revision, and environment.
- Separate data loading, validation, feature engineering, training, evaluation, and interpretation into readable cells.
- Execute top-to-bottom when possible; save intended outputs and inspect the rendered notebook.
- Keep credentials out of source and outputs. Use the platform's secret store.
- Never commit raw broker credentials or unapproved market-data exports.
- Add deterministic tests for critical data and strategy contracts; CI must validate notebook structure and executable code cells.
- Do not treat cached outputs, local-only test results, or a successful notebook parse as proof of hosted CI or data-source availability.

See [NOVA Gold Lab governance](../docs/NOVA_GOLD_LAB.md) for data, model, security, and promotion gates.
