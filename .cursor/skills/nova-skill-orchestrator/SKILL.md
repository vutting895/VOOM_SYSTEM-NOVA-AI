---
name: nova-skill-orchestrator
description: Use for any task in the VOOM_SYSTEM-NOVA-AI repository, including planning, coding, debugging, reviews, integrations, tests, releases, documentation, agents, APIs, MT5, or trading research. Route the task to the smallest relevant NOVA specialist skill after mandatory Work Order and repository preflight.
---

# NOVA Skill Orchestrator

## Purpose
Route NOVA repository work to the smallest applicable specialist Skill. This is an instruction and routing layer, not a privileged runtime, approval system, tracker, or source of truth.

## Mandatory preflight — before proposing edits
1. Read WORK_ORDER_INSTRUCTIONS.md from current main.
2. Read the applicable central Work Order in vutting895/voom-shared-contracts; verify approval state, exact scope, phase, exclusions, and dependencies.
3. Read NOVA Master Tracker Issue #36, logs/OPERATIONS.md, and relevant current evidence.
4. Read live refs/heads/main SHA and inspect relevant PR/issue heads and checks. Never rely on stale inventory or historical CI.
5. Confirm the requested action is explicitly covered by an APPROVED Work Order. A general request, adjacent approval, or existing Skill does not grant additional scope.
6. Follow NOVA's current Main-only rule. Do not create a feature branch or PR for NOVA implementation unless an authoritative owner instruction explicitly changes that rule.
7. If scope, approval, ownership, security, cost, permissions, production, or trading authority is ambiguous, stop with BLOCKED_DECISION. If a dependency is unavailable, stop with BLOCKED_DEPENDENCY.

## Skill routing
- Work Orders, Main-only policy, approvals, logs, blockers, audit: nova-governance.
- System boundaries, architecture, reuse, API ownership, integration design: nova-architecture.
- MT5 historical read-only collection, exporters, REST APIs, data provenance: nova-api-exporter.
- OpenAI Agents/API tools, MCP, tool design, orchestration, memory, least privilege: nova-agent-engineering.
- Evaluation plans, regression suites, model/agent quality, test evidence: nova-evaluation.
- Demo/read-only constraints, risk controls, execution locks, broker safety: nova-trading-safety.
Load only the smallest relevant specialist set. Multiple Skills may be used when a task genuinely crosses boundaries; governance preflight always applies.

## Precedence and safety
1. Central Work Order and repository WORK_ORDER_INSTRUCTIONS.md.
2. Applicable security, ownership, data, deployment, and trading safety policies.
3. This orchestrator and specialist Skills.
4. Task-specific user request, only within approved scope.
A Skill cannot grant permissions, override an approval gate, or authorize an excluded action.

Preserve ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false. Production deployment remains paused. Datacenter is the sole owner of research/learning computation and authoritative research lineage. Do not create duplicate Gateways, MCP servers, trackers, logs, workflows, or schedulers.

## Evidence and reporting
Report exact repository, branch, before/after SHA, Work Order ID, changed paths, tests/checks and actual results, evidence links, blockers, and next action. Distinguish authored from executed tests. SKIPPED, missing, or empty checks are not PASS. Never claim runtime integration, automatic Skill invocation, profitability, readiness, or completion without direct evidence.

## Invocation limitation
Cursor may select a Skill based on its description and task context. This file's existence does not prove Cursor selected or executed it. Do not claim automatic runtime invocation until observed in a real supported Cursor session.

## Distinguish Cursor Skills from the MCP catalog
The Cursor Skills in .cursor/skills are agent instruction documents selected by Cursor from repository context. NOVA's existing Remote MCP skill registry is a separate catalog-only runtime metadata API exposed through list_nova_skills/get_nova_skill. Do not duplicate, replace, merge, or claim runtime execution from either system. The MCP registry currently exposes metadata only and has its own authorization/tests; this Work Order does not modify it.
