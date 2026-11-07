# NOVA Auto-Learning: GitHub → Kaggle → Hugging Face

## Architecture

- GitHub is the source of truth for trainer code, tests, configuration and the Kaggle entrypoint. Do not commit raw model weights or large price history.
- Kaggle Notebook is the scheduled offline compute runner. It clones NOVA \`main\`, installs the checked-in training requirements, and runs the trainer. CPU is the default; no GPU is required for the initial LightGBM model.
- LightGBM is the first tabular candidate. It predicts next-bar log return \`log(close[t+1] / close[t])\`, not an absolute price level. Features include lagged returns, rolling statistics, scale-free candle/volume features, and UTC calendar features. Windows 7/14/30/45/60 are **bars**, not calendar days. Data gaps break rolling sequences and labels.
- Training uses chronological partitions and purged/embargoed boundaries. Early stopping uses an inner chronological tail of the training partition; three expanding-window checks also stay inside that training partition. The outer validation partition is evaluated once against a zero-return baseline. Model weights upload only if the candidate clears the validation MAE-improvement threshold and at least two of three walk-forward folds beat baseline.
- The final chronological holdout is reserved and not scored, tuned on, or used for candidate selection by this trainer.
- Hugging Face Model Hub stores immutable run folders under \`experiments/\` and gated candidate weights under \`candidates/\`. The destination must already exist and be private. No \`latest\` alias, automatic promotion, or production activation is written.
- GitHub Actions syncs only \`hf-space/\` to an existing Hugging Face Space after reviewed code lands on \`main\`. Space source and model weights are separate repositories.

## Dependencies and release order

This change is stacked on Draft Learning Engine PR #237 and imports its verified \`backend.learning.data_sources\` loader. The default Exness historical snapshot is supplied by separate Draft data PR #197. Branch-only code/data are not available from \`main\` until those dependencies are reviewed and merged. The Kaggle entrypoint fails closed if the trainer or expected dataset manifest is missing.

Do not enable the scheduled Kaggle notebook until PR #237 and the reviewed historical dataset path are on \`main\`. The Exness research candidate must remain separate from the frozen Wave3 benchmark; do not replace that benchmark or weaken its gates.

## Configure Kaggle

1. Create a **private** Kaggle Notebook from \`kaggle/nova-auto-learning/main.py\` and \`kernel-metadata.json\` (replace the placeholder Kaggle username in the metadata), or paste the script into a notebook.
2. Add these secrets in the notebook editor under **Add-ons → Secrets**:
   - \`GITHUB_READ_TOKEN\`: fine-grained token restricted to read-only Contents access for \`vutting895/VOOM_SYSTEM-NOVA-AI\`.
   - \`HF_TOKEN\`: Hugging Face write token scoped only to the chosen private Model repository.
   - \`HF_MODEL_REPO_ID\`: exact destination Model repo ID.
   - Optional \`NOVA_DATASET_ID\`: defaults to \`exness_xauusdm_m15\`.
3. Run once manually and inspect the full run manifest and validation metrics.
4. Only after the required PRs/data are merged and the manual run is reproducible, enable the Kaggle notebook's built-in weekly Sunday schedule.

The Kaggle CLI's \`kernels push\` workflow does not attach interactive Kaggle Notebook Secrets to a pushed notebook. This design therefore uses Kaggle's own scheduler to execute the notebook with its configured secrets rather than attempting to trigger it through GitHub Actions. Never put secrets in notebook source, output, GitHub files, or kernel metadata.

## Configure Hugging Face

1. Create an existing **private Model repository** and a separate Gradio **Space**.
2. Add GitHub Actions repository secret \`HF_TOKEN\` with write access to the Space, and repository variable \`HF_SPACE_REPO_ID\` with the exact Space repo ID.
3. Set Space variable \`HF_MODEL_REPO_ID\` to the private Model repo ID. Give the Space a read-only token for that Model repo.
4. A push to \`main\` changing \`hf-space/**\` syncs Space code. Pull requests do not sync the production Space. \`workflow_dispatch\` supports manual sync.



**Kaggle API token clarification:** the scheduled notebook runs inside Kaggle, so it does not need a Kaggle API token at runtime. A Kaggle API token is only needed on an external machine/CI runner when using the Kaggle CLI to push or manage notebooks/datasets. Never store a Kaggle API token in this repository or GitHub Actions. The notebook itself reads only the GitHub read token and Hugging Face token from Kaggle Notebook Secrets.

## Configure GitHub Actions variables and secret

In **Repository → Settings → Secrets and variables → Actions**, add:

- Repository secret `HF_TOKEN`: Hugging Face token with write access to the private Space and private Model repositories used by NOVA.
- Repository variable `HF_SPACE_REPO_ID`: exact Space repository ID, for example `account/nova-learning-space`.
- Repository variable `HF_MODEL_REPO_ID`: exact private Model repository ID, for example `account/nova-learning-models`.

After saving them, run **Actions → Verify NOVA Hugging Face configuration → Run workflow**. The workflow checks that both destinations are reachable and private; it never prints or uploads the token. The existing Space sync workflow uses `HF_TOKEN` and `HF_SPACE_REPO_ID`. Kaggle Notebook Secrets remain configured separately in Kaggle and are not readable by GitHub Actions.

## Safety and model lifecycle

- This creates forecasting research candidates, not order signals. MAE is not proof of profitable trading; spread, commission, slippage, news and out-of-sample strategy gates remain separate.
- The first phase trains LightGBM only. LSTM/Hybrid is a later challenger, to be compared independently after the LightGBM baseline stabilizes. Do not silently blend models or alter existing Wave3/XGBoost/LSTM gates.
- A model upload is not a promotion. Human approval and a separate release process are still required before shadow use. The trainer never writes a mutable production alias.
- No broker writes, orders, withdrawals, transfers or live trading are enabled. Exness Demo remains read-only; Live Trading remains OFF.
- Keep raw price data and generated binaries out of GitHub. Store large historical datasets in a separately versioned data location and model weights in Hugging Face Model Hub.

## Colab / local alternative

From Colab, store the same three secrets in Colab Secrets, clone the private repository with a read-only GitHub token, install \`backend/learning/requirements-training.txt\`, and run:

\`\`\`bash
python -m backend.learning.train_price_model \\
  --repo-root . \\
  --dataset-id exness_xauusdm_m15 \\
  --upload-to-hf
\`\`\`

Omit \`--upload-to-hf\` for a local experiment without Hub upload.
