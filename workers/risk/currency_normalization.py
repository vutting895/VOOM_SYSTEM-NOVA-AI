"""Fail-closed monetary normalization for broker accounts and FX reporting.

No network access or broker writes occur here. Callers must inject verified
broker denomination rules and fresh FX quotes from trusted adapters.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_CEILING
from typing import Iterable


class CurrencyNormalizationError(ValueError):
    """Base error for unsafe or unavailable monetary conversions."""


class UnsupportedDenomination(CurrencyNormalizationError):
    """Raised when broker-native account units cannot be authoritatively mapped."""


class MissingExchangeRate(CurrencyNormalizationError):
    """Raised when no validated FX conversion path is available."""


class StaleExchangeRate(CurrencyNormalizationError):
    """Raised when an FX quote is outside its permitted freshness window."""


def money(value: Decimal | int | str) -> Decimal:
    """Parse a finite decimal without passing through binary floating point."""
    if isinstance(value, bool) or isinstance(value, float):
        raise CurrencyNormalizationError("money values must be Decimal, int, or decimal string")
    try:
        result = value if isinstance(value, Decimal) else Decimal(value)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise CurrencyNormalizationError("invalid decimal money value") from exc
    if not result.is_finite():
        raise CurrencyNormalizationError("money value must be finite")
    return result


def _aware_utc(value: datetime, field: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise CurrencyNormalizationError(f"{field} must be timezone-aware")
    return value.astimezone(timezone.utc)


@dataclass(frozen=True)
class DenominationRule:
    """Trusted mapping from a broker-native account unit to a currency unit.

    Example only: 1 USC native unit = 0.01 USD. Such a rule must be sourced
    from broker-confirmed metadata/documentation before production registration.
    """
    broker: str
    native_currency: str
    denomination: str
    currency: str
    currency_units_per_native_unit: Decimal
    evidence_id: str

    def __post_init__(self) -> None:
        if not self.broker.strip() or not self.denomination.strip():
            raise CurrencyNormalizationError("broker and denomination are required")
        if (len(self.native_currency) != 3 or not self.native_currency.isalpha()
                or self.native_currency != self.native_currency.upper()):
            raise CurrencyNormalizationError("native currency must be an uppercase 3-letter code")
        if len(self.currency) != 3 or not self.currency.isalpha() or self.currency != self.currency.upper():
            raise CurrencyNormalizationError("canonical currency must be an uppercase 3-letter code")
        if money(self.currency_units_per_native_unit) <= 0:
            raise CurrencyNormalizationError("denomination multiplier must be positive")
        if not self.evidence_id.strip():
            raise CurrencyNormalizationError("denomination rule requires an evidence identifier")


@dataclass(frozen=True)
class FXQuote:
    """A timestamped executable FX quote; rate is quote currency per base unit."""
    base: str
    quote: str
    bid: Decimal
    ask: Decimal
    observed_at: datetime
    source: str
    quote_id: str

    def __post_init__(self) -> None:
        if (len(self.base) != 3 or len(self.quote) != 3 or not self.base.isalpha()
                or not self.quote.isalpha() or self.base != self.base.upper()
                or self.quote != self.quote.upper() or self.base == self.quote):
            raise CurrencyNormalizationError("FX pair must contain two distinct uppercase 3-letter currencies")
        bid, ask = money(self.bid), money(self.ask)
        if bid <= 0 or ask < bid:
            raise CurrencyNormalizationError("FX bid/ask must be positive and non-crossed")
        _aware_utc(self.observed_at, "FX observed_at")
        if not self.source.strip() or not self.quote_id.strip():
            raise CurrencyNormalizationError("FX source and quote_id are required")


@dataclass(frozen=True)
class ConversionResult:
    amount: Decimal
    source_currency: str
    target_currency: str
    path: tuple[str, ...]
    quote_ids: tuple[str, ...]
    sources: tuple[str, ...]
    oldest_quote_at: datetime | None


class FXRateBook:
    """Converts with fresh bid/ask quotes; no synthetic or implicit rates."""

    def __init__(self, quotes: Iterable[FXQuote], *, max_age_seconds: int = 30,
                 future_tolerance_seconds: int = 2):
        if max_age_seconds <= 0 or future_tolerance_seconds < 0:
            raise CurrencyNormalizationError("invalid FX freshness policy")
        self.quotes = tuple(quotes)
        seen_pairs: set[frozenset[str]] = set()
        for quote in self.quotes:
            pair = frozenset((quote.base, quote.quote))
            if pair in seen_pairs:
                raise CurrencyNormalizationError(f"ambiguous duplicate FX pair: {quote.base}/{quote.quote}")
            seen_pairs.add(pair)
        self.max_age_seconds = max_age_seconds
        self.future_tolerance_seconds = future_tolerance_seconds

    def convert(self, amount: Decimal | int | str, source: str, target: str,
                *, as_of: datetime) -> ConversionResult:
        value = money(amount)
        source, target = source.upper(), target.upper()
        now = _aware_utc(as_of, "as_of")
        if len(source) != 3 or len(target) != 3:
            raise CurrencyNormalizationError("source and target must be 3-letter currency codes")
        if source == target:
            return ConversionResult(value, source, target, (source,), (), (), None)

        # Validate every candidate quote before graph traversal. Stale quotes are
        # not silently ignored: an apparently available but stale path is unsafe.
        edges: dict[str, list[tuple[str, FXQuote, bool]]] = {}
        stale_pairs: list[str] = []
        for quote in self.quotes:
            observed = _aware_utc(quote.observed_at, "FX observed_at")
            age = (now - observed).total_seconds()
            if age < -self.future_tolerance_seconds or age > self.max_age_seconds:
                stale_pairs.append(f"{quote.base}/{quote.quote}:{quote.quote_id}")
                continue
            edges.setdefault(quote.base, []).append((quote.quote, quote, False))
            edges.setdefault(quote.quote, []).append((quote.base, quote, True))

        candidates: list[ConversionResult] = []
        max_hops = min(4, max(0, len(edges)))
        
        def walk(currency: str, current: Decimal, path: tuple[str, ...],
                 ids: tuple[str, ...], sources: tuple[str, ...],
                 times: tuple[datetime, ...]) -> None:
            if len(ids) >= max_hops:
                return
            for next_currency, quote, inverse in edges.get(currency, []):
                if next_currency in path:
                    continue
                # Conservative side: assets convert at bid; liabilities at ask.
                if not inverse:
                    rate = quote.ask if current < 0 else quote.bid
                else:
                    rate = (Decimal(1) / quote.bid) if current < 0 else (Decimal(1) / quote.ask)
                converted = current * rate
                next_path = path + (next_currency,)
                next_ids = ids + (quote.quote_id,)
                next_sources = sources + (quote.source,)
                next_times = times + (_aware_utc(quote.observed_at, "FX observed_at"),)
                if next_currency == target:
                    candidates.append(ConversionResult(
                        converted, source, target, next_path, next_ids, next_sources,
                        min(next_times) if next_times else None,
                    ))
                else:
                    walk(next_currency, converted, next_path, next_ids, next_sources, next_times)

        walk(source, value, (source,), (), (), ())
        if candidates:
            # Pick the lowest converted value: conservative for positive assets
            # and the largest absolute liability for negative risk amounts.
            return min(candidates, key=lambda result: (
                result.amount, len(result.quote_ids), result.path, result.quote_ids
            ))

        if stale_pairs:
            raise StaleExchangeRate("no fresh FX path; stale quotes: " + ", ".join(stale_pairs))
        raise MissingExchangeRate(f"no FX conversion path from {source} to {target}")


class CurrencyNormalizer:
    """Converts account-native values to USD; THB is optional reporting only."""

    def __init__(self, denomination_rules: Iterable[DenominationRule]):
        self._rules: dict[tuple[str, str, str], DenominationRule] = {}
        for rule in denomination_rules:
            key = (rule.broker.strip().casefold(), rule.native_currency.strip().upper(),
                   rule.denomination.strip().casefold())
            if key in self._rules:
                raise CurrencyNormalizationError(f"duplicate denomination rule: {key}")
            self._rules[key] = rule

    def resolve_rule(self, broker: str, native_currency: str,
                     account_denomination: str) -> DenominationRule:
        key = (broker.strip().casefold(), native_currency.strip().upper(),
               account_denomination.strip().casefold())
        rule = self._rules.get(key)
        if rule is None:
            raise UnsupportedDenomination(
                f"no broker-verified denomination rule for {key[0]} / {key[1]} / {key[2]}"
            )
        return rule

    def to_usd(self, amount: Decimal | int | str, *, broker: str,
               native_currency: str, account_denomination: str,
               fx: FXRateBook, as_of: datetime) -> ConversionResult:
        rule = self.resolve_rule(broker, native_currency, account_denomination)
        currency_amount = money(amount) * money(rule.currency_units_per_native_unit)
        converted = fx.convert(currency_amount, rule.currency, "USD", as_of=as_of)
        return ConversionResult(
            converted.amount, native_currency.upper(), "USD",
            converted.path if rule.currency == native_currency.upper()
            else (native_currency.upper(),) + converted.path,
            converted.quote_ids, (rule.evidence_id,) + converted.sources,
            converted.oldest_quote_at,
        )

    def to_reporting_thb(self, usd_amount: Decimal | int | str, *,
                         reporting_fx: FXRateBook, as_of: datetime) -> ConversionResult:
        """Reporting-only conversion; failure must not affect the USD risk decision."""
        return reporting_fx.convert(usd_amount, "USD", "THB", as_of=as_of)

    def to_usd_profit_value(self, amount: Decimal | int | str, *,
                            profit_currency: str, fx: FXRateBook,
                            as_of: datetime) -> ConversionResult:
        """Normalize symbol profit/tick/commission values into the USD risk unit."""
        return fx.convert(amount, profit_currency, "USD", as_of=as_of)


@dataclass(frozen=True)
class StopLossEstimate:
    """Conservative stop-loss estimate normalized to USD."""
    ticks: Decimal
    native_loss: Decimal
    native_currency: str
    usd_loss: Decimal
    fx_path: tuple[str, ...]
    quote_ids: tuple[str, ...]
    fx_sources: tuple[str, ...]


def estimate_stop_loss_usd(
    *,
    volume_lots: Decimal | int | str,
    entry_price: Decimal | int | str,
    stop_loss_price: Decimal | int | str,
    tick_size: Decimal | int | str,
    tick_value_loss_native_per_lot: Decimal | int | str,
    estimated_other_costs_native: Decimal | int | str,
    broker: str,
    native_currency: str,
    account_denomination: str,
    normalizer: CurrencyNormalizer,
    fx: FXRateBook,
    as_of: datetime,
) -> StopLossEstimate:
    """Estimate loss using MT5 tick-loss value in account deposit currency.

    Tick count rounds up so a non-integral stop distance cannot understate risk.
    The caller must supply commission/slippage/swap estimate explicitly in
    native account currency. Loss is converted as a liability (conservative FX
    side), then returned as a positive USD risk amount.
    """
    volume = money(volume_lots)
    entry = money(entry_price)
    stop = money(stop_loss_price)
    tick = money(tick_size)
    tick_value = money(tick_value_loss_native_per_lot)
    other_costs = money(estimated_other_costs_native)
    if volume <= 0 or entry <= 0 or stop <= 0 or tick <= 0 or tick_value <= 0:
        raise CurrencyNormalizationError("volume, prices, tick size and tick value must be positive")
    if other_costs < 0:
        raise CurrencyNormalizationError("estimated other costs must be non-negative")
    distance = abs(entry - stop)
    if distance <= 0:
        raise CurrencyNormalizationError("stop loss must differ from entry price")
    ticks = (distance / tick).to_integral_value(rounding=ROUND_CEILING)
    native_loss = ticks * tick_value * volume + other_costs
    converted = normalizer.to_usd(
        -native_loss,
        broker=broker,
        native_currency=native_currency,
        account_denomination=account_denomination,
        fx=fx,
        as_of=as_of,
    )
    return StopLossEstimate(
        ticks=ticks,
        native_loss=native_loss,
        native_currency=native_currency.upper(),
        usd_loss=abs(converted.amount),
        fx_path=converted.path,
        quote_ids=converted.quote_ids,
        fx_sources=converted.sources,
    )


@dataclass(frozen=True)
class USDRiskDecision:
    """Pure USD risk-limit decision; it never authorizes broker execution."""
    allowed: bool
    equity_usd: Decimal
    trade_loss_usd: Decimal
    max_trade_loss_usd: Decimal
    daily_loss_usd: Decimal
    max_daily_loss_usd: Decimal
    reason_codes: tuple[str, ...]


def evaluate_usd_risk_limits(
    *,
    current_equity_usd: Decimal | int | str,
    estimated_trade_loss_usd: Decimal | int | str,
    daily_loss_usd: Decimal | int | str,
    max_per_trade_pct: Decimal | int | str = Decimal("0.01"),
    max_daily_loss_pct: Decimal | int | str = Decimal("0.10"),
) -> USDRiskDecision:
    """Apply the owner-selected 1% trade / 10% daily ceilings to USD values.

    `daily_loss_usd` must already be reconciled from the persisted broker-day
    opening-equity snapshot, including realized and unrealized P&L. This helper
    does not manufacture that snapshot or authorize an order.
    """
    equity = money(current_equity_usd)
    trade_loss = money(estimated_trade_loss_usd)
    daily_loss = money(daily_loss_usd)
    trade_pct = money(max_per_trade_pct)
    daily_pct = money(max_daily_loss_pct)
    if equity <= 0:
        raise CurrencyNormalizationError("current USD equity must be positive")
    if trade_loss < 0 or daily_loss < 0:
        raise CurrencyNormalizationError("loss amounts must be non-negative")
    if not (Decimal("0") < trade_pct <= Decimal("1")):
        raise CurrencyNormalizationError("per-trade risk percentage must be in (0, 1]")
    if not (Decimal("0") < daily_pct <= Decimal("1")):
        raise CurrencyNormalizationError("daily loss percentage must be in (0, 1]")

    max_trade = equity * trade_pct
    max_daily = equity * daily_pct
    reasons: list[str] = []
    if trade_loss > max_trade:
        reasons.append("per_trade_risk_limit")
    if daily_loss >= max_daily:
        reasons.append("daily_loss_limit")
    return USDRiskDecision(
        allowed=not reasons,
        equity_usd=equity,
        trade_loss_usd=trade_loss,
        max_trade_loss_usd=max_trade,
        daily_loss_usd=daily_loss,
        max_daily_loss_usd=max_daily,
        reason_codes=tuple(reasons),
    )


def exness_standard_cent_rule(native_currency: str, *, symbol_name: str) -> DenominationRule:
    """Return the documented Exness USC-cent mapping after a symbol cross-check.

    Exness documents Standard Cent balances in cent currency (for example,
    5 USD is displayed as 500 USC) and uses the -c symbol suffix. This helper
    intentionally supports USC only; other cent currencies need separately
    verified conversion rules before they can be enabled.
    """
    if native_currency.strip().upper() != "USC":
        raise UnsupportedDenomination("only Exness USC has an enabled verified cent mapping")
    if not symbol_name.strip().upper().endswith("C"):
        raise UnsupportedDenomination("Exness USC account requires a verified -c cent symbol")
    return DenominationRule(
        broker="Exness",
        native_currency="USC",
        denomination="standard-cent",
        currency="USD",
        currency_units_per_native_unit=Decimal("0.01"),
        evidence_id="https://get.exness.help/hc/en-us/articles/17537782786588-Standard-Cent-account",
    )


@dataclass(frozen=True)
class MT5TradeRiskResult:
    """Risk calculation result only; not a broker order authorization."""
    stop_loss: StopLossEstimate
    decision: USDRiskDecision
    risk_passed: bool = False


def evaluate_mt5_demo_trade_risk(
    *,
    current_equity_usd: Decimal | int | str,
    daily_loss_usd: Decimal | int | str,
    volume_lots: Decimal | int | str,
    entry_price: Decimal | int | str,
    stop_loss_price: Decimal | int | str,
    tick_size: Decimal | int | str,
    tick_value_loss_native_per_lot: Decimal | int | str,
    estimated_other_costs_native: Decimal | int | str,
    broker: str,
    native_currency: str,
    account_denomination: str,
    normalizer: CurrencyNormalizer,
    fx: FXRateBook,
    as_of: datetime,
) -> MT5TradeRiskResult:
    """Connect MT5-derived stop risk to the USD 1% / 10% risk-limit evaluator.

    This returns a calculation result only. It must not be interpreted as
    approval to submit an order; aggregate risk, drawdown, concurrency, market
    freshness, tenant, Demo-account and kill-switch gates remain independent.
    """
    stop_loss = estimate_stop_loss_usd(
        volume_lots=volume_lots,
        entry_price=entry_price,
        stop_loss_price=stop_loss_price,
        tick_size=tick_size,
        tick_value_loss_native_per_lot=tick_value_loss_native_per_lot,
        estimated_other_costs_native=estimated_other_costs_native,
        broker=broker,
        native_currency=native_currency,
        account_denomination=account_denomination,
        normalizer=normalizer,
        fx=fx,
        as_of=as_of,
    )
    decision = evaluate_usd_risk_limits(
        current_equity_usd=current_equity_usd,
        estimated_trade_loss_usd=stop_loss.usd_loss,
        daily_loss_usd=daily_loss_usd,
    )
    return MT5TradeRiskResult(stop_loss=stop_loss, decision=decision, risk_passed=decision.allowed)
