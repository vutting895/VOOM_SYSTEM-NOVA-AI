# Kaggle API via GitHub Actions

This repository uses GitHub Actions Secrets for Kaggle API credentials. The connection check is intentionally read-only.

## Required repository secrets

Create these secrets in **Settings → Secrets and variables → Actions → Repository secrets**:

- `KAGGLE_USERNAME`
- `KAGGLE_KEY`

Do not put credentials in source files, workflow inputs, artifacts, issue comments, or chat messages. Do not print them in workflow logs.

## Run the connection check

1. Open **Actions → Kaggle API Read-only Connection Check**.
2. Select **Run workflow** and the branch containing this workflow.
3. Run it manually.
4. Review the final step summary. It reports only whether authentication succeeded and the number of dataset rows returned.

The workflow installs the Kaggle CLI and runs `kaggle datasets list --page 1 --csv`. It does not download, upload, modify, publish, or train on any dataset.

## Security boundaries

- Trigger: manual `workflow_dispatch` only; no pull-request execution with secrets.
- GitHub token permissions: `contents: read`.
- Credentials are injected into the single verification step as environment variables.
- CLI stdout/stderr are captured and suppressed on failure to avoid leaking credential-like diagnostic text.
- No credential files, dataset contents, or API response bodies are uploaded as artifacts.
- This check verifies API authentication only. It does not validate dataset provenance, XAUUSDm H1 coverage, OHLC integrity, or training readiness.

## Kaggle credential format

This workflow expects the legacy Kaggle API credential pair supported by the Kaggle CLI: `KAGGLE_USERNAME` and `KAGGLE_KEY`. If the account was configured with a newer token-only credential, create/use the matching legacy API credentials or adapt the workflow to the account's supported authentication method without exposing the token.
