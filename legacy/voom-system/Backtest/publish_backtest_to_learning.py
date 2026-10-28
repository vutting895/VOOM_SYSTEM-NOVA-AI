# -*- coding: utf-8 -*-
"""Publish a bounded, reproducible backtest summary into the Research knowledge tree.
Never approves a strategy, trains model weights, or changes trading configuration.
"""
from __future__ import annotations
import argparse, hashlib, json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RESEARCH = ROOT / "Research" / "aiเทรด" / "backtests"

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report", required=True)
    p.add_argument("--csv", required=True, help="Exact imported MT5 CSV used for this report")
    p.add_argument("--output-dir", default=str(DEFAULT_RESEARCH))
    args = p.parse_args()
    report_path, csv_path = Path(args.report).resolve(), Path(args.csv).resolve()
    if not report_path.is_file() or not csv_path.is_file():
        raise FileNotFoundError("Backtest report or source MT5 CSV does not exist")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("status") != "research-only" or report.get("orders_sent") is not False:
        raise ValueError("Report is not marked research-only/no-orders; refusing to publish")
    if not report.get("segments") or not report.get("symbol") or not report.get("timeframe"):
        raise ValueError("Report is missing required dataset or segment metadata")
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in f"{report['symbol']}_{report['timeframe']}")
    dataset_hash = sha256_file(csv_path)
    summary = {
        "schema_version": 1, "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "research_only", "candidate_approval": "not_approved",
        "customer_visible": False, "live_trading_enabled": False, "orders_sent": False,
        "symbol": report["symbol"], "timeframe": report["timeframe"],
        "account_currency": report.get("account_currency", "UNKNOWN"),
        "data_start_utc": report.get("data_start_utc"), "data_end_utc": report.get("data_end_utc"),
        "bars": report.get("bars"), "coverage_days": report.get("coverage_days"),
        "dataset_file_name": csv_path.name, "dataset_sha256": dataset_hash,
        "source_report_file_name": report_path.name, "split": report.get("split"),
        "strategy": report.get("strategy"), "parameters": report.get("parameters"),
        "risk_pct": report.get("risk_pct"), "risk_guard": report.get("risk_guard"),
        "cost_model": report.get("cost_model"), "data_quality": report.get("data_quality"),
        "segments": report["segments"], "trade_rows": report.get("trade_rows"),
        "caveats": report.get("caveats", []),
        "review_requirements": [
            "Verify broker account currency, tick-value interpretation, commission and swap.",
            "Compare with MT5 Strategy Tester and/or tick-level replay.",
            "Review risk limits and out-of-sample robustness; do not optimize on the out-of-sample segment.",
            "Human approval and demo validation are required before any strategy promotion."
        ]
    }
    json_out = out / f"mt5_backtest_{slug}_{stamp}.json"
    md_out = out / f"mt5_backtest_{slug}_{stamp}.md"
    json_out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        f"# MT5 Backtest Research — {report['symbol']} {report['timeframe']}", "",
        f"- Created (UTC): {summary['created_at_utc']}",
        f"- Status: RESEARCH ONLY — not approved; hidden from customers",
        f"- Data: {report.get('data_start_utc')} to {report.get('data_end_utc')} ({report.get('bars')} bars; {report.get('coverage_days')} days)",
        f"- Account currency: {summary['account_currency']}",
        f"- Dataset: {csv_path.name}",
        f"- Dataset SHA-256: {dataset_hash}",
        f"- Split: {report.get('split')}", "",
        "## Segment metrics", "",
        "| Segment | Trades | Return % | Max drawdown % | Win rate % | Profit factor |",
        "|---|---:|---:|---:|---:|---:|"
    ]
    for name, seg in report["segments"].items():
        m = seg.get("metrics", {})
        lines.append(f"| {name} | {m.get('trades')} | {m.get('return_pct')} | {m.get('max_drawdown_pct')} | {m.get('win_rate_pct')} | {m.get('profit_factor')} |")
    lines += ["", "## Research controls", "",
        "- No orders were sent and no production settings were changed.",
        "- This note is an evidence record for MCP retrieval, not an approved trading strategy.",
        "- The backtest uses bar-level spread and a slippage assumption; it is not tick-level execution replay.",
        "- DL score was fixed at zero because a validated historical DL ensemble is not available.",
        "", "## Caveats", ""]
    lines += [f"- {c}" for c in summary["caveats"]]
    lines += ["", "## Required before promotion", ""] + [f"- {r}" for r in summary["review_requirements"]]
    md_out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"status": "published_to_research_only", "json": str(json_out), "markdown": str(md_out),
        "dataset_sha256": dataset_hash, "customer_visible": False, "live_trading_enabled": False}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
