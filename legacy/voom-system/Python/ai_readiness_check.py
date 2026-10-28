from __future__ import annotations
import json
import hashlib
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "Reports"
DASHBOARD = ROOT / "Dashboard"
SOURCE1_REPORT = REPORTS / "source1_backtest_3y" / "summary.json"
CATALOG = ROOT / "Research" / "aiเทรด" / "customer_catalog.json"
MARKETPLACE_SQL = ROOT / "Supabase" / "migrations" / "20261023_000004_ai_marketplace.sql"
SOURCE1_SQL = ROOT / "Supabase" / "migrations" / "20261023_000005_source1_test_registry.sql"
APPROVAL_RECORDS = REPORTS / "ai_approval_records.json"
CLOUDFLARED_CONFIG = Path.home() / ".cloudflared" / "config.yml"
LIVE_GUARD_FILES = [
    ROOT / "EA" / "SmartScalpingBridge.mq5",
    ROOT / "Python" / "smart_scalping.py",
]
REQUIRED_TESTS = [
    ROOT / "Python" / "test_risk_guard_optimizer.py",
    ROOT / "Backtest" / "test_safety_regression.py",
    ROOT / "Source1_Extracted" / "tests" / "test_backtest_source1.py",
]
LOCAL_SERVICES = {
    "Dashboard localhost:4173": 4173,
    "MT5 Python Bridge localhost:8081": 8081,
    "Bridge HTTP adapter localhost:8082": 8082,
    "Source 1 API localhost:8000": 8000,
    "Staff API localhost:8010": 8010,
}

def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig")), None
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"

def file_sha256(path):
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except Exception:
        return None

def gate(name, passed, detail):
    return {"name": name, "passed": bool(passed), "status": "PASS" if passed else "BLOCKED", "detail": detail}

def run_safe_test(command, cwd, timeout=90):
    try:
        proc = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout)
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return {"passed": proc.returncode == 0, "returncode": proc.returncode,
                "detail": output[-1800:] if output else ("exit code " + str(proc.returncode))}
    except Exception as exc:
        return {"passed": False, "returncode": None,
                "detail": type(exc).__name__ + ": " + str(exc)}

def main():
    now = datetime.now(timezone.utc).isoformat()
    source_report, report_error = read_json(SOURCE1_REPORT)
    catalog, catalog_error = read_json(CATALOG)
    approval_data, approval_error = read_json(APPROVAL_RECORDS)
    sql = MARKETPLACE_SQL.read_text(encoding="utf-8-sig") if MARKETPLACE_SQL.exists() else ""
    source1_sql = SOURCE1_SQL.read_text(encoding="utf-8-sig") if SOURCE1_SQL.exists() else ""
    tunnel_config = CLOUDFLARED_CONFIG.read_text(encoding="utf-8-sig") if CLOUDFLARED_CONFIG.exists() else ""

    strategies = []
    source1_key = "source1-mean-rejection-smc-wave-v6-2"
    source1_registered = source1_key in source1_sql
    registry_match = re.search(r"'source1-mean-rejection-smc-wave-v6-2'.*?array\['M15'\],\s*'[^']+',\s*'([^']+)',\s*'([^']+)'", source1_sql, re.I | re.S)
    source1_lifecycle = registry_match.group(1).lower() if registry_match else "unknown"
    source1_mode = registry_match.group(2).lower() if registry_match else "unknown"
    source1_gates = (source_report or {}).get("gate_status", {})
    approvals = (approval_data or {}).get("approvals", [])
    source1_approval = next((a for a in approvals if a.get("strategy_key") == source1_key and a.get("version") == "6.2-test.1"), {})
    source1_approval_valid = (source1_approval.get("approval_status") == "approved" and
                              bool(source1_approval.get("approver_id")) and bool(source1_approval.get("approved_at")) and
                              bool(source1_approval.get("evidence_reference")))
    source1_checks = [
        gate("Backtest with broker costs", source1_gates.get("backtest_passed") is True,
             "Uses the saved 3-year report; full broker costs are not verified."),
        gate("Out-of-sample validation", source1_gates.get("out_of_sample_passed") is True,
             "Uses the saved out-of-sample gate in the report."),
        gate("Demo forward test", source1_gates.get("demo_passed") is True,
             "Requires recorded demo-forward evidence."),
        gate("Risk review", source1_gates.get("risk_review_passed") is True and (source_report or {}).get("risk_guard_enforced") is True,
             "Requires approved risk review and enforced Risk Guard in the report."),
        gate("Registry lifecycle approved", source1_registered and source1_lifecycle == "approved",
             f"Registry lifecycle is {source1_lifecycle}; testing/research status cannot be approved for customers."),
        gate("Trading mode restricted", source1_mode in ("paper", "demo"),
             f"Registered trading mode is {source1_mode}; live mode requires a separate explicit approval workflow."),
        gate("Human approval evidence", source1_approval_valid,
             "Requires an independently reviewed approval record with approver, timestamp, and evidence reference." if not source1_approval_valid else "Approval record fields are present; authorization remains limited to the approved mode."),
        gate("Execution and integration tests", source1_approval.get("integration_e2e") == "passed" and source1_approval.get("customer_isolation") == "passed",
             "Requires recorded end-to-end EA/Dashboard and customer-isolation evidence."),
    ]
    strategies.append({
        "strategy_key": source1_key,
        "name": "Source 1 Mean Rejection SMC Wave",
        "version": "6.2-test.1",
        "lifecycle": source1_lifecycle,
        "trading_mode": source1_mode,
        "ready_for_service": all(x["passed"] for x in source1_checks),
        "checks": source1_checks,
        "blocking_reasons": [x["detail"] for x in source1_checks if not x["passed"]],
        "evidence": {"backtest_report": str(SOURCE1_REPORT.relative_to(ROOT)).replace("\\", "/"),
                     "backtest_report_sha256": file_sha256(SOURCE1_REPORT),
                     "registry_present": source1_registered,
                     "approval_record_present": bool(source1_approval),
                     "approval_record_sha256": file_sha256(APPROVAL_RECORDS)},
    })

    candidates = (catalog or {}).get("systems", [])
    for item in candidates:
        ev = item.get("evidence") or {}
        lifecycle = str(item.get("status", "research")).lower()
        checks = [
            gate("Reproducible backtest with costs", ev.get("backtest") in ("passed", "approved"), f"Catalog evidence: {ev.get('backtest', 'missing')}."),
            gate("Out-of-sample validation", ev.get("out_of_sample") in ("passed", "approved"), f"Catalog evidence: {ev.get('out_of_sample', 'missing')}."),
            gate("Demo forward validation", ev.get("demo_forward") in ("passed", "approved"), f"Catalog evidence: {ev.get('demo_forward', 'missing')}."),
            gate("Risk review", ev.get("risk_review") in ("passed", "approved"), f"Catalog evidence: {ev.get('risk_review', 'missing')}."),
            gate("Human approval", ev.get("human_approval") == "approved" and bool(ev.get("approved_at")) and bool(ev.get("approver_id")) and bool(ev.get("evidence_reference")), "Requires approved status, approval timestamp, approver reference, and evidence reference."),
            gate("Approved lifecycle", lifecycle == "approved", f"Catalog lifecycle is {lifecycle}; customer_visible alone cannot authorize service."),
            gate("End-to-end and customer-isolation tests", ev.get("integration_e2e") == "passed" and ev.get("customer_isolation") == "passed", "Requires recorded E2E execution-path and cross-customer isolation evidence."),
        ]
        strategies.append({
            "strategy_key": item.get("id", "unknown"),
            "name": item.get("name", "Unnamed candidate"),
            "version": item.get("version", "unknown"),
            "lifecycle": item.get("status", "research"),
            "trading_mode": "paper",
            "ready_for_service": item.get("customer_visible") is True and item.get("approved_for_ai") is True and all(x["passed"] for x in checks),
            "checks": checks,
            "blocking_reasons": [x["detail"] for x in checks if not x["passed"]],
            "evidence": {"catalog_file": str(CATALOG.relative_to(ROOT)).replace("\\", "/")},
        })

    # Execute offline tests. Safety regression only monkeypatches MT5 account/PnL calls;
    # it does not send orders. If the installed bridge is absent, it fails closed.
    risk_test = run_safe_test([sys.executable, str(ROOT / "Python" / "test_risk_guard_optimizer.py")], ROOT)
    source1_test = run_safe_test([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_backtest_source1.py"], ROOT / "Source1_Extracted")
    safety_test = run_safe_test([sys.executable, str(ROOT / "Backtest" / "test_safety_regression.py")], ROOT, timeout=90)
    test_results = {
        "risk_guard_unit_tests": risk_test,
        "source1_backtest_unit_tests": source1_test,
        "installed_bridge_safety_regression": safety_test,
    }

    # System-wide safety/readiness checks. These do not imply a strategy is approved.
    service_checks = []
    for service_name, port in LOCAL_SERVICES.items():
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.35):
                is_listening = True
        except OSError:
            is_listening = False
        service_checks.append(gate(service_name, is_listening,
                                   f"TCP loopback port {port} is {'listening' if is_listening else 'not listening'}."))
    terminal_probe = subprocess.run(["tasklist", "/FI", "IMAGENAME eq terminal64.exe", "/FO", "CSV", "/NH"],
                                    capture_output=True, text=True, encoding="utf-8", errors="replace") if sys.platform == "win32" else None
    mt5_running = bool(terminal_probe and terminal_probe.returncode == 0 and "terminal64.exe" in terminal_probe.stdout.lower())

    system_checks = [
        gate("Marketplace schema exists", bool(sql) and "create table if not exists public.ai_strategies" in sql,
             "Local migration file is checked; deployed Supabase state is not queried."),
        gate("No automatic live enablement", bool(catalog) and (catalog or {}).get("live_trading_enabled") is False and
             (catalog or {}).get("policy", {}).get("never_auto_enable_live_trading") is True,
             "Catalog policy must keep Live Trading disabled by default."),
        gate("EA and bridge source files exist", all(p.is_file() for p in LIVE_GUARD_FILES),
             "Checks file presence only, not terminal runtime or order routing."),
        gate("Required test files exist", all(p.is_file() for p in REQUIRED_TESTS),
             "Checks that regression test files are present; does not claim they passed."),
        gate("Risk Guard unit tests", risk_test["passed"], risk_test["detail"]),
        gate("Source 1 backtest unit tests", source1_test["passed"], source1_test["detail"]),
        gate("Installed bridge safety regression", safety_test["passed"], safety_test["detail"]),
        gate("Approval records file available", approval_data is not None, approval_error or "Approval records parsed; an empty approvals list is valid and approves nothing."),
        gate("Dashboard and staff API not published by tunnel", bool(tunnel_config) and "127.0.0.1:4173" not in tunnel_config and "127.0.0.1:8010" not in tunnel_config and "127.0.0.1:8082" in tunnel_config,
             "Cloudflare config must not route the private Dashboard (4173) or staff API (8010); only the bridge adapter target may be routed."),
        gate("Backtest report available", source_report is not None,
             report_error or "Saved report was parsed successfully."),
        gate("Customer catalog available", catalog is not None,
             catalog_error or "Saved catalog was parsed successfully."),
        gate("MT5 terminal process running", mt5_running,
             "Checks terminal64.exe process presence only; it does not prove an account is connected."),
        *service_checks,
    ]
    blocked = sum(1 for s in strategies if not s["ready_for_service"])
    ready = sum(1 for s in strategies if s["ready_for_service"])
    result = {
        "schema_version": 1,
        "project": "Voom_system",
        "runtime_checks_are_local_only": True,
        "supabase_deployed_schema_verified": False,
        "generated_at_utc": now,
        "checker": "Python/ai_readiness_check.py",
        "policy": "Fail closed: missing, stale, or unverified evidence blocks readiness. This report does not enable trading.",
        "live_trading_enabled": False,
        "customer_selection_enabled": False,
        "system_status": "BLOCKED" if any(not x["passed"] for x in system_checks) else "CHECKED",
        "system_checks": system_checks,
        "test_results": test_results,
        "strategies": strategies,
        "summary": {"strategies_total": len(strategies), "ready_for_service": ready, "blocked_or_testing": blocked,
                    "system_checks_passed": sum(1 for x in system_checks if x["passed"]),
                    "system_checks_total": len(system_checks)},
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    DASHBOARD.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(result, indent=2, ensure_ascii=False)
    # Atomic replacement prevents the dashboard from reading a partially written JSON file.
    for target in (REPORTS / "ai_readiness_report.json", DASHBOARD / "ai_readiness.json"):
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(encoded, encoding="utf-8")
        temporary.replace(target)
    print(json.dumps({"report": str(REPORTS / "ai_readiness_report.json"),
                      "dashboard_feed": str(DASHBOARD / "ai_readiness.json"),
                      "summary": result["summary"], "live_trading_enabled": False}, ensure_ascii=False, indent=2))
    # Blocked readiness is an expected business status, not a checker crash.
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
