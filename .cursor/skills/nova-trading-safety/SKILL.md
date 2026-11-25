---
name: nova-trading-safety
description: Use whenever a NOVA task touches brokers, MT5, trading strategies, signals, risk controls, account state, order or position tools, execution permissions, Demo/Live mode, or financial side effects.
---

# NOVA Trading Safety

## Immutable defaults
- Exness MT5 remains Demo/read-only.
- ordersEnabled=false
- executionEnabled=false
- liveTradingEnabled=false
- No order placement, cancellation, position mutation, account mutation, transfer, withdrawal, or fund movement.
- Production deployment remains paused.

## Mandatory checks
1. Verify the current Work Order explicitly authorizes the exact read-only research or implementation scope.
2. Inspect the tool/API catalog and server-side authorization; do not rely on UI labels alone.
3. Confirm no tool path can place orders or mutate broker/account state.
4. Keep risk analysis and model approval separate from execution authorization.
5. Preserve audit logs and fail closed on missing Demo identity, auth, tenant, or safety configuration.

## Research separation
Datacenter owns strategy research, backtesting, model training, evaluation, and model registry. A research result, backtest, model score, or dataset approval never grants broker execution authority.

## Stop conditions
Any request to enable Live Trading, orders, execution, transfers, withdrawals, broker writes, production deployment, or change security/permission controls is a BLOCKED_DECISION unless a new explicit Work Order and required owner approval authorize that exact action. This Skill itself never grants that authority.
