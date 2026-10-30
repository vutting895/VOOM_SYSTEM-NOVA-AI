# Deep Research Core — Contract Foundation

This package provides strict, dependency-free validators for the first versioned research contracts:

- `nova.research-task.v1`
- `nova.research-source.v1`
- `nova.research-claim.v1`
- `nova.research-hypothesis.v1`

The validators reject unknown fields, enforce bounded payloads and identifiers, validate source snapshot hashes, require timezone-aware ISO timestamps (normalized to UTC), reject credential-like or reserved source URLs, enforce passage-ID uniqueness, preserve counter-evidence, and require falsification criteria for hypotheses approved for experiment. The cross-record Evidence Graph validator additionally rejects dangling/cross-research references and evidence passages that do not belong to a claim's declared sources.

**Security boundary:** these are data-contract validators only. They do not authenticate users, establish owner/tenant scope, authorize tool calls, fetch URLs, persist source content, or execute source instructions. The NOVA System Integration Hub must authenticate and inject trusted owner/tenant identifiers before calling this package. SSRF protection, redirect validation, DNS/IP policy and network egress controls belong in the future source-fetch adapter.

Run tests from the repository root:

```bash
python -m unittest discover -s tests -p "test_deep_research_contracts.py" -v
```
