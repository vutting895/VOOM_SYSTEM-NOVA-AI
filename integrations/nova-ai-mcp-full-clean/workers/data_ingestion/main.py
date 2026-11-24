"""Market data ingestion scaffold. Funding ingestion stays disabled until a real adapter exists."""
import asyncio
import json
from datetime import datetime, timezone

import redis
import websockets

class DataIngestionWorker:
    def __init__(self):
        self.redis = redis.Redis(host="localhost", port=6379, decode_responses=True)

    async def binance_ws(self):
        uri = "wss://stream.binance.com:9443/ws/btcusdt@trade"
        async with websockets.connect(uri) as ws:
            while True:
                message = await ws.recv()
                data = json.loads(message)
                event = {
                    "symbol": "BTCUSDT",
                    "price": data.get("p"),
                    "event_time": datetime.now(timezone.utc).isoformat(),
                    "source": "binance_trade_stream",
                    "raw": data,
                }
                self.redis.publish("market:btcusdt", json.dumps(event))

    def run(self):
        print("Market data ingestion started; funding feature is disabled until source-backed history is connected.")
        asyncio.run(self.binance_ws())

if __name__ == "__main__":
    DataIngestionWorker().run()
