"""Read-only staff API for Voom_system. Requires Supabase service credentials on server only."""
from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
if not SUPABASE_URL.startswith("https://") or not SUPABASE_SERVICE_ROLE_KEY:
    # Fail closed; the API must not start with missing or placeholder credentials.
    raise RuntimeError("Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the trusted server environment.")

db: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
app = FastAPI(title="Voom_system Staff API", version="0.1.0", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://localhost:4173"],
    allow_methods=["GET"],
    allow_headers=["Authorization", "Content-Type"],
)

def require_staff(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    jwt = authorization[7:].strip()
    if not jwt or len(jwt) > 8192:
        raise HTTPException(status_code=401, detail="Invalid session")
    try:
        verified = db.auth.get_user(jwt)
        user = getattr(verified, "user", None)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session")
        profile_result = (
            db.table("customer_profiles")
            .select("user_id,role,account_status,display_name")
            .eq("user_id", str(user.id))
            .maybe_single()
            .execute()
        )
        profile = profile_result.data
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Session verification failed")
    if not profile or profile.get("account_status") != "active":
        raise HTTPException(status_code=403, detail="Active account required")
    if profile.get("role") not in {"staff", "admin"}:
        raise HTTPException(status_code=403, detail="Staff role required")
    return {"user_id": str(user.id), "role": profile["role"]}

@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "voom-staff-api", "mode": "read_only",
            "live_trading_enabled": False, "order_execution": "disabled"}

@app.get("/admin/ai-strategies")
def ai_strategies(_: dict[str, Any] = Depends(require_staff),
                  limit: int = Query(default=100, ge=1, le=100)) -> dict[str, Any]:
    """Read-only registry for strategies; only approved and tested status is shown as ready."""
    rows = db.table("ai_strategies").select(
        "id,strategy_key,display_name,version,description,supported_symbols,supported_timeframes,"
        "risk_profile,lifecycle_status,trading_mode,backtest_passed,out_of_sample_passed,"
        "demo_passed,risk_review_passed,approved_at,updated_at"
    ).order("updated_at", desc=True).limit(limit).execute().data or []
    # Do not expose approval identity or credentials to the dashboard.
    return {"data": rows, "read_only": True, "execution_enabled": False}

@app.get("/admin/heartbeats")
def heartbeats(_: dict[str, Any] = Depends(require_staff),
               limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    rows = db.table("system_heartbeats").select("component,status,last_seen_at,details").order(
        "last_seen_at", desc=True).limit(limit).execute().data or []
    return {"data": rows, "read_only": True}

@app.get("/admin/security-events")
def security_events(_: dict[str, Any] = Depends(require_staff),
                    limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    # Deliberately omit IP hashes, request identifiers, and free-form details from the UI feed.
    rows = db.table("security_events").select(
        "id,user_id,severity,event_type,source,summary,acknowledged_at,created_at"
    ).order("created_at", desc=True).limit(limit).execute().data or []
    return {"data": rows, "read_only": True}

@app.get("/admin/customers")
def customers(_: dict[str, Any] = Depends(require_staff),
              limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    rows = db.table("customer_profiles").select(
        "user_id,display_name,role,account_status,created_at,updated_at"
    ).order("created_at", desc=True).limit(limit).execute().data or []
    return {"data": rows, "read_only": True}

@app.get("/admin/risk-decisions")
def risk_decisions(_: dict[str, Any] = Depends(require_staff),
                   limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    rows = db.table("risk_guard_decisions").select(
        "id,user_id,signal_id,decision,reason_code,created_at"
    ).order("created_at", desc=True).limit(limit).execute().data or []
    return {"data": rows, "read_only": True}

@app.get("/admin/signals")
def signals(_: dict[str, Any] = Depends(require_staff),
            limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    rows = db.table("strategy_signals").select(
        "id,user_id,session_id,symbol,timeframe,direction,entry_price,stop_loss,take_profit_1,take_profit_2,score,source,paper_only,created_at"
    ).order("created_at", desc=True).limit(limit).execute().data or []
    return {"data": rows, "read_only": True, "paper_only": True}

@app.get("/admin/trading-sessions")
def trading_sessions(_: dict[str, Any] = Depends(require_staff),
                     limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    rows = db.table("trading_sessions").select(
        "id,user_id,terminal_id,broker,account_label,environment,connection_status,last_seen_at,created_at"
    ).order("last_seen_at", desc=True).limit(limit).execute().data or []
    return {"data": rows, "read_only": True}
