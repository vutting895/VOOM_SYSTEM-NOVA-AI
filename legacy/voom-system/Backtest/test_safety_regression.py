# -*- coding: utf-8 -*-
"""Offline safety regression checks; no MT5 orders or network calls."""
import os, sys, json
from pathlib import Path
from types import SimpleNamespace
PROJECT_ROOT = Path(__file__).resolve().parents[1]
BASE = r"C:\Program Files\AI_Bridge"
os.chdir(BASE); sys.path.insert(0, BASE)
import smart_scalping as ss
results = {}
class FakeAI:
    def needs_retrain(self): return False
class FakeTuner:
    current_params = {"min_conf": 0.60, "risk_percent": 0.25, "max_trades": 5, "event_boost": 0.15}
    monitor = SimpleNamespace(current_drawdown=0.0)
server = ss.NetworkServer("127.0.0.1", 0, {"mt5": object(), "ai": FakeAI(), "tuner": FakeTuner()})
original_pnl = ss.get_daily_account_pnl
original_account = ss.mt5.account_info
try:
    ss.mt5.account_info = lambda: SimpleNamespace(balance=952.18, equity=952.18)
    ss.get_daily_account_pnl = lambda: (-300.01, None)
    reply = server._analyze()
    results["daily_loss_over_limit_holds"] = {"ok": reply.startswith("SIGNAL|dir=HOLD") and "Daily loss limit" in reply, "reply": reply}
    ss.get_daily_account_pnl = lambda: (None, "Daily deal history unavailable")
    reply = server._analyze()
    results["unverified_pnl_fails_closed"] = {"ok": reply.startswith("SIGNAL|dir=HOLD") and "unavailable" in reply.lower(), "reply": reply}
finally:
    ss.get_daily_account_pnl = original_pnl
    ss.mt5.account_info = original_account
results["risk_config"] = {"ok": ss.MAX_DAILY_LOSS_USD == 300.0 and ss.RISK_PERCENT <= 0.25 and ss.MAX_DRAWDOWN_STOP <= 0.03, "daily_loss_usd": ss.MAX_DAILY_LOSS_USD, "risk_percent": ss.RISK_PERCENT, "drawdown_stop": ss.MAX_DRAWDOWN_STOP}
results["all_safety_tests_passed"] = all(v["ok"] for v in results.values() if isinstance(v, dict) and "ok" in v)
report_dir = PROJECT_ROOT / "Reports"
report_dir.mkdir(parents=True, exist_ok=True)
out = report_dir / "bridge_safety_regression_report.json"
out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(results, indent=2, ensure_ascii=False)); print("REPORT=" + str(out))
