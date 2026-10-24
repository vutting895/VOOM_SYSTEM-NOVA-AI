"""HTTP health/status entry point for the VOOM_SYSTEM NOVA MCP service.

This ASGI app is deliberately read-only and paper/test-only. It does not place
orders or expose the stdio MCP server as an unauthenticated HTTP tool API.
"""
import os
from fastapi import FastAPI

app = FastAPI(
    title="VOOM_SYSTEM NOVA API",
    version="1.0.0",
    description="Read-only health/status API. Paper/Test mode only.",
)

@app.get("/")
async def root():
    return {
        "service": "VOOM_SYSTEM-NOVA-AI",
        "status": "ok",
        "mode": "paper-test-only",
        "liveTradingEnabled": False,
        "executionEnabled": False,
        "docs": "/docs",
        "health": "/health",
    }

@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "VOOM_SYSTEM-NOVA-AI",
        "mode": "paper-test-only",
        "liveTradingEnabled": False,
        "executionEnabled": False,
    }

@app.get("/ready")
async def ready():
    # This confirms the ASGI process is responding; it does not imply that
    # Supabase, market-data providers, or the full trading pipeline are connected.
    return {
        "ready": True,
        "dependenciesVerified": False,
        "mode": "paper-test-only",
        "liveTradingEnabled": False,
        "executionEnabled": False,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
