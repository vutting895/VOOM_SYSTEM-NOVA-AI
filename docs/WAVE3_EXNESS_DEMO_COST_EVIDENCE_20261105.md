# Exness Demo cost evidence — 2026-11-05

## Scope and method

Read-only inspection of the connected MetaTrader 5 terminal. The probe read account metadata, `XAUUSDm` symbol specifications, and aggregate deal-history fields only. It did not emit account login, user name, order/deal ticket, comments, or per-deal records. No order, position mutation, account setting, or provider-side change was made.

Capture time: `2026-11-05T15:55:19.498191Z`.

## Account evidence from the connected terminal

- Company: Exness Technologies Ltd
- Server: Exness-MT5Trial7
- MT5 account trade mode: DEMO
- Deposit currency: USD

This confirms the connected terminal was on the Exness Demo server and MT5 reported Demo mode. It does **not** reveal the account subtype (Standard, Standard Cent, Pro, Raw Spread, or Zero) or its swap-free status.

## Live `XAUUSDm` symbol snapshot

| Property | Value |
|---|---:|
| Digits | 3 |
| Point / tick size | 0.001 |
| Contract size | 100 |
| Minimum volume / step | 0.01 / 0.01 lot |
| Tick value | USD 0.10 per lot |
| Swap mode | 1 = points |
| Swap long | -630.6 points |
| Swap short | 0.0 points |
| 3-day rollover enum | 3 = Wednesday |
| Profit currency | USD |

Given the terminal's point/tick size and tick value, the current snapshot implies approximately:

- 0.01-lot long standard rollover: USD -0.6306
- 0.01-lot long Wednesday triple rollover: USD -1.8918
- 0.01-lot short standard rollover: USD 0.00

These values are calculations from the **current symbol snapshot only**, not historical swap postings or a historical per-day rate schedule.

The market-data export metadata captured on 2026-10-29 recorded long swap -492 points and short swap 0. The 2026-11-05 live snapshot is -630.6 points. This change proves that one current value must not be applied across the entire historical training period.

MQL5 documents swap mode `SYMBOL_SWAP_MODE_POINTS` and the separate `SYMBOL_SWAP_ROLLOVER3DAYS` property. The `ENUM_DAY_OF_WEEK` value 3 corresponds to Wednesday:
- [MQL5 symbol properties](https://www.mql5.com/en/docs/constants/environment_state/marketinfoconstants)
- [MQL5 day-of-week enumeration](https://www.mql5.com/en/book/basis/builtin_types/enums)

Exness documents swap at 21:00 UTC in summer and 22:00 UTC in winter, with metals' triple swap on Wednesday and possible public/bank-holiday adjustments:
- [Exness — About swap](https://get.exness.help/hc/en-us/articles/360014709151-About-swap)
- [Exness — Instrument trading hours and rollover](https://get.exness.help/hc/en-us/articles/4405235684498-Instrument-trading-hours)

## Commission evidence and unresolved account subtype

Read-only `history_deals_get` range: [2022-07-21T00:00:00Z, 2026-11-06T00:00:00Z).

- Four total history deals across all instruments.
- Two `XAUUSDm` deals, representing one distinct position: one 0.01-lot entry and one 0.01-lot exit.
- Aggregate `XAUUSDm` commission: USD 0.00.
- Aggregate `XAUUSDm` swap: USD 0.00.

One round trip with zero booked commission is insufficient to prove the account subtype or the instrument commission schedule. Zero booked swap does not prove the account is swap-free; the single position may simply not have crossed a rollover.

Exness' current public guidance says only Raw Spread and Zero accounts charge trading commission; the precise commission is instrument-specific and shown in the Personal Area. The current XAU commodities specification states USD 3.5 per lot per side for Raw Spread and USD 5.5 per lot per side for Zero. It describes `XAUUSD`, but the exact mapping to this server's suffixed `XAUUSDm` and the connected account's subtype have **not** been independently verified:
- [Exness — Are trading accounts charged a commission fee?](https://get.exness.help/hc/en-us/articles/360012007919-Are-trading-accounts-charged-a-commission-fee)
- [Exness — Commodities / XAU contract specifications](https://get.exness.help/hc/en-us/articles/17854173039388-Commodities)

Do not apply USD 0, USD 3.5, or USD 5.5 per lot per side to labels until the owner confirms the Demo account subtype in the Personal Area and the XAUUSDm contract specification is matched. No login, password, token, or account identifier should be pasted into chat.

## Challenger treatment

- Commission: **UNVERIFIED** for the connected account and exact `XAUUSDm` specification.
- Swap: current symbol snapshot is verified, but historical effective-date rates, swap-free status, rollover calendar and holiday adjustments are **NOT VERIFIED**.
- The previous backtest's zero commission assumption and omitted swap are not accepted as verified cost evidence.
- First-hit net-label generation remains disabled. The existing builder is not considered cost-complete until both commission and timestamped swap/rollover charges are modeled.
- No FVG definition is selected from the historical Final OOS; no model was trained; the frozen v6.2.6.3 benchmark was not changed.
