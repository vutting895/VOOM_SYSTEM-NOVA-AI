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
