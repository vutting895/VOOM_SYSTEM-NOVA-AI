"""Voom_system authenticated local API. Source 1 analysis only; never executes orders."""
import hmac
import math
import os
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from main_bot_v62_best import fleet, BEST_CONFIG, MeanReversionEngine

TOKEN_FILE = Path(__file__).with_name(".api_token")
TOKEN = os.environ.get("VOOM_API_TOKEN", "").strip()
if not TOKEN and TOKEN_FILE.is_file():
    TOKEN = TOKEN_FILE.read_text(encoding="utf-8").strip()

LIVE_TRADING_ENABLED = False
app = FastAPI(title="Voom_system Control API", version="6.2-safe")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://localhost:4173",
                   "http://127.0.0.1:8000", "http://localhost:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

class Candle(BaseModel):
    open: float
    high: float
    low: float
    close: float
    tick_volume: float = 0.0

class StrategyRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    candles: List[Candle] = Field(min_length=100, max_length=2000)
    # The Source 1 DL ensemble is not validated yet. Never fabricate a positive score.
    dl_score: float = Field(default=0.0, ge=0.0, le=1.0)

def require_auth(authorization: str | None):
    if len(TOKEN) < 40:
        raise HTTPException(status_code=503, detail="API token not configured")
    if not authorization or not hmac.compare_digest(authorization, "Bearer " + TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/")
def root():
    return {"service": "Voom_system", "mode": "paper_only",
            "strategy": "Source 1 Mean Rejection SMC Wave v6.2",
            "live_trading_enabled": False}

@app.get("/health")
def health():
    return {"ok": True, "version": "6.2-safe", "paper_only": True,
            "live_trading_enabled": False, "order_execution": "disabled"}

@app.get("/ai/status")
def status(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    return {"fleet": fleet.status(), "best_config": BEST_CONFIG,
            "paper_only": True, "live_trading_enabled": False}

@app.post("/mt5/telemetry", status_code=202)
def mt5_telemetry(payload: dict, authorization: str | None = Header(default=None)):
    """Authenticated paper-only telemetry relay from MT5 to Cloudflare."""
    require_auth(authorization)
    required = ("source", "mode", "timestamp", "terminalConnected", "accountConnected")
    if not isinstance(payload, dict) or any(k not in payload for k in required):
        raise HTTPException(status_code=400, detail="invalid_telemetry")
    if payload.get("source") != "mt5-ea" or payload.get("mode") != "paper":
        raise HTTPException(status_code=400, detail="paper_only_telemetry_required")
    if not isinstance(payload.get("terminalConnected"), bool) or not isinstance(payload.get("accountConnected"), bool):
        raise HTTPException(status_code=400, detail="invalid_connection_flags")
    try:
        stamp = datetime.fromisoformat(str(payload["timestamp"]).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            raise ValueError("timezone required")
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="invalid_timestamp")
    now = datetime.now(timezone.utc)
    age = (now - stamp.astimezone(timezone.utc)).total_seconds()
    if age < -60 or age > 300:
        raise HTTPException(status_code=400, detail="stale_or_future_telemetry")
    safe = {"source": "mt5-ea", "mode": "paper", "timestamp": stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "terminalConnected": payload["terminalConnected"], "accountConnected": payload["accountConnected"]}
    for key, limit in (("symbol", 32), ("timeframe", 16)):
        if isinstance(payload.get(key), str):
            safe[key] = payload[key][:limit]
    for key in ("bid", "ask"):
        if key in payload:
            try:
                value = float(payload[key])
                if not math.isfinite(value) or value < 0:
                    raise ValueError()
                safe[key] = value
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="invalid_price")
    secret_path = Path(__file__).resolve().parents[1] / "Logs" / "bridge_secret.tmp"
    try:
        bridge_secret = secret_path.read_text(encoding="utf-8").strip()
    except OSError:
        bridge_secret = ""
    if len(bridge_secret) < 32:
        raise HTTPException(status_code=503, detail="bridge_secret_not_configured_on_local_relay")
    request = urllib.request.Request(
        "https://voom-system-api.suwapat787.workers.dev/api/mt5/telemetry",
        data=json.dumps(safe, separators=(",", ":")).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Voom-System-Relay/1.0", "X-Voom-Bridge-Secret": bridge_secret}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read().decode("utf-8"))
            if response.status != 202 or not body.get("accepted"):
                raise HTTPException(status_code=502, detail="cloudflare_telemetry_rejected")
            return {"ok": True, "accepted": True, "tradingMode": "paper", "liveTradingEnabled": False, "orderExecution": "disabled"}
    except urllib.error.HTTPError as exc:
        error_hint = "unavailable"
        try:
            raw_error = exc.read(1024).decode("utf-8", errors="replace")
            error_body = json.loads(raw_error)
            error_hint = str(error_body.get("error", "json_error_without_code"))[:60]
        except (ValueError, AttributeError):
            raw_hint = locals().get("raw_error", "").replace("\r", " ").replace("\n", " ")
            error_hint = raw_hint[:100] if raw_hint else "non_json_response"
        content_type = exc.headers.get("Content-Type", "") if exc.headers else ""
        cf_ray = exc.headers.get("CF-Ray", "") if exc.headers else ""
        print(f"Telemetry upstream HTTP status={exc.code}; error={error_hint}; content_type={content_type}; cf_ray={cf_ray}", flush=True)
        if exc.code in (400, 401, 503):
            raise HTTPException(status_code=exc.code, detail="cloudflare_telemetry_not_configured_or_rejected")
        raise HTTPException(status_code=502, detail="cloudflare_telemetry_error")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Telemetry upstream transport/response error={type(exc).__name__}", flush=True)
        raise HTTPException(status_code=502, detail="cloudflare_telemetry_unreachable")


@app.post("/strategy/analyze")
def analyze_strategy(payload: StrategyRequest, authorization: str | None = Header(default=None)):
    """Analyze supplied OHLCV candles with Source 1 rules; returns signal/HOLD only."""
    require_auth(authorization)
    rows = [c.model_dump() if hasattr(c, "model_dump") else c.dict() for c in payload.candles]
    for row in rows:
        vals = [row[k] for k in ("open", "high", "low", "close", "tick_volume")]
        if not all(math.isfinite(float(v)) for v in vals):
            raise HTTPException(status_code=422, detail="Candle contains non-finite values")
        if row["high"] < max(row["open"], row["close"], row["low"]) or row["low"] > min(row["open"], row["close"], row["high"]):
            raise HTTPException(status_code=422, detail="Invalid OHLC candle")
        if row["tick_volume"] < 0:
            raise HTTPException(status_code=422, detail="Invalid tick volume")
    df = pd.DataFrame(rows)
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs()
    ], axis=1).max(axis=1)
    df["atr"] = tr.ewm(alpha=1 / 14, adjust=False).mean()
    signal = MeanReversionEngine().generate(payload.symbol, df, payload.dl_score)
    if signal is None:
        return {"symbol": payload.symbol, "direction": "HOLD",
                "reason": "Source 1 conditions not met or session/volatility filter blocked",
                "source": "Source1_v6.2", "paper_only": True,
                "executionEnabled": False}
    return {
        "symbol": signal.symbol,
        "direction": "BUY" if signal.side == "LONG" else "SELL",
        "entry": signal.entry, "stopLoss": signal.sl,
        "takeProfit1": signal.tp1, "takeProfit2": signal.tp2,
        "confluence": signal.confluence, "score": signal.score,
        "timestamp": signal.timestamp.isoformat(),
        "reason": "Source 1 strategy candidate; not an execution instruction",
        "source": "Source1_v6.2", "paper_only": True,
        "executionEnabled": False,
    }

@app.post("/ai/{bot_id}/start")
def start_bot(bot_id: str, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    if bot_id not in fleet.bots:
        raise HTTPException(status_code=404, detail="Unknown bot; use AI-1..AI-4")
    raise HTTPException(status_code=409, detail="Background signal-to-execution loop is not implemented; trading disabled")

@app.post("/ai/{bot_id}/stop")
def stop_bot(bot_id: str, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    if bot_id not in fleet.bots:
        raise HTTPException(status_code=404, detail="Unknown bot")
    fleet.stop(bot_id)
    return {"status": "stopped", "bot_id": bot_id}

@app.post("/ai/stop-all")
def stop_all(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    fleet.stop_all()
    return {"status": "stopped_all", "paper_only": True}

@app.post("/ai/start-all")
def start_all(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    raise HTTPException(status_code=409, detail="Signal-to-execution loop is not implemented; trading disabled")

@app.post("/tune/start")
def tune(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    raise HTTPException(status_code=409, detail="Auto-tuning disabled: current objective uses synthetic prices and randomized outcomes")

@app.post("/retrain/now")
def retrain(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    raise HTTPException(status_code=409, detail="Auto-retrain disabled: current trainer uses random tensors and fabricated validation metrics")

