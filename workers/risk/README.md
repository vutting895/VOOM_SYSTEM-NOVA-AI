# Risk Worker

Scope: independent fail-closed checks for exposure, leverage, drawdown, stale data, market status, and per-account limits. Risk decisions must be reproducible and audited.

Status: scaffold; not connected to EA or broker.

## Currency normalization

`currency_normalization.py` provides a deterministic, network-free core:
- Broker-native account units are mapped through explicit `DenominationRule` records.
- Account values and instrument profit values are normalized to USD using timestamped FX bid/ask quotes.
- Positive assets convert conservatively at bid; liabilities convert at ask (inverse pairs use the corresponding inverse side).
- Multi-hop paths are supported and quote IDs/sources are retained in the result.
- THB is a separate reporting-only conversion from USD. A missing THB quote must suppress THB reporting, never change the USD risk decision.
- Money uses `Decimal`; binary floats, unknown denomination rules, missing rates, stale rates, and invalid timestamps fail closed.

### Important production boundary

This module does not fetch FX rates and does not guess account denomination. A trusted adapter must supply fresh broker/FX metadata and broker-verified denomination rules. Do not register a Cent/Micro multiplier based on account display name. In particular, an account denominated in USD does not automatically have a smaller balance unit merely because it is marketed as a “micro” account; contract size and tick-value metadata are separate instrument properties.

No execution endpoint is implemented here. The MT5 bridge remains read-only, and this module is not authorization to place orders.


### Exness Standard Cent evidence

The verified Exness Standard Cent mapping currently enabled by `exness_standard_cent_rule` is `USC -> USD × 0.01`, and the requested instrument must also carry Exness's documented `c` suffix. Exness states that a 5 USD deposit is displayed as 500 USC and that Standard Cent instruments use cent lots. See the [Exness Standard Cent account specification](https://get.exness.help/hc/en-us/articles/17537782786588-Standard-Cent-account).

Other cent currencies are deliberately not enabled until their exact unit conversion is verified. “Micro” must not be treated as a currency multiplier: if an account reports USD, its account balance remains USD; smaller micro contract sizes must be obtained from instrument contract/tick metadata and valued separately.


### MT5 tick-based stop-loss estimate

`estimate_stop_loss_usd` calculates a conservative stop-loss amount from terminal-supplied tick size, loss tick value (in the account deposit currency), volume and entry/stop prices. Tick count rounds upward. The caller must supply estimated commission/slippage/swap costs explicitly in the native account currency; the helper does not silently assume zero. The resulting loss is converted as a liability (conservative FX side) into USD and can then be passed to `evaluate_usd_risk_limits` for the 1% current-Equity per-trade gate. `evaluate_mt5_demo_trade_risk` composes the stop-loss estimator with the 1% per-trade and 10% daily-loss USD gate in one pure function.

For Exness USC Cent, the account-native tick loss is normalized with the verified USC -> USD 0.01 mapping. For USD Micro accounts, the USD balance is not scaled; the terminal's actual smaller tick value/contract metadata drives the loss estimate.

This remains a pure calculation layer. The legacy `manager_prototype.py` is not replaced or wired to broker execution by this change; full risk-manager integration still requires review of daily-loss snapshot semantics, drawdown, aggregate open risk, and other owner-approved gates.

The adapter returns `risk_passed` as a calculation outcome only; it is not order authorization. It does not replace the existing risk worker or satisfy aggregate open-risk, drawdown, concurrency, market freshness, tenant authentication, Demo-account verification or kill-switch gates. Daily loss must be supplied from the persisted broker-day opening-equity snapshot, with realized and unrealized P&L reconciled by the trusted account adapter.
