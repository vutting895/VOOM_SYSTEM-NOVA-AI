"""Server-only Supabase adapter for Voom_system."""
import os
from typing import Any
from supabase import Client, create_client

class SupabaseStore:
    def __init__(self) -> None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in trusted backend env.")
        if not url.startswith("https://"):
            raise RuntimeError("SUPABASE_URL must use HTTPS.")
        self.client: Client = create_client(url, key)

    def healthcheck(self) -> dict[str, Any]:
        result = self.client.table("system_heartbeats").select("component").limit(1).execute()
        return {"ok": True, "probe_rows": len(result.data or [])}

    def record_security_event(self, *, severity: str, event_type: str, summary: str,
        user_id: str | None = None, source: str = "backend", ip_hash: str | None = None,
        request_id: str | None = None, details: dict[str, Any] | None = None) -> dict[str, Any]:
        if severity not in {"info","low","medium","high","critical"}: raise ValueError("invalid severity")
        payload: dict[str, Any] = {"severity":severity,"event_type":event_type[:100],
            "summary":summary[:1000],"source":source[:100],"details":details or {}}
        if user_id: payload["user_id"] = user_id
        if ip_hash: payload["ip_hash"] = ip_hash[:128]
        if request_id: payload["request_id"] = request_id[:128]
        result = self.client.table("security_events").insert(payload).execute()
        return (result.data or [{}])[0]

    def upsert_heartbeat(self, component: str, status: str,
        details: dict[str, Any] | None = None) -> dict[str, Any]:
        if status not in {"healthy","degraded","offline","unknown"}: raise ValueError("invalid status")
        result = self.client.table("system_heartbeats").upsert(
            {"component":component[:100],"status":status,"details":details or {}},
            on_conflict="component").execute()
        return (result.data or [{}])[0]

    def record_strategy_signal(self, *, user_id: str, symbol: str, direction: str,
        entry_price: float | None = None, stop_loss: float | None = None,
        take_profit_1: float | None = None, take_profit_2: float | None = None,
        score: float | None = None, timeframe: str | None = None,
        session_id: str | None = None) -> dict[str, Any]:
        if direction not in {"BUY","SELL","HOLD"}: raise ValueError("invalid direction")
        payload: dict[str, Any] = {"user_id":user_id,"symbol":symbol.upper()[:32],
            "direction":direction,"source":"source1","paper_only":True}
        optional = {"entry_price":entry_price,"stop_loss":stop_loss,"take_profit_1":take_profit_1,
            "take_profit_2":take_profit_2,"score":score,"timeframe":timeframe,"session_id":session_id}
        payload.update({k:v for k,v in optional.items() if v is not None})
        result = self.client.table("strategy_signals").insert(payload).execute()
        return (result.data or [{}])[0]
