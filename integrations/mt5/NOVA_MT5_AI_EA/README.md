# NOVA_MT5_AI_EA

- Version: 2.001
- Status: Source baseline; compile and Demo runtime verification pending
- Role: Demo-only, read-only MT5 market observer
- Legacy EA: `MT5_AI_Trading_EA v1.100` remains preserved and is not overwritten

## Safety boundary

- Initialization is allowed only on a Demo account.
- No order execution, pending orders, position modification, transfers, or withdrawals.
- No WebRequest or network calls.
- No embedded credentials or tokens.
- No local ONNX inference and no local risk approval.
- Logs closed-bar OHLC, tick volume, bid/ask, spread and timestamp to the MT5 Experts log only.

## Existing NOVA MT5 integration

The repository contains a tenant-isolated read-only Python MT5 Bridge and Cloudflare relay.
The relay supports authenticated read-only GET routes only: `/health`, `/api/account`,
`/api/symbols`, and `/api/quotes`. It rejects POST, order, trade, execution, transfer,
and withdrawal routes.

The Python Bridge reads the logged-in MT5 terminal through the MetaTrader5 package and
serves the allowlisted GET endpoints over an authenticated tenant-specific relay session.
The EA must not invent a POST endpoint or bypass that trust boundary.

The current Quant Meta Decision module returns only `RESEARCH_CANDIDATE` or `NO_TRADE`,
requires trusted walk-forward OOS calibration evidence and at least 30 aligned OOS predictions,
and explicitly never returns an executable order. The current MT5 relay does not expose a
Quant Decision API or an authoritative server Risk Gate endpoint to this EA.

## Required before AI decision integration

1. Define and implement a versioned Decision API contract on the server.
2. Route authenticated MT5 market data to the Quant Engine using tenant-bound identity.
3. Ensure model outputs include provenance, calibration, OOF history and model version.
4. Run the Meta Decision Layer; fail closed to NO_TRADE on missing/invalid evidence.
5. Apply the authoritative server-side Risk Gate after the Quant Decision Layer.
6. Return a signed/auditable non-executable decision response to the EA.
7. Add timeout, replay, duplicate event, tenant mismatch, policy-version mismatch,
   bridge disconnect, and restart-persistence tests.
8. Keep Controller Bridge OFF and order execution absent until separately approved.

## Verification

- Source created on feature branch.
- MetaEditor compile: pending; installed MetaEditor executable has not yet been located.
- Demo runtime: not tested.
- ONNX model discovery: no `.onnx` found in the searched MT5 terminal data root or Documents;
  this is not proof that no model exists elsewhere on the machine.
- Quant Decision API / server Risk Gate: not connected to this EA.
- Live Trading: OFF; no order functionality exists in this build.

Do not describe this source as an AI execution EA until the Decision API, ONNX inference,
server-side Risk Gate, audit evidence and fail-closed tests are implemented and verified.
