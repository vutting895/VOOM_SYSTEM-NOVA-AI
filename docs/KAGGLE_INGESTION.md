# Kaggle data ingestion for NOVA

This workflow connects Kaggle to the NOVA repository through GitHub Actions. It
downloads a selected Kaggle dataset, creates a SHA-256 manifest, and stores the
download as a short-lived Actions artifact. It does not commit datasets to Git,
publish a model, or enable broker execution.

## One-time GitHub setup

1. Create a fresh Kaggle API token in your Kaggle account settings. Do not paste
   the token into chat, source files, workflow inputs, or commits.
2. In this repository, open **Settings → Secrets and variables → Actions**.
3. Add an Actions secret named `KAGGLE_API_TOKEN` with the token value.
4. Add an Actions repository variable named `KAGGLE_DATASET_SLUG` with the
   public dataset identifier in `owner/dataset-name` form.
5. Run **Actions → Kaggle Daily Data Ingestion → Run workflow** once with the
   dataset slug to verify access.

The daily schedule runs at 01:00 UTC (08:00 Thailand time). GitHub scheduled
workflows run against the default branch, so this workflow must be merged
before the schedule becomes active. Until the repository variable is set, the
scheduled run intentionally fails with a configuration message.

## Outputs and retention

Each successful run uploads a `kaggle-dataset-<run-id>` artifact containing
the extracted files and `manifest.json`. The manifest records the dataset
slug, source commit, workflow run ID, file sizes, and SHA-256 hashes. Artifacts
expire after 7 days. Dataset files are not committed to the repository.

## Training boundary

This first integration stage is ingestion-only. The repository currently has
research/strategy code, but this change does not assume that a production-ready,
leakage-safe training entrypoint exists. A later PR must identify and test the
actual Elliott Wave 1–5 / XGBoost / LSTM training command, define its dataset
schema and chronological splits, and store candidate metrics/artifacts before
automated training or model promotion is enabled.

NOVA remains research/read-only: no broker order APIs are called, and no
model is automatically promoted or used for live trading.
