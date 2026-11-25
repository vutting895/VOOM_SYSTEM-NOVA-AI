---
name: nova-evaluation
description: Use when creating or reviewing NOVA agent evaluations, regression tests, model quality gates, tool-selection checks, event trajectories, output-contract assertions, or pre-release validation plans.
---

# NOVA Evaluation

## Evaluation design
- Define the behavior under test, input fixtures, expected outcome, forbidden behavior, evidence source, and pass/fail threshold before running an evaluation.
- Cover normal paths, edge cases, adversarial/untrusted input, tool selection, authorization, refusal/stop behavior, output schema, and regression.
- Separate deterministic assertions from model-judge scoring. Use deterministic checks for security, permissions, schema, and safety invariants.
- Treat SKIPPED, missing, timed-out, or unexecuted tests as NOT PASS.
- Report exact test command, environment, commit SHA, run ID, completed steps, exit code, artifacts, and failures.

## Side-effect isolation
- Agent evaluations must not mutate production data, secrets, permissions, deployment state, or broker accounts.
- Use mocks, fixtures, isolated test tenants, or dry-run behavior for write-capable tools. Preserve the tool call/decision trace where useful for assertions.
- Do not connect an evaluation to real broker order, account mutation, transfer, or withdrawal capability.
- A passing evaluation does not authorize production release or live trading.

## Cursor Agent SDK Evals
Use defineEval and agent-sdk eval only when the task explicitly selects Cursor Agent SDK. For ordinary NOVA agents, apply the evaluation principles using the chosen OpenAI Agents/API evaluation harness; do not assume Cursor-specific APIs are available.

## Status
Distinguish test definitions authored, tests executed, exact-head CI passed, and real integration evidence. Never infer one from another.
