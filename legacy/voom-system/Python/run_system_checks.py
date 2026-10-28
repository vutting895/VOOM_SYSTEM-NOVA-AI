from __future__ import annotations
import ast, json, sys, importlib.util
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "Python"
SOURCE1 = ROOT / "Source1_Extracted"
LOG_DIR = ROOT / "Logs"
REPORT = LOG_DIR / "system_check_report.json"
SOURCE2 = Path(r"C:\Program Files\AI_Bridge")
RESULTS = []
def record(name, status, detail=""):
    RESULTS.append({"test": name, "status": status, "detail": detail})
def check_syntax(path):
    try:
        ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        record("syntax:" + path.name, "PASS", "AST parse passed")
    except Exception as exc:
        record("syntax:" + path.name, "FAIL", type(exc).__name__ + ": " + str(exc))
def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    required = ["main_bot_v62_best.py", "dl_models.py", "auto_tune.py", "auto_retrain.py", "api_server.py", "requirements.txt", "docker-compose.yml", ".env.example", "tradingview_pine_v62.pine"]
    missing = [name for name in required if not (SOURCE1 / name).is_file()]
    if missing:
        record("source1_bundle_present", "BLOCKED", "Missing Source 1 files: " + ", ".join(missing))
    else:
        record("source1_bundle_present", "PASS", "All 9 expected Source 1 files present")
        for name in required:
            if name.endswith(".py"):
                check_syntax(SOURCE1 / name)
    guard = PYTHON_DIR / "risk_guard_optimizer.py"
    if guard.is_file():
        check_syntax(guard)
        try:
            spec = importlib.util.spec_from_file_location("voom_risk_guard", guard)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = mod
            spec.loader.exec_module(mod)
            valid, reason = mod.validate_metrics({"trades": 120, "profit_factor": 1.2, "max_drawdown_pct": 4.0, "oos_profit_factor": 1.05})
            rejected, _ = mod.validate_metrics({"trades": 10, "profit_factor": 2.0, "max_drawdown_pct": 1.0, "oos_profit_factor": 2.0})
            safe = mod.clamp_params({"RISK_PCT": 0.5})["RISK_PCT"] <= 0.01
            daily_stop = not mod.can_open_trade(3.0, 1.0, 0.5)[0]
            dd_stop = not mod.can_open_trade(0.0, 7.0, 0.5)[0]
            paper = mod.RiskLimits().paper_trading is True
            ok = valid and not rejected and safe and daily_stop and dd_stop and paper
            record("risk_guard_behavior", "PASS" if ok else "FAIL", "valid_metrics=" + str(reason) + "; hard caps, daily loss, drawdown and paper mode checked")
        except Exception as exc:
            record("risk_guard_behavior", "FAIL", type(exc).__name__ + ": " + str(exc))
    else:
        record("risk_guard_behavior", "FAIL", "risk_guard_optimizer.py not found")
    for name in ("smart_scalping.py", "voom_http_adapter.py", "test_bridge_components_readonly.py"):
        p = SOURCE2 / name
        if p.is_file():
            check_syntax(p)
        else:
            record("source2_file:" + name, "BLOCKED", "Not found at expected path")
    env_path = Path(r"C:\Program Files\AI_Bridge\.env.txt")
    token_path = Path(r"C:\Program Files\AI_Bridge\.bridge_http_token")
    record("private_config_presence", "PASS" if env_path.is_file() else "BLOCKED", "Private config file exists; values not read" if env_path.is_file() else "Private config file not found")
    record("bridge_token_presence", "PASS" if token_path.is_file() else "BLOCKED", "Bridge token file exists; values not read" if token_path.is_file() else "Bridge token file not found")
    counts = {s: sum(1 for r in RESULTS if r["status"] == s) for s in ("PASS", "FAIL", "BLOCKED")}
    summary = {"project": "Voom_system", "test_mode": "READ_ONLY_PAPER_ONLY", "live_trading_enabled": False, "source1_is_authoritative_strategy": True, "source2_used_for_entry_exit_strategy": False, "results": RESULTS, "counts": counts}
    REPORT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    for item in RESULTS:
        print("[" + item["status"] + "] " + item["test"] + ": " + item["detail"])
    print("REPORT=" + str(REPORT))
    print("SUMMARY=" + json.dumps(counts))
    sys.exit(1 if counts["FAIL"] else (2 if missing else 0))
if __name__ == "__main__":
    main()
