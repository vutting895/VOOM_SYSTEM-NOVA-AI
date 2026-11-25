# NOVA MT5 → Git Market Data Store

This component includes the read-only MT5 exporter source plus the Git uploader/reader. It publishes **market data only** to the NOVA repository and reads it back by immutable manifest. It does not modify NOVA EA v1.83 and contains no order/execution functionality.

## Data flow

1. MT5 exporter writes CSV to the Common Files export directory.
2. Run `uploader.py` on the Windows host with a GitHub token supplied as environment variable `NOVA_GITHUB_TOKEN`.
3. Uploader validates the CSV header against a strict market-field allowlist, shards rows, gzip-compresses each shard (4 MiB maximum), computes SHA-256, and commits the shards plus manifest to the configured development branch.
4. NOVA research jobs read a specific manifest with `reader.py`, verify every shard hash, then load the CSV files. Consumers must pin a commit/ref or manifest path; do not silently fall back to local stale files.

## Install / publish

Python 3.10+; standard library only.

PowerShell:
```powershell
$env:NOVA_GITHUB_TOKEN = Read-Host "GitHub token"
$env:NOVA_GITHUB_REPO = "vutting895/VOOM_SYSTEM-NOVA-AI"
$env:NOVA_GITHUB_BRANCH = "feature/mt5-git-market-data-store"
python .\uploader.py .\XAUUSDm_M5.csv --timeframe M5 --kind bars --symbol XAUUSDm
python .\uploader.py .\XAUUSDm_ticks.csv --timeframe TICK --kind ticks --symbol XAUUSDm
Remove-Item Env:NOVA_GITHUB_TOKEN
```

The token needs repository Contents write access. Use a fine-grained token scoped only to this repository. Never paste it into chat, commit it, put it in a script, or pass it as a command-line argument.

## Read from Git

```powershell
python .\reader.py --ref <commit-or-branch> --manifest datasets/market-data/XAUUSDm/M5/bars/<run-id>/manifest.json --out .\approved-market-data
```

Use the exact manifest path printed by the uploader. For reproducible training, pin `--ref` to the published commit SHA, not a moving branch name.

## Public-repository safety

The NOVA repository is public. Only upload non-personal market OHLC/tick fields. The uploader rejects unknown columns, including account/order/position/balance/equity fields. The MT5 exporter also creates a SYMBOL_SPEC CSV containing broker server and account currency; **never upload that file** (it is intentionally rejected by the uploader). Review source file headers and broker data redistribution terms before publishing. Do not upload account identifiers, login IDs, trade history, credentials, terminal logs, or EA settings.

## Current limits and known gaps

- Git is the canonical versioned source for code, manifests, schemas, and small compressed market-data shards.
- This first implementation uses the Git Data API and caps each compressed shard at 4 MiB. It is not a bulk-data warehouse; very large tick history will create repository growth and should later move to object storage while Git retains immutable manifests and hashes.
- The uploader currently uses fixed 50,000-row shards. Exporter CSV must have headers exactly from the allowlist in `uploader.py`.
- This utility is not yet wired into a scheduled MT5 task, NOVA training pipeline, or production data loader.
- Publishing to this feature branch is a development action. No main branch, EA v1.83, or live-trading setting is changed.
