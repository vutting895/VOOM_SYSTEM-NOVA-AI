"""
Mean Rejection SMC Wave Bot v6.2 BEST CONFIG
Confluence >=4 | DL Weight 0.25 | Dist 1.8 | Z 2.2
Risk 1% | RR 1:1.5 / 1:3.1 | Volatility + Session Filter
Author: System Export Hub
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional
import numpy as np
import pandas as pd
try:
    from dl_models import FleetEnsemble
except ImportError:
    # Strategy-only analysis can run without the optional deep-learning stack.
    FleetEnsemble = None

# BEST CONFIG — DO NOT EDIT WITHOUT AUTO_TUNE
BEST_CONFIG = {
    "BEST_CONFIG_APPLIED": True,
    "CONFLUENCE_MIN": 4,
    "DL_WEIGHT": 0.25,
    "DIST_ATR_MULT": 1.8,
    "Z_SCORE_THRESH": 2.2,
    "RISK_PCT": 0.01,
    "RR_TP1": 1.5,
    "RR_TP2": 3.1,
    "RR_TP1_CLOSE_PCT": 0.5,
    "VOLATILITY_ATR_MIN": 0.4,
    "VOLATILITY_ATR_MAX": 3.5,
    "SESSION_FILTER": ["London", "NY"],
    "MEAN_PERIOD": 50,
    "SMC_OB_LOOKBACK": 20,
    "FVG_MIN_SIZE_ATR": 0.3,
    "PA_CONFIRMATION": True,
}

@dataclass
class Signal:
    symbol: str
    side: str  # LONG | SHORT
    entry: float
    sl: float
    tp1: float
    tp2: float
    confluence: int
    score: float
    timestamp: datetime
    meta: Dict

class MeanReversionEngine:
    def __init__(self, config=BEST_CONFIG):
        self.cfg = config
        self.logger = logging.getLogger("MeanReversion")

    def calculate_zscore(self, price_series: pd.Series) -> float:
        mean = price_series.rolling(self.cfg["MEAN_PERIOD"]).mean().iloc[-1]
        std = price_series.rolling(self.cfg["MEAN_PERIOD"]).std().iloc[-1]
        z = (price_series.iloc[-1] - mean) / (std + 1e-9)
        return z

    def check_smc_structure(self, df: pd.DataFrame) -> Dict:
        # Order Block + Fair Value Gap detection
        highs = df['high'].values
        lows = df['low'].values
        # Simplified OB: last bearish/bullish imbalance
        ob_bull = lows[-3] < lows[-4] and df['close'].iloc[-1] > df['open'].iloc[-1]
        ob_bear = highs[-3] > highs[-4] and df['close'].iloc[-1] < df['open'].iloc[-1]
        # FVG
        fvg_size = abs(df['high'].iloc[-2] - df['low'].iloc[-2])
        atr = df['atr'].iloc[-1] if 'atr' in df else 1.0
        valid_fvg = fvg_size > self.cfg["FVG_MIN_SIZE_ATR"] * atr
        return {"ob_bull": ob_bull, "ob_bear": ob_bear, "fvg_valid": valid_fvg, "atr": atr}

    def check_volatility_filter(self, atr: float, atr_ma: float) -> bool:
        ratio = atr / (atr_ma + 1e-9)
        return self.cfg["VOLATILITY_ATR_MIN"] <= ratio <= self.cfg["VOLATILITY_ATR_MAX"]

    def check_session(self) -> bool:
        hour = datetime.now(timezone.utc).hour
        # London 7-16 UTC, NY 12-21 UTC
        in_london = 7 <= hour <= 16
        in_ny = 12 <= hour <= 21
        if "London" in self.cfg["SESSION_FILTER"] and in_london: return True
        if "NY" in self.cfg["SESSION_FILTER"] and in_ny: return True
        return False

    def generate(self, symbol: str, df: pd.DataFrame, dl_score: float) -> Optional[Signal]:
        if not self.check_session():
            return None
        z = self.calculate_zscore(df['close'])
        smc = self.check_smc_structure(df)
        # Volatility
        if not self.check_volatility_filter(smc["atr"], df['atr'].rolling(50).mean().iloc[-1]):
            return None

        confluence = 0
        side = None

        # Mean Rejection logic
        if z < -self.cfg["Z_SCORE_THRESH"] and smc["ob_bull"] and smc["fvg_valid"]:
            confluence += 2
            side = "LONG"
        elif z > self.cfg["Z_SCORE_THRESH"] and smc["ob_bear"] and smc["fvg_valid"]:
            confluence += 2
            side = "SHORT"

        # PA confirmation
        if self.cfg["PA_CONFIRMATION"]:
            bullish_engulf = df['close'].iloc[-1] > df['open'].iloc[-2] and df['close'].iloc[-2] < df['open'].iloc[-2]
            if (side == "LONG" and bullish_engulf) or (side == "SHORT" and not bullish_engulf):
                confluence += 1

        # DL contribution 25%
        if dl_score > 0.6:
            confluence += 1

        # Distance filter
        dist_atr = abs(df['close'].iloc[-1] - df['close'].rolling(self.cfg["MEAN_PERIOD"]).mean().iloc[-1]) / smc["atr"]
        if dist_atr < self.cfg["DIST_ATR_MULT"]:
            return None
        confluence += 1

        if confluence < self.cfg["CONFLUENCE_MIN"]:
            return None

        # RR Calculation
        entry = float(df['close'].iloc[-1])
        atr = smc["atr"]
        if side == "LONG":
            sl = entry - atr * 1.2
            tp1 = entry + (entry - sl) * self.cfg["RR_TP1"]
            tp2 = entry + (entry - sl) * self.cfg["RR_TP2"]
        else:
            sl = entry + atr * 1.2
            tp1 = entry - (sl - entry) * self.cfg["RR_TP1"]
            tp2 = entry - (sl - entry) * self.cfg["RR_TP2"]

        score = confluence * 0.2 + dl_score * self.cfg["DL_WEIGHT"] + min(dist_atr/3,1)*0.2

        return Signal(symbol, side, entry, sl, tp1, tp2, confluence, score, datetime.now(timezone.utc), {"z": z, "atr": atr})

# === 4 AI FLEET MANAGER ===
class AIFleet:
    def __init__(self):
        self.ensemble = FleetEnsemble() if FleetEnsemble is not None else None
        self.bots: Dict[str, MeanReversionEngine] = {}
        self.running: Dict[str, bool] = {}
        for i in range(1,5):
            bid = f"AI-{i}"
            self.bots[bid] = MeanReversionEngine()
            self.running[bid] = False
        self.logger = logging.getLogger("AIFleet")

    async def start(self, bot_id: str):
        self.running[bot_id] = True
        self.logger.info(f"[{bot_id}] STARTED v6.2 BEST")
        while self.running[bot_id]:
            # trading loop placeholder - fetch data, inference, execute
            await asyncio.sleep(1)

    def stop(self, bot_id: str):
        self.running[bot_id] = False
        self.logger.info(f"[{bot_id}] STOPPED")

    def start_all(self):
        for bid in self.bots: 
            if not self.running[bid]:
                asyncio.create_task(self.start(bid))

    def stop_all(self):
        for bid in self.bots: self.stop(bid)

    def status(self):
        return {bid: {"running": self.running[bid], "config": BEST_CONFIG} for bid in self.bots}

fleet = AIFleet()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Mean Rejection SMC Wave v6.2 BEST — Ready")
