"""Diagnostic-only causal Wave3 SMC candidate audit; never trains or submits orders."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "strategy"))

from wave3_ml_pipeline import build_causal_features, load_bars, make_labeled_frame, smc_candidate_trace


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="datasets/exness-demo/XAUUSDm_M15_2022-2026.csv")
    parser.add_argument("--calendar", default="datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv")
    parser.add_argument("--oos-start", default="2026-07-01T00:00:00Z")
    parser.add_argument("--output", default="reports/wave3_smc_candidate_trace_20261101.json")
    args = parser.parse_args()

    data_path = Path(args.data)
    calendar_path = Path(args.calendar)
    frame = load_bars(data_path)
    features = build_causal_features(frame)
    _, _, meta = make_labeled_frame(frame, features)
    oos_start = pd.Timestamp(args.oos_start)
    oos_start = oos_start.tz_localize("UTC") if oos_start.tzinfo is None else oos_start.tz_convert("UTC")
    oos_meta = meta.loc[meta["timestamp"] >= oos_start]
    raw_indices = oos_meta["source_index"].to_numpy(dtype=int)
    trace = smc_candidate_trace(frame, features, raw_indices)

    report = {
        "schema_version": "1.0",
        "status": "diagnostic_only_no_training",
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": {
            "data_path": data_path.as_posix(),
            "data_sha256": sha256_file(data_path),
            "calendar_path": calendar_path.as_posix(),
            "calendar_sha256": sha256_file(calendar_path),
            "symbol": "XAUUSDm",
            "timeframe": "M15",
            "timezone": "UTC",
            "bar_count": len(frame),
            "final_oos_start_utc": oos_start.isoformat().replace("+00:00", "Z"),
            "final_oos_labeled_rows": len(oos_meta),
        },
        "methodology": {
            "uses_closed_bar_features_only": True,
            "uses_future_labels_only_to_reproduce_the_existing_labeled_oos_row_mask": True,
            "final_oos_used_for_tuning": False,
            "model_training_started": False,
            "scoring_weights_changed": False,
            "lookbacks_changed": False,
            "thresholds_changed": False,
            "strategy_gates_changed": False,
        },
        "candidate_trace": trace,
        "safety": {
            "orders_submitted": False,
            "live_trading_enabled": False,
            "deployment_enabled": False,
        },
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": output_path.as_posix(),
        "oos_rows": len(oos_meta),
        "candidate_trace_summary": trace["summary"],
        "model_training_started": False,
        "orders_submitted": False,
    }, indent=2))


if __name__ == "__main__":
    main()
