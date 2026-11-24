# VOOM Ecosystem — Repository Ownership Matrix

- Work Order: WO-2026-11-24-003
- Status: initial ownership map; entries marked VERIFY are not confirmed implementation facts.
- Central registry: https://github.com/vutting895/voom-shared-contracts

| ChatGPT management Project | Repository | Target responsibility | Classification |
|---|---|---|---|
| VOOM System + NOVA Command Center | `vutting895/VOOM_SYSTEM-NOVA-AI` | Central Command Center, NOVA Core, admin/control plane, central MCP Gateway | CANONICAL |
| VOOM AI | `vutting895/voom-ai` | Main user-facing AI automatic-trading application | CANDIDATE — inventory previously found README-only; source implementation not verified |
| Datacenter | `vutting895/Datacenter` | Sole research, data, training, evaluation and learning owner | CONFIRMED ROLE; current implementation state requires local audit |
| VOOM Shared Contracts | `vutting895/voom-shared-contracts` | Canonical API/MCP/event/data contracts and central Work Order registry | CANONICAL |
| VOOM Studio Affiliate | `vutting895/Voom-studio-affiliate-` | Separate Affiliate product | SEPARATE PRODUCT |
| System-nova-backend | `vutting895/System-nova-backend` | Potential backend component / legacy candidate | VERIFY — ownership, active runtime and dependencies unverified |
| VOOM Remote Desktop | `vutting895/voom-remote-desktop` | Remote access/infrastructure utility | VERIFY — ecosystem role and dependency unverified |

## Internal workstreams (not separate ChatGPT Projects)

| Workstream | Primary governance owner | Execution ownership |
|---|---|---|
| Security & Identity | Command Center | Each repository implements its own approved controls; central standards govern |
| Infrastructure & DevOps | Command Center | Runtime/repository owners operate their own infrastructure within approved policy |
| Knowledge Center | Command Center | Documentation owners contribute; Datacenter retains research/model lineage |
| QA & Testing | Command Center defines shared standards | Each repository tests its own code; cross-repo integration tests are coordinated centrally |

## Required reporting

Every report must identify the actual repository full name and URL, branch, commit SHA, Work Order/Task ID, status, changes, checks, evidence, blockers and next action. The central Command Center may consolidate cross-repository status only when each repository's evidence and status remain separately identified.

## Classification gaps

- VOOM AI: verify whether `voom-ai` is the intended active application repository or whether another candidate (including `voom-ai-f480ij` or `Voom-ai-sniper`) owns active trading source. Do not migrate until verified.
- System-nova-backend: determine whether it is active, embedded, superseded or a dependency before assigning code ownership.
- Remote Desktop: verify active use and integration boundary.
- Voom_system: previous inventory classified it as a possible admin-dashboard candidate pending boundary confirmation. This target architecture assigns the canonical Command Center to NOVA; inspect and reconcile Voom_system before any merge, archive or code move.
- Affiliate remains separate and must not inherit NOVA or VOOM AI work status.

Repository visibility or account ownership is not proof of ecosystem membership. Update this matrix only with current main-branch and dependency evidence.