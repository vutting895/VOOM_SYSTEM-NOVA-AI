# VOOM_SYSTEM — File Organization Audit
Date: 2026-10-24
Canonical root: `C:\Users\Administrator\Documents\Voom_system`

## Actions completed
- Moved the imported source archive from the project root to `Backups\Source1_bundle_downloaded.zip`. The archive was preserved; it was not deleted.
- Reviewed the central project layout, AI_Bridge source directory, legacy Cloudflare Worker folder, and separate Security Dashboard.
- No strategy, EA, configuration, credential, source, log, or backup files were deleted or overwritten.
- No trading service, MT5 terminal, cloudflared process, or dashboard/API process was stopped as part of this file cleanup.

## Canonical folder map
- `Source1_Extracted\` — Source 1 strategy and API; keep as the authoritative strategy source pending validation.
- `EA\` — EA source/builds and compile logs. Preserve both EA variants until their usage and deployment references are verified.
- `Python\` — local bridge/support scripts and risk guard.
- `Worker\` and `Cloudflare_API\` — separate Cloudflare services; do not merge or replace one with the other without endpoint/config verification.
- `Config\` — safe configuration templates only; real secrets must remain private and must never be committed.
- `Backtest\` and `Reports\` — research scripts, input data and generated results.
- `Logs\` — operational/test logs; treat as potentially sensitive.
- `Backups\` — rollback copies and imported archives; do not prune until integration is verified.
- `Docs\` and `Research\` — system documentation and research materials.
- `Dashboard\`, `Security_Dashboard\`, `VOOM_AI_Web\` — separate UI/services with different trust boundaries; do not combine them as if they were one runtime.
- `api\` and `backend\` — separate root Node API scaffold; this is not proof of MT5 connectivity.

## Findings requiring care
1. The central repository contains many runtime/generated folders such as `node_modules\`, Python `__pycache__\`, the MCP server's `.venv\`, and Cloudflare `.wrangler\` caches. These are ignored by `.gitignore`; leave them in place for now because removing them may disrupt local services or require reinstalling dependencies.
2. The folder named `{EA,Python,Worker,Config,Logs,Backtest,Docs}` appears to be an accidental directory name. It was left untouched pending confirmation that it is empty and not referenced.
3. Several similarly named EA files, bridge implementations, strategy/model candidates, logs, and dated backups exist in `Voom_system` and `C:\Program Files\AI_Bridge`. They are not automatically duplicates: do not delete or replace them without comparing hashes, references, timestamps, and runtime usage.
4. `Logs\bridge_secret.tmp`, `Source1_Extracted\.api_token`, and `C:\Program Files\AI_Bridge\.bridge_http_token` are sensitive by name/location. Their contents were not included in this report. Keep them out of source control and do not print or upload their values.
5. The current `.gitignore` includes rules for environment files, token/secret/password-like filenames, logs, archives, caches, virtual environments, model binaries, and compiled EA files. Git CLI was not available in the remote PowerShell session, so tracked/untracked status could not be independently confirmed.

## Recommended safe cleanup order
1. Verify the odd brace-named directory is empty, then move it to a clearly named quarantine/cleanup location rather than deleting it immediately.
2. Generate a hash/reference map for candidate duplicate EA/model/script files before archiving any.
3. Verify runtime launch paths and tests before moving files out of `C:\Program Files\AI_Bridge` or `Source1_Extracted\`.
4. Keep all trading paper-only. Source 1's documented 3-year diagnostic failed its current promotion criteria; this organization pass does not approve live trading or establish end-to-end telemetry connectivity.

## Validation limits
This is a structural review, not a full code/security audit. Git status could not be checked because Git was not available in the shell. No application tests were rerun during this organization pass.

## Follow-up actions and test results (2026-10-24)
- Quarantined the empty, misnamed directory at `Backups\quarantine_empty_misnamed_directory\`; no contents were found and nothing was deleted.
- Moved four timestamped backup files from the active `EA\` and `Source1_Extracted\` directories into `Backups\EA\` and `Backups\Source1_Extracted\`. The originals were preserved as backup copies at the new paths.
- SHA-256 comparison found one exact duplicate source pair: `Python\voom_http_adapter.py` and `C:\Program Files\AI_Bridge\voom_http_adapter.py` (both 6,835 bytes and same SHA-256). Both copies remain in place because the installed copy may be used at runtime.
- Git is available at `C:\Program Files\Git\cmd\git.exe`. The repository is on `main...origin/main` and has pre-existing tracked modifications plus new files. No checkout, reset, commit, push, or overwrite was performed.
- Validation passed: root Node tests 11/11; Node syntax check; Backtest safety regression; Source 1 Python tests 7/7.
- `git diff --check` reported one new blank line at EOF in the already-modified `Source1_Extracted\api_server.py` and line-ending warnings in existing modified files. Source code was not auto-formatted to avoid unrelated edits.
- No trading backtest was rerun in this organization pass. Previously documented 3-year Source 1 diagnostic remains FAIL; keep live trading disabled.

## Cleanup pass: remove unrelated generated cache files (2026-10-24)
- Removed 11 Python `__pycache__` directories under Backtest, Python, Source1_Extracted, Security_Dashboard, Research, and Supabase. These contain regenerated `.pyc` bytecode only; source code was preserved.
- Verified that zero matching Python cache directories remain outside dependency and Git directories.
- Deliberately retained `node_modules`, `.git`, configuration templates, logs, historical datasets, model files, both Worker services, dashboard code, backups, and all source/EA files. They have runtime, audit, rollback, or research purposes; removing them without dependency proof could break the system.
- No active process was stopped. No strategy, token, secret, trading setting, or production deployment was changed.