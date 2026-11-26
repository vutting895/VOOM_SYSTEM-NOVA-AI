# Dropbox Data Import Inventory

Inventory checked: 2026-11-18
Dropbox root: `/NOVA_DATA/exness`

## XAUUSD candidates for NOVA v1.0

| File | Dropbox path | Size | Modified UTC | Status |
|---|---|---:|---|---|
| Exness_XAUUSD_2024.zip | /NOVA_DATA/exness/Exness_XAUUSD_2024.zip | 318,500,736 bytes | 2026-11-17T18:56:40Z | DISCOVERED; archive contents not inspected |
| Exness_XAUUSDc_2024.zip | /NOVA_DATA/exness/Exness_XAUUSDc_2024.zip | 313,061,591 bytes | 2026-11-17T20:18:58Z | DISCOVERED; archive contents not inspected |
| Exness_XAUUSDm_2024.zip | /NOVA_DATA/exness/Exness_XAUUSDm_2024.zip | 313,203,271 bytes | 2026-11-17T20:20:35Z | DISCOVERED; archive contents not inspected |

Total XAUUSD archive size: 944,765,598 bytes (~900.8 MiB).

## Other files found (not imported)

- Exness_BTCUSDm_2024.zip — 369,501,015 bytes
- Exness_BTCUSDTc_2026.zip — 162,331,400 bytes

These are BTC instruments and excluded from NOVA v1.0 GOLD-only dataset scope.

## Important limitations

- Dropbox metadata confirms file existence, ZIP MIME type, sizes and modification timestamps only.
- ZIP members, date coverage, timeframe, price basis, row counts and SHA-256 have NOT been inspected.
- Do not mark any archive approved or train models from it until the archive is downloaded into a controlled workspace and validated.
- Large raw archives are deliberately not committed to Git. Keep source files in Dropbox/object storage; Git stores manifests, hashes, schemas and validation reports.
- Dropbox file IDs are omitted from this human-readable register; use the exact paths above when retrieving files through the connected Dropbox account.
