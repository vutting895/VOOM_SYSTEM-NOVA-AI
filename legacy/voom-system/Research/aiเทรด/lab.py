#!/usr/bin/env python3
"""VOOM AI Trading Lab: isolated strategy candidate generation and historical parameter search.
This tool never connects to a broker or places/modifies orders.
"""
from __future__ import annotations
import argparse, csv, hashlib, itertools, json, math, statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CANDIDATES = ROOT / "candidates"
REPORTS = ROOT / "reports"
CUSTOMER_CATALOG = ROOT / "customer_catalog.json"
REQUIRED = {"timestamp", "open", "high", "low", "close"}

def now():
    return datetime.now(timezone.utc).isoformat()

def write_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default

def safe_id(value):
    import re
    value = re.sub(r"[^a-zA-Z0-9_-]", "-", value).strip("-")
    if not value or len(value) > 80:
        raise ValueError("invalid candidate id")
    return value

def init_catalog():
    if not CUSTOMER_CATALOG.exists():
        write_json(CUSTOMER_CATALOG, {
            "schema_version": 1,
            "purpose": "Customer-selectable strategies; only approved_for_ai/demo_validated entries may be listed by an authorized product UI.",
            "customer_selection_enabled": False,
            "live_trading_enabled": False,
            "systems": [],
            "policy": {
                "new_candidates_start_as": "research",
                "required_before_customer_selection": [
                    "reproducible_backtest_with_costs", "out_of_sample_validation",
                    "demo_forward_validation", "risk_review", "human_approval"
                ],
                "never_auto_enable_live_trading": True
            }
        })

def generate(args):
    init_catalog()
    candidate_id = safe_id(args.name or ("candidate-" + datetime.now().strftime("%Y%m%d-%H%M%S")))
    folder = CANDIDATES / candidate_id
    if folder.exists():
        raise SystemExit(f"Candidate already exists: {candidate_id}")
    folder.mkdir(parents=True)
    spec = {
        "id": candidate_id, "name": args.title or "VOOM EMA Trend Candidate",
        "version": "0.1.0", "status": "research",
        "created_at": now(), "generator": "voom-ai-trading-lab-template-mutator",
        "strategy_family": "EMA trend crossover with RSI confirmation",
        "market_data_required": ["timestamp", "open", "high", "low", "close"],
        "parameters": {
            "ema_fast": args.fast, "ema_slow": args.slow, "rsi_period": 14,
            "long_rsi_min": 52, "short_rsi_max": 48,
            "hold_bars_max": 12
        },
        "rules": [
            "Use only closed candles; no look-ahead.",
            "Long candidate: fast EMA crosses above slow EMA and RSI >= long_rsi_min.",
            "Short candidate: fast EMA crosses below slow EMA and RSI <= short_rsi_max.",
            "Close/reverse on opposite signal; enforce hold_bars_max.",
            "All values are research parameters, not production instructions."
        ],
        "risk": {"live_trading_enabled": False, "broker_execution": False,
                 "position_sizing": "not implemented in lab; candidate cannot be deployed directly"},
        "evidence": {"backtest": "not_run", "out_of_sample": "not_run",
                     "demo_forward": "not_run", "human_approval": "pending"},
        "limitations": ["Template candidate only; no profitability claim.",
                        "Must validate symbol/timeframe-specific spread, commission, swap and slippage.",
                        "Not connected to MT5 or customer execution."],
        "data_sha256": None
    }
    write_json(folder / "SYSTEM.json", spec)
    (folder / "SYSTEM.md").write_text(
        f"# {spec['name']}\n\n- ID: {candidate_id}\n- Version: 0.1.0\n- Status: research\n"
        f"- Family: {spec['strategy_family']}\n\n## Parameters\n\n"
        + "\n".join(f"- {k}: {v}" for k, v in spec["parameters"].items())
        + "\n\n## Rules\n\n" + "\n".join(f"{i+1}. {rule}" for i, rule in enumerate(spec["rules"]))
        + "\n\n## Safety\n\nResearch only. This package cannot place trades, change MT5 settings, or enable live trading. "
          "Promotion requires reproducible cost-aware backtest, untouched out-of-sample validation, demo forward test, risk review, and explicit human approval.\n",
        encoding="utf-8")
    cat = read_json(CUSTOMER_CATALOG, {"systems": []})
    cat["systems"].append({"id": candidate_id, "name": spec["name"], "version": spec["version"],
        "status": "research", "directory": f"candidates/{candidate_id}",
        "customer_visible": False, "evidence": spec["evidence"]})
    write_json(CUSTOMER_CATALOG, cat)
    print(json.dumps({"ok": True, "candidate": candidate_id, "status": "research",
                      "folder": str(folder), "customer_visible": False,
                      "live_trading_enabled": False}, ensure_ascii=False, indent=2))

def load_bars(path):
    path = Path(path).expanduser().resolve()
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = {x.strip().lower() for x in (reader.fieldnames or [])}
        if not REQUIRED.issubset(fields):
            raise ValueError("CSV needs columns: timestamp, open, high, low, close (volume optional)")
        rows = []
        for row in reader:
            low = {k.strip().lower(): v for k, v in row.items() if k}
            bar = {"timestamp": low.get("timestamp", "")}
            for k in ("open", "high", "low", "close"):
                bar[k] = float(low[k])
                if not math.isfinite(bar[k]):
                    raise ValueError(f"non-finite {k} value")
            rows.append(bar)
    if len(rows) < 250:
        raise ValueError(f"need at least 250 bars; got {len(rows)}")
    stamps = [r["timestamp"] for r in rows]
    if any(not stamps[i] or stamps[i] > stamps[i+1] for i in range(len(stamps)-1)):
        raise ValueError("CSV timestamps must be non-empty and sorted oldest-to-newest in a consistent sortable format")
    if any(b["close"] <= 0 for b in rows):
        raise ValueError("close prices must be positive")
    return rows

def ema(values, period):
    alpha = 2.0 / (period + 1.0)
    out = [None] * len(values)
    if len(values) < period: return out
    cur = sum(values[:period]) / period
    out[period-1] = cur
    for i in range(period, len(values)):
        cur = alpha * values[i] + (1-alpha) * cur
        out[i] = cur
    return out

def rsi(values, period=14):
    out = [None] * len(values)
    if len(values) <= period: return out
    gains = [max(values[i]-values[i-1], 0) for i in range(1, len(values))]
    losses = [max(values[i-1]-values[i], 0) for i in range(1, len(values))]
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    def val(g, l): return 100.0 if l == 0 and g > 0 else (50.0 if l == 0 and g == 0 else 100-100/(1+g/l))
    out[period] = val(avg_g, avg_l)
    for i in range(period+1, len(values)):
        avg_g = (avg_g*(period-1) + gains[i-1]) / period
        avg_l = (avg_l*(period-1) + losses[i-1]) / period
        out[i] = val(avg_g, avg_l)
    return out

def evaluate(bars, params, cost_bps=2.0):
    closes = [b["close"] for b in bars]
    fast, slow = ema(closes, int(params["ema_fast"])), ema(closes, int(params["ema_slow"]))
    rs = rsi(closes, int(params.get("rsi_period", 14)))
    position, entry, age = 0, 0.0, 0
    returns, trades = [], 0
    equity, peak, max_dd = 1.0, 1.0, 0.0
    for i in range(1, len(bars)):
        if fast[i] is None or slow[i] is None or rs[i] is None or fast[i-1] is None or slow[i-1] is None:
            continue
        signal = 0
        if fast[i] > slow[i] and fast[i-1] <= slow[i-1] and rs[i] >= int(params.get("long_rsi_min", 52)):
            signal = 1
        elif fast[i] < slow[i] and fast[i-1] >= slow[i-1] and rs[i] <= int(params.get("short_rsi_max", 48)):
            signal = -1
        if position:
            age += 1
            should_exit = signal == -position or age >= int(params.get("hold_bars_max", 12))
            if should_exit:
                gross = position * (closes[i] / entry - 1.0)
                net = gross - (2.0 * cost_bps / 10000.0)
                returns.append(net); trades += 1
                equity *= max(0.000001, 1.0 + net)
                peak = max(peak, equity)
                max_dd = max(max_dd, (peak-equity)/peak)
                position = 0
        if not position and signal:
            position, entry, age = signal, closes[i], 0
    if position:
        gross = position * (closes[-1] / entry - 1.0)
        net = gross - (2.0 * cost_bps / 10000.0)
        returns.append(net); trades += 1
        equity *= max(0.000001, 1.0 + net)
        peak = max(peak, equity)
        max_dd = max(max_dd, (peak-equity)/peak)
    wins = sum(x > 0 for x in returns)
    avg = statistics.mean(returns) if returns else 0.0
    # Conservative ranking penalizes drawdown and low trade count; not a guarantee of future returns.
    score = (equity - 1.0) - max_dd * 0.75 + min(trades, 30) * 0.0002
    return {"bars": len(bars), "trades": trades, "win_rate": wins/trades if trades else 0.0,
            "net_return_pct": (equity-1.0)*100, "max_drawdown_pct": max_dd*100,
            "avg_trade_return_pct": avg*100, "ranking_score": score,
            "cost_bps_per_side": cost_bps}

def train(args):
    bars = load_bars(args.csv)
    digest = hashlib.sha256(Path(args.csv).read_bytes()).hexdigest()
    cut = int(len(bars) * args.train_fraction)
    if cut < 150 or len(bars)-cut < 100:
        raise SystemExit("Split too small; use more bars or train_fraction between 0.55 and 0.75.")
    train_bars, test_bars = bars[:cut], bars[cut:]
    fasts, slows = [5, 8, 10, 12, 16, 20], [24, 30, 40, 50, 60]
    results = []
    for fast, slow in itertools.product(fasts, slows):
        if fast >= slow: continue
        params = {"ema_fast": fast, "ema_slow": slow, "rsi_period": 14,
                  "long_rsi_min": 52, "short_rsi_max": 48, "hold_bars_max": 12}
        tr = evaluate(train_bars, params, args.cost_bps)
        te = evaluate(test_bars, params, args.cost_bps)
        results.append({"parameters": params, "train": tr, "out_of_sample": te,
                        "eligible_for_demo_review": bool(te["trades"] >= args.min_test_trades and
                            te["net_return_pct"] > 0 and te["max_drawdown_pct"] <= args.max_drawdown_pct)})
    results.sort(key=lambda r: r["train"]["ranking_score"], reverse=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = {"generated_at": now(), "mode": "offline_parameter_search_not_model_fine_tuning",
        "data_file_name": Path(args.csv).name, "data_sha256": digest, "bars": len(bars),
        "train_bars": len(train_bars), "out_of_sample_bars": len(test_bars),
        "chronological_split": True, "cost_bps_per_side": args.cost_bps,
        "assumptions": ["close-only signals", "no broker execution", "no leverage or lot sizing",
                        "cost modeled as basis points per side", "not a substitute for tick-level spread/slippage simulation"],
        "best_by_train": results[0] if results else None,
        "out_of_sample_positive_count": sum(r["out_of_sample"]["net_return_pct"] > 0 for r in results),
        "candidate_results": results,
        "warning": "Research ranking only. Parameter selection can overfit; run rolling walk-forward, realistic broker-specific costs, and demo forward tests. Nothing is approved for customer use or live trading."}
    out = REPORTS / ("training_report_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
    write_json(out, report)
    if results:
        best = results[0]
        cid = safe_id("trained-" + digest[:10] + f"-ema{best['parameters']['ema_fast']}-{best['parameters']['ema_slow']}")
        folder = CANDIDATES / cid
        folder.mkdir(parents=True, exist_ok=True)
        spec = {"id": cid, "name": "VOOM Auto-Optimized EMA Candidate", "version": "0.1.0",
            "status": "research", "preliminary_holdout_screen_passed": best["eligible_for_demo_review"],
            "created_at": now(), "generator": "offline-grid-search", "data_sha256": digest,
            "parameters": best["parameters"], "train_metrics": best["train"],
            "out_of_sample_metrics": best["out_of_sample"],
            "evidence": {"backtest": "parameter_search_complete", "out_of_sample": "chronological_holdout",
                         "demo_forward": "not_run", "risk_review": "pending", "human_approval": "pending"},
            "customer_visible": False, "live_trading_enabled": False,
            "limitations": report["assumptions"] + ["Not yet demo validated or approved."]}
        write_json(folder / "SYSTEM.json", spec)
        (folder / "SYSTEM.md").write_text(
            "# VOOM Auto-Optimized EMA Candidate\n\n"
            f"- ID: {cid}\n- Status: {spec['status']}\n- Data SHA-256: {digest}\n"
            f"- Training return: {best['train']['net_return_pct']:.3f}%\n"
            f"- Holdout return: {best['out_of_sample']['net_return_pct']:.3f}%\n"
            f"- Holdout max drawdown: {best['out_of_sample']['max_drawdown_pct']:.3f}%\n\n"
            "Research only. These historical metrics do not predict future returns. No MT5 or broker connection exists. "
            "Requires additional rolling walk-forward tests, realistic symbol-specific cost tests, demo forward validation, "
            "risk review, and human approval before customer selection.\n", encoding="utf-8")
        cat = read_json(CUSTOMER_CATALOG, {"systems": []})
        if not any(x.get("id") == cid for x in cat["systems"]):
            cat["systems"].append({"id": cid, "name": spec["name"], "version": spec["version"],
                "status": spec["status"], "directory": f"candidates/{cid}",
                "customer_visible": False, "evidence": spec["evidence"]})
            write_json(CUSTOMER_CATALOG, cat)
        report["generated_candidate"] = {"id": cid, "status": spec["status"], "customer_visible": False}
        write_json(out, report)
    print(json.dumps({"ok": True, "report": str(out), "candidate_count": len(results),
        "generated_candidate": report.get("generated_candidate"),
        "customer_visible": False, "live_trading_enabled": False}, ensure_ascii=False, indent=2))

def list_candidates(_args):
    init_catalog()
    cat = read_json(CUSTOMER_CATALOG, {"systems": []})
    print(json.dumps({"count": len(cat.get("systems", [])), "systems": cat.get("systems", []),
        "customer_selection_enabled": cat.get("customer_selection_enabled", False),
        "live_trading_enabled": False}, ensure_ascii=False, indent=2))

def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    g = sub.add_parser("generate", help="generate an isolated research candidate")
    g.add_argument("--name", default="")
    g.add_argument("--title", default="VOOM EMA Trend Candidate")
    g.add_argument("--fast", type=int, default=10)
    g.add_argument("--slow", type=int, default=40)
    g.set_defaults(func=generate)
    t = sub.add_parser("train", help="offline parameter search on historical OHLCV CSV")
    t.add_argument("--csv", required=True)
    t.add_argument("--train-fraction", type=float, default=0.7)
    t.add_argument("--cost-bps", type=float, default=2.0, help="estimated transaction cost in basis points per side")
    t.add_argument("--min-test-trades", type=int, default=10)
    t.add_argument("--max-drawdown-pct", type=float, default=20.0)
    t.set_defaults(func=train)
    l = sub.add_parser("list", help="list generated candidates and visibility state")
    l.set_defaults(func=list_candidates)
    args = p.parse_args()
    if getattr(args, "train_fraction", 0.7) <= 0.5 or getattr(args, "train_fraction", 0.7) >= 0.85:
        p.error("--train-fraction must be >0.5 and <0.85")
    if getattr(args, "cost_bps", 0) < 0:
        p.error("--cost-bps cannot be negative")
    args.func(args)

if __name__ == "__main__":
    main()
