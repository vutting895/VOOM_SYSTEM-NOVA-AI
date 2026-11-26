# NOVA QUANTUM — Brand & Engineering Standard

**Product:** NOVA QUANTUM  
**Descriptor:** Hybrid Intelligence Trading Engine  
**Tagline:** Intelligence Beyond the Market  
**Visual direction:** Futuristic, precise, restrained, research-first.

## Brand identity
- Obsidian: `#080D18`
- Quantum Cyan: `#16CDEB`
- Neural Violet: `#7657FF`
- Titanium: `#C5D0E0`
- Headings: Space Grotesk
- Product UI: Inter
- Technical data/logs: JetBrains Mono

## Product modules
- `QUANTUM_CORE`: lifecycle and orchestration
- `QUANTUM_SMC`: SMC analysis
- `QUANTUM_NEURAL`: ML inference integration
- `QUANTUM_HYBRID`: strategy selection/fusion
- `QUANTUM_SENTINEL`: risk controls
- `QUANTUM_EXECUTOR`: execution adapter (disabled until certified)
- `QUANTUM_LAB`: research and backtesting

Module names are architectural naming conventions, not claims that modules are implemented or active.

## File naming
- Main source: `NOVA_QUANTUM_vMAJOR.MINOR.PATCH.mq5`
- Compiled binary: `NOVA_QUANTUM_vMAJOR.MINOR.PATCH.ex5`
- Include/module: `QUANTUM_<MODULE>.mqh`
- Release tag: `nova-quantum-vMAJOR.MINOR.PATCH`
- Build metadata: `BUILD_INFO.json`
- Checksums: `SHA256SUMS.txt`
- Test evidence: `TEST_REPORT.md`

## Version policy
Semantic Versioning: MAJOR.MINOR.PATCH.
- MAJOR: incompatible architecture/API change
- MINOR: backward-compatible feature addition
- PATCH: backward-compatible fix

The existing MTRADERS v1.02 source is continued as NOVA QUANTUM v1.02. This is a product/file identity transition, not a strategy rewrite or a claim of new trading capability. The next planned feature version is v1.03.

Release channels: DEV, ALPHA, BETA, RC, STABLE. STABLE requires verified compile, functional tests, risk validation, Strategy Tester, and controlled Demo forward testing.

## Provenance and release integrity
Every binary must map to a source commit SHA, build ID, compiler/build version, build timestamp, test report, and SHA-256 checksum. Never claim source-to-binary provenance without matching evidence.

## Safety baseline
Execution remains disabled by default. The current v1.02 source rejects `InpTradeEnabled=true` during initialization and has an intentionally empty `OnTick()`. The five-order count is only a snapshot helper, not an atomic reservation mechanism. Do not enable execution until atomic capacity reservation, independent risk validation, Demo-only E2E tests, and explicit authorization are complete.
