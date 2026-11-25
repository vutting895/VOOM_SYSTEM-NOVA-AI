# v1.83 Source Variant Manifest

All files in this directory are research evidence copied from the Windows MT5 Experts folder. Originals were not modified. These are source-only copies; EX5 binaries are intentionally excluded because their source-to-binary provenance is not yet verified.

| File | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| Nova_EA_v1_83.mq5 | 525635 | 8054 | 4D8838B6868CDB3509F01EC922D4F5787445896015E34BB3C1E61946B3EE0319 |
| Nova_EA_v1_83_SAFE_READONLY.mq5 | 525342 | 8039 | 21285F68689C29EBA8C88E1FCA6C3307773CD467879E2AF591A4402BAB2A8125 |
| Nova_EA_v1_83_WORKING.mq5 | 534264 | 8077 | 771B05C1A1EE83033AAD8E21BF59279B8A805737BDB485BD189C22FE488D6000 |
| Nova_EA_v1_83_REPAIRED.mq5 | 534264 | 8077 | 771B05C1A1EE83033AAD8E21BF59279B8A805737BDB485BD189C22FE488D6000 |
| Nova_EA_v1_83_TEST_DAILY20_MAX10.mq5 | 699004 | 8078 | 2462F7BD08109FBE8694ECC44F493DD42415EDDAB59104B78EFAE98D5AA2212F |

WORKING and REPAIRED have identical SHA-256 values and are byte-identical according to the local Windows hash check.

Secret-pattern scan covered common API key, secret, password, bearer-token, OpenAI-key, and JWT-like patterns. No matches were reported. This is a heuristic scan, not a guarantee that the files contain no sensitive data.

Do not install these files or treat them as production-ready. The directory is an immutable research baseline. Make fixes in a separate candidate directory/branch and retain this baseline unchanged.
