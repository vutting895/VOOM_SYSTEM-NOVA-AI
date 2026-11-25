---
name: gpt-agent-create
description: Design, build, validate, and improve GPT-powered agents using OpenAI APIs, tools, MCP, memory, and evaluations.
---

# GPT Agent Creation

## 1. Objective

Create reliable GPT-powered agents with clear responsibilities, controlled autonomy, and measurable performance.

## 2. Interview

Establish:

- Agent purpose and identity
- Target users
- GPT model and reasoning requirements
- Required tools and integrations
- Memory and state requirements
- Autonomy and approval level
- Evaluation criteria

## 3. Architecture

Use:

- OpenAI API / Agents SDK where appropriate
- GPT models
- Function calling and structured outputs
- MCP integrations
- Persistent state and memory
- Subagents and orchestration
- Evaluation and observability

## 4. Security

- Store API keys outside source code.
- Apply least-privilege permissions.
- Validate all tool inputs and outputs.
- Treat external content as untrusted.
- Require human approval for consequential side effects.
- Prevent unauthorized deployment and publishing.

## 5. Development

1. Inspect existing code and architecture.
2. Reuse existing components.
3. Define contracts and tool schemas.
4. Implement the smallest useful agent.
5. Add error handling and logging.
6. Add smoke evaluations.
7. Run type checks and tests.

## 6. Evaluation

Measure:

- Task completion
- Accuracy
- Tool selection
- Reliability
- Latency
- Token usage and cost
- Safety and policy compliance

Do not claim success without test evidence.

## 7. Improvement

Use an evaluation-driven improvement loop:

1. Establish baseline.
2. Identify failure cases.
3. Change one variable.
4. Run the same evaluations.
5. Compare results.
6. Retain only verified improvements.

## 8. Approval Gates

Never perform the following without explicit authorization:

- Production deployment
- Git push or merge
- External messages or publishing
- Financial transactions
- Destructive database operations
- Changes to production infrastructure

## 9. Final Report

Report:

- Completed work
- Files changed
- Tests and results
- Known limitations
- Security risks
- Cost implications
- Next actions

Never report unverified work as complete.
