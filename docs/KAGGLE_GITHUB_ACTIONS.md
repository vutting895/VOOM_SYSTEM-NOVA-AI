# Kaggle API via GitHub Actions

This repository uses a Kaggle API token stored as a GitHub Actions repository secret. The connection check is intentionally read-only.

## Required repository secret

Create this secret in **Settings → Secrets and variables → Actions → Repository secrets**:

- `KAGGLE_API_TOKEN`

Use the current Kaggle API token format supported by the Kaggle CLI. Do not put the token in source files, workflow inputs, artifacts, issue comments, or chat messages. Do not print it in workflow logs.

## Run the connection check

1. Open **Actions → Kaggle API Read-only Connection Check**.
2. Select **Run workflow** and the branch containing this workflow.
3. Run it manually.
4. Review the final step summary. It reports only whether authentication succeeded and the number of dataset rows returned.

The workflow installs the Kaggle CLI and runs `kaggle datasets list --page 1 --csv`. It does not download, upload, modify, publish, or train on any dataset.

## Security boundaries

- Trigger: manual `workflow_dispatch` only; no pull-request execution with secrets.
- GitHub token permissions: `contents: read`.
- The token is injected into the verification step as the `KAGGLE_API_TOKEN` environment variable.
- CLI stdout/stderr are captured and suppressed on failure to avoid leaking credential-like diagnostic text.
- No credential files, dataset contents, or API response bodies are uploaded as artifacts.
- This check verifies API authentication only. It does not validate dataset provenance, XAUUSDm H1 coverage, OHLC integrity, or training readiness.

## Credential compatibility

The workflow uses the current single-token `KAGGLE_API_TOKEN` environment variable supported by the Kaggle CLI. It does not require the legacy `KAGGLE_USERNAME` / `KAGGLE_KEY` pair. Keep the token in GitHub Actions Secrets only.
