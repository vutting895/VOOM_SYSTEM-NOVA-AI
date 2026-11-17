# NOVA Data Lake

This directory is intentionally empty of third-party market data.

- external/manifests: provenance manifests
- external/source_metadata: source and license metadata
- raw/xauusd: immutable original XAUUSD files; keep large files out of Git
- normalized/xauusd: validated, normalized UTC bars
- approved/xauusd: datasets cleared for research/training
- synthetic/tests: generated test fixtures only

Do not promote a dataset to approved until license/provider terms, SHA-256, coverage, timezone, OHLC integrity, duplicates and session-aware gaps are reviewed.
