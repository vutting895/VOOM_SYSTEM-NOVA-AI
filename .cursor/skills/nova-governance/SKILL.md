---
name: nova-governance
description: Use when a NOVA task involves Work Orders, approvals, scope, repository ownership, Main-only development, PR or issue governance, audit logs, release gates, blockers, or status reporting. Apply before any implementation action.
---

# NOVA Governance

## Required sequence
1. Verify the exact current NOVA refs/heads/main SHA.
2. Read WORK_ORDER_INSTRUCTIONS.md, the applicable central Work Order, Issue #36, and logs/OPERATIONS.md.
3. Inspect current relevant PRs, issues, branch heads, review threads, and exact-head checks.
4. Confirm the requested action is explicitly included in an APPROVED Work Order phase.
5. Record the Work Order ID and evidence in the local append-only operations log after meaningful work.

## NOVA operating rules
- NOVA implementation is Main-only under the current owner direction. Do not create routine feature branches or PRs.
- Never force-push or rewrite history.
- Never infer approval from a broad request, prior adjacent work, a Skill, or a green check.
- Do not merge, close, or delete PRs/branches unless the approved scope explicitly authorizes it.
- Do not create duplicate trackers, logs, workflows, schedulers, or automation.
- Stop at decision gates for ownership, architecture, security, authentication, permissions, cost, destructive changes, production release, or trading authority.
- Production deployment remains paused.

## Evidence standard
Log UTC time, repository, branch, before/after SHA, Work Order ID and phase, changed paths, checks and exact results, evidence references, blockers, and next action. Read back every changed file from the resulting Main SHA. Mark DONE only when every acceptance criterion is evidenced.

## Status vocabulary
Use DONE, IN_PROGRESS, BLOCKED_DECISION, BLOCKED_DEPENDENCY, REVIEW_REQUIRED, NOT_STARTED, or STALE/OBSOLETE accurately. An authored test is not an executed test. A skipped check is not a pass.
