"""Canonical, execution-free contracts for NOVA v1.0."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum


class Timeframe(StrEnum):
    M1 = "M1"
    M5 = "M5"
    M15 = "M15"
    M30 = "M30"
    H1 = "H1"


class SignalSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    FLAT = "FLAT"


@dataclass(frozen=True, slots=True)
class Candle:
    symbol: str
    timeframe: Timeframe
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    tick_volume: int

    def validate(self) -> None:
        if self.symbol not in {"XAUUSD", "XAUUSDm"}:
            raise ValueError("NOVA v1.0 supports XAUUSD only")
        if self.timestamp.tzinfo is None or self.timestamp.utcoffset() != timedelta(0):
            raise ValueError("Candle timestamp must be UTC")
        if min(self.open, self.high, self.low, self.close) <= 0:
            raise ValueError("OHLC values must be positive")
        if self.high < max(self.open, self.close, self.low):
            raise ValueError("Candle high is inconsistent")
        if self.low > min(self.open, self.close, self.high):
            raise ValueError("Candle low is inconsistent")
        if self.tick_volume < 0:
            raise ValueError("tick_volume cannot be negative")


@dataclass(frozen=True, slots=True)
class StrategySignal:
    strategy_id: str
    symbol: str
    timeframe: Timeframe
    side: SignalSide
    confidence: float
    generated_at: datetime
    rationale: str

    def validate(self) -> None:
        if self.symbol not in {"XAUUSD", "XAUUSDm"}:
            raise ValueError("NOVA v1.0 supports XAUUSD only")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be in [0, 1]")
        if self.generated_at.tzinfo is None or self.generated_at.utcoffset() != timedelta(0):
            raise ValueError("generated_at must be UTC")
