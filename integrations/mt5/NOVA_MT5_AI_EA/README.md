# NOVA_MT5_AI_EA

- Version: 2.002
- Status: 30-module source added to PR #322 branch; MetaEditor compile and Demo runtime pending
- Role: Demo-only 30-module research signal producer
- Legacy EA: `MT5_AI_Trading_EA v1.100` remains preserved and is not overwritten

## Included
- Dedicated copy of `StrategyEngine30.mqh`, with the same 30 heuristic modules and names.
- Closed-bar signal event schema `mt5ea.signal.v1`, exact event ID format and vote totals expected by NOVA Decision API PR #322.
- Optional research candidate fields: symbol, side, volume, entry price, stop loss.
- Candidate volume and stop distance default to zero; Controller cannot be enabled until both are explicitly configured.
- Local Controller Bridge is OFF by default and restricted to the existing localhost URL.
- Local Controller token is read from an untracked text file under MQL5/Files; it is not an EA input, source literal, or .set value.

## Safety boundary
- Demo account required at initialization.
- No `OrderSend`, `CTrade`, `PositionOpen`, `Buy`, `Sell`, pending order, close, amend, transfer, or withdrawal implementation.
- No broker order execution is possible from this EA source.
- The 30 modules are deterministic indicator/price heuristics, not 30 trained AI models.
- Candidate values are research inputs. NOVA Bridge recalculates monetary risk from broker data.
- Daily-loss, aggregate-risk and max-order policy remain server-authoritative; no local EA policy override.
- Controller/Decision API response must be WAIT or REJECT and explicitly report all execution flags false.

## NOVA backend contract
PR #322 `feature/nova-mt5-decision-api` expects:
- Local Controller -> Decision API request envelope `nova.mt5-request.v1`
- EA signal `mt5ea.signal.v1`
- 30 exact module names/votes and vote totals
- HMAC-SHA256 signing by Local Controller; EA does not hold NOVA M2M secrets
- Trusted Bridge snapshot, candidate risk from MT5 `order_calc_profit`, dedupe and account risk reservation
- Server-side Risk Gate policy `nova-mt5-risk.v2`: Daily Loss 10%, Aggregate Open Risk 9%, max 5 orders, Entry Lock Only

The Decision API currently returns WAIT even when risk passes because it is research-only.
It has no order execution route. Missing candidate, Bridge evidence, credentials, bindings,
or stale risk data must fail closed.

## Current blockers
1. Candidate sizing inputs are intentionally unset (volume=0, stop points=0); no per-trade sizing policy has been approved.
2. The local Controller endpoint/response adapter must be verified against PR #322 before enabling the bridge.
3. Local token file must be provisioned securely; do not commit or include it in .set.
4. MetaEditor executable was not found in the searched install paths; compile not run.
5. Demo runtime and exact-head backend CI remain unverified.
6. ONNX model not found in searched MT5 data root or Documents; broader search remains incomplete.
7. No Quant/Decision/Risk response has been proven end-to-end from this EA.

## Activation restrictions
- Keep Controller Bridge OFF until endpoint contract, token-file provisioning, and candidate sizing are approved.
- Keep Live Trading OFF. This EA has no execution code.
- Do not label this EA production-ready or AI execution-ready until compile, Demo runtime,
  backend CI, candidate-risk tests, tenant isolation, and fail-closed tests have evidence.
