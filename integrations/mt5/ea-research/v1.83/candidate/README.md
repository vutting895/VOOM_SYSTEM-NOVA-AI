# NOVA EA v1.83 Phase 2 candidate

This file is a separate research candidate derived from the archived WORKING source. It is not the installed EA.

The candidate has:
- A compile-time hard-disabled execution gate.
- Guards at all identified order-mutating call paths.
- A 10% broker-day daily-loss Entry Lock Only policy.
- Pending-order cancellation on daily lock without flattening existing positions.
- A 9% aggregate open-risk cap.
- A maximum of five concurrent positions, including the separate Sniper magic.
- Recovery and Sniper checks against the same portfolio caps.

Compile evidence and remaining limitations are in `COMPILE-RESULT.md`.

Not yet proven: runtime zero broker requests, restart/day-rollover persistence, broker fault handling, MT5 Demo integration, Strategy Tester performance, and OOS robustness.

Do not install or attach this candidate to a trading chart. The EX5 and raw compiler log are local ignored artifacts.
