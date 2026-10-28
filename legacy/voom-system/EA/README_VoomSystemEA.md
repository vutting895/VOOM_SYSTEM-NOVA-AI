# VoomSystemEA v1.00

## Role
Replacement EA candidate for Voom_system Source 1. It sends completed OHLCV bars from MT5 to the authenticated local Source 1 API and displays the returned candidate signal on the chart.

## Safety status
- PAPER ONLY; no `CTrade` calls and no order-send/modify/close logic are included.
- API URL must be localhost (`127.0.0.1` or `localhost`).
- API response must explicitly include `paper_only: true` and `executionEnabled: false`; otherwise the EA blocks the response.
- Source 1 API token is entered locally in MT5 Inputs and must not be committed to Git or pasted into chat.
- `dl_score` remains 0.0 because the Source 1 DL ensemble has not been validated.

## Install for demo validation
1. Copy `VoomSystemEA.mq5` into the active MT5 terminal's `MQL5\Experts\Voom_system\` folder.
2. Compile it with MetaEditor. Check that the compile log reports 0 errors and 0 warnings.
3. In MT5, add `http://127.0.0.1:8000` to Tools > Options > Expert Advisors > Allow WebRequest for listed URL.
4. Start the local Source 1 API using the project's documented environment and token. Do not expose this API publicly.
5. Attach `VoomSystemEA` to a chart, set `InpPaperOnly=true`, set the local token, and use M15 initially.
6. Confirm the panel changes to `PAPER / HOLD` or `PAPER CANDIDATE - NOT EXECUTED`, and check Experts/API logs for valid responses.

## Known limitations / release gates
- This build does not execute trades or manage TP1/TP2 partial exits.
- Validate candle order and API response handling against actual MT5 data.
- The Source 1 backtest currently fails acceptance criteria; do not enable real-money trading based on this EA.
- Do not delete the legacy `SmartScalpingBridge` files yet. Verify which EA is attached to each chart and confirm no legacy instance is trading before retiring it.
- Any future execution build requires strategy retesting, independent risk controls, demo forward test, and explicit human approval.
