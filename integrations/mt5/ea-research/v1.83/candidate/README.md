# NOVA EA v1.83 Phase 2 candidate

This is a separate research candidate derived from the archived WORKING source. It is not the installed EA.

The candidate has:
- A compile-time hard-disabled execution gate.
- Guards at all identified order-mutating call paths.
- A 10% broker-day daily-loss Entry Lock Only policy.
- A 9% account-wide NOVA open-risk cap across symbols, positions and pending orders.
- Fail-closed handling for positions or pending orders whose downside cannot be calculated.
- A maximum of five concurrent NOVA exposures, counting positions, pending orders and local in-flight reservations.
- Core, Sniper and Recovery category caps that count positions and pending orders across symbols.
- Recovery Trigger, Target and Hard Stop thresholds using first-hit (lower-threshold) semantics.

Compile evidence and remaining limitations are in `COMPILE-RESULT.md`.

Not yet proven: runtime zero broker requests, restart/day-rollover persistence, broker fault handling, MT5 Demo integration, Strategy Tester behavior, and OOS robustness.

Do not install or attach this candidate to a trading chart. The EX5 and raw compiler log are local ignored artifacts.
