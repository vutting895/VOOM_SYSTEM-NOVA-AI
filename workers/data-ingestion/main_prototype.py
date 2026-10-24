"""Allow-listed public Binance candle ingestion; no credentials or order actions."""
from __future__ import annotations
import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timezone

BASE_URL="https://api.binance.com/api/v3/klines"
ALLOWED_INTERVALS={"1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"}

def fetch_ohlcv(symbol: str="BTCUSDT", interval: str="1h", limit: int=500) -> list[dict]:
    symbol=symbol.upper()
    if not symbol.isalnum() or not 1 <= len(symbol) <= 20: raise ValueError("Invalid symbol")
    if interval not in ALLOWED_INTERVALS: raise ValueError("Unsupported interval")
    if not 1 <= limit <= 1000: raise ValueError("limit must be 1..1000")
    query=urllib.parse.urlencode({"symbol":symbol,"interval":interval,"limit":limit})
    req=urllib.request.Request(BASE_URL+"?"+query,headers={"User-Agent":"VOOM_SYSTEM-NOVA/1.0"})
    with urllib.request.urlopen(req,timeout=15) as response:
        payload=json.loads(response.read().decode("utf-8"))
    if not isinstance(payload,list): raise RuntimeError("Market data provider returned an unexpected payload")
    result=[]
    for row in payload:
        if not isinstance(row,list) or len(row)<6: raise RuntimeError("Malformed candle returned by provider")
        result.append({"timestamp":datetime.fromtimestamp(int(row[0])/1000,timezone.utc).isoformat(),
          "open":float(row[1]),"high":float(row[2]),"low":float(row[3]),"close":float(row[4]),
          "volume":float(row[5]),"source":"binance_public"})
    return result

def main():
    symbol=os.getenv("NOVA_MARKET_SYMBOL","BTCUSDT"); interval=os.getenv("NOVA_MARKET_INTERVAL","1h")
    candles=fetch_ohlcv(symbol,interval,100)
    print(json.dumps({"status":"ok","symbol":symbol,"interval":interval,"count":len(candles),
                      "latest":candles[-1] if candles else None,"orders_enabled":False},ensure_ascii=False))
if __name__=="__main__": main()
