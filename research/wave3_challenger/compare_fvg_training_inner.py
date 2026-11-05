"""Causal, event-count-only FVG comparison on pre-Final-OOS data.

Only closed XAUUSDm M15 bars with timestamps strictly before 2026-07-01
are converted to numeric OHLC and passed to the FVG event trace.
Final-OOS rows are excluded before parsing their OHLC values.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from research.wave3_challenger.fvg_events import build_bullish_fvg_event_trace

EXPECTED_DATA_SHA256 = "0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266"
FINAL_OOS_START = datetime(2026, 7, 1, tzinfo=timezone.utc)
BAR_MINUTES = 15


def parse_utc(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp_missing")
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ValueError("timestamp_must_be_utc")
    return parsed.astimezone(timezone.utc)


def load_inner_fold_specs(model_manifest: dict) -> list[dict]:
    """Read fixed inner-fold windows from the immutable selected-model manifest.

    The model writer currently stores the last included validation bar under a
    field named validation_end_exclusive. Convert that last included M15 bar
    timestamp to a real exclusive boundary by adding one bar interval.
    """
    if model_manifest.get("data_sha256") != EXPECTED_DATA_SHA256:
        raise ValueError("inner_fold_manifest_dataset_sha256_mismatch")
    if model_manifest.get("timeframe") != "M15":
        raise ValueError("inner_fold_manifest_timeframe_must_be_m15")
    auto = model_manifest.get("auto_tuning")
    if not isinstance(auto, dict):
        raise ValueError("inner_fold_auto_tuning_manifest_missing")
    selected_trial = auto.get("selected_trial")
    trials = auto.get("trials")
    if type(selected_trial) is not int or not isinstance(trials, list):
        raise ValueError("inner_fold_selected_trial_missing")
    selected = next((trial for trial in trials if trial.get("trial") == selected_trial), None)
    if selected is None or not isinstance(selected.get("folds"), list):
        raise ValueError("inner_fold_selected_trial_folds_missing")
    purge_bars = auto.get("purge_bars")
    if type(purge_bars) is not int or purge_bars < 1:
        raise ValueError("inner_fold_purge_bars_invalid")
    specs = []
    for fold in selected["folds"]:
        start = parse_utc(fold["validation_start"])
        last_included = parse_utc(fold["validation_end_exclusive"])
        end_exclusive = last_included + timedelta(minutes=BAR_MINUTES)
        if end_exclusive <= start:
            raise ValueError("inner_fold_window_invalid")
        specs.append({
            "fold": fold.get("inner_fold"),
            "validation_start_utc": start,
            "validation_last_included_bar_utc": last_included,
            "validation_end_exclusive_utc": end_exclusive,
            "purge_bars": purge_bars,
            "model_manifest_train_rows": fold.get("train_rows"),
            "model_manifest_validation_rows": fold.get("validation_rows"),
            "model_manifest_source": "models/wave3_auto_tuned_20261030/model_manifest.json",
            "model_manifest_selected_trial": selected_trial,
        })
    expected_folds = auto.get("inner_validation_folds")
    if type(expected_folds) is int and len(specs) != expected_folds:
        raise ValueError("inner_fold_count_mismatch")
    return specs


def summarize_window(timestamps, trace, start, end):
    start_dt = parse_utc(start) if isinstance(start, str) else start
    end_dt = parse_utc(end) if isinstance(end, str) else end
    indices = [i for i, stamp in enumerate(timestamps) if start_dt <= stamp < end_dt]
    rows = [trace[i] for i in indices]
    first_touch = [bool(row["first_touch_only"]) for row in rows]
    full_mitigation = [bool(row["first_full_mitigation_only"]) for row in rows]
    repeat_touch = [bool(row["repeat_touch_within_48"]) for row in rows]
    overlap = [bool(row["overlap_now"]) for row in rows]
    post_full_retouch = [bool(row["post_full_mitigation_retouch"]) for row in rows]
    return {
        "bars": len(indices),
        "window_start_utc": start_dt.isoformat().replace("+00:00", "Z"),
        "window_end_exclusive_utc": end_dt.isoformat().replace("+00:00", "Z"),
        "bullish_fvg_creations": sum(bool(row["created_now"]) for row in rows),
        "first_touch_only_events": sum(first_touch),
        "first_full_mitigation_only_events": sum(full_mitigation),
        "repeat_touch_within_48_events": sum(repeat_touch),
        "bars_with_any_overlap": sum(overlap),
        "post_full_mitigation_retouch_bars": sum(post_full_retouch),
        "same_bar_intersections": {
            "first_touch_and_full_mitigation": sum(a and b for a, b in zip(first_touch, full_mitigation)),
            "first_touch_and_repeat_touch": sum(a and b for a, b in zip(first_touch, repeat_touch)),
            "full_mitigation_and_repeat_touch": sum(a and b for a, b in zip(full_mitigation, repeat_touch)),
            "all_three": sum(a and b and c for a, b, c in zip(first_touch, full_mitigation, repeat_touch)),
        },
        "rate_per_1000_bars": {
            "first_touch_only": round(1000 * sum(first_touch) / len(indices), 6) if indices else None,
            "first_full_mitigation_only": round(1000 * sum(full_mitigation) / len(indices), 6) if indices else None,
            "repeat_touch_within_48": round(1000 * sum(repeat_touch) / len(indices), 6) if indices else None,
        },
    }


def summarize_inner_fold(timestamps, trace, spec):
    """Report raw source-bar training window with 12-bar purge and validation."""
    start = spec["validation_start_utc"]
    end = spec["validation_end_exclusive_utc"]
    validation_indices = [i for i, stamp in enumerate(timestamps) if start <= stamp < end]
    if not validation_indices:
        raise ValueError("inner_fold_validation_has_no_raw_bars")
    first_validation_source_index = validation_indices[0]
    train_end_index = first_validation_source_index - spec["purge_bars"]
    if train_end_index <= 0:
        raise ValueError("inner_fold_training_window_empty_after_purge")
    train_end_exclusive = timestamps[train_end_index]
    return {
        "fold": spec["fold"],
        "purge_source_bars": spec["purge_bars"],
        "model_manifest_selected_trial": spec["model_manifest_selected_trial"],
        "model_manifest_train_rows": spec["model_manifest_train_rows"],
        "model_manifest_validation_rows": spec["model_manifest_validation_rows"],
        "validation_last_included_bar_utc": spec["validation_last_included_bar_utc"].isoformat().replace("+00:00", "Z"),
        "training_raw_source_bars": summarize_window(timestamps, trace, timestamps[0], train_end_exclusive),
        "validation_raw_source_bars": summarize_window(timestamps, trace, start, end),
    }


def load_pre_oos_bars(
    csv_path: Path,
    metadata_path: Path,
    *,
    expected_sha256: str = EXPECTED_DATA_SHA256,
    min_bars: int = 3000,
):
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("sha256") != expected_sha256:
        raise ValueError("dataset_metadata_sha256_mismatch")
    digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError("dataset_file_sha256_mismatch")

    bars, timestamps = [], []
    previous = None
    stopped_at_cutoff = False
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if not header:
            raise ValueError("dataset_header_missing")
        required = ("timestamp", "open", "high", "low", "close")
        positions = {name: header.index(name) for name in required if name in header}
        if set(positions) != set(required):
            raise ValueError("dataset_required_columns_missing")

        for raw in reader:
            if not raw:
                continue
            if len(raw) <= max(positions.values()):
                raise ValueError("dataset_row_truncated")
            stamp = parse_utc(raw[positions["timestamp"]])
            if stamp >= FINAL_OOS_START:
                # Stop after reading the boundary timestamp. The boundary
                # row's OHLC strings and every later row are never converted.
                stopped_at_cutoff = True
                break
            if previous is not None and stamp <= previous:
                raise ValueError("pre_oos_timestamps_not_strictly_increasing")
            previous = stamp
            values = {
                key: float(raw[positions[key]])
                for key in ("open", "high", "low", "close")
            }
            if not all(map(lambda x: x == x and abs(x) != float("inf"), values.values())):
                raise ValueError("pre_oos_ohlc_must_be_finite")
            bars.append(values)
            timestamps.append(stamp)

    if not stopped_at_cutoff:
        raise ValueError("dataset_does_not_reach_final_oos_boundary")
    if len(bars) < min_bars:
        raise ValueError("insufficient_pre_oos_bars")
    return metadata, digest, bars, timestamps


def compare_fvg_windows(csv_path: Path, metadata_path: Path, model_manifest_path: Path):
    metadata, digest, bars, timestamps = load_pre_oos_bars(csv_path, metadata_path)
    model_manifest = json.loads(model_manifest_path.read_text(encoding="utf-8"))
    fold_specs = load_inner_fold_specs(model_manifest)
    trace = build_bullish_fvg_event_trace(bars, max_age_bars=48)
    training_pool = summarize_window(timestamps, trace, timestamps[0], FINAL_OOS_START)
    inner = [summarize_inner_fold(timestamps, trace, spec) for spec in fold_specs]

    return {
        "schema_version": "nova.wave3.fvg-inner-fold-comparison.v2",
        "status": "event_semantics_counts_only",
        "source": {
            "dataset_branch": "feature/wave3-hybrid-backtest-20261029",
            "dataset_commit": "507b2949e3fa1861f25262cc330fb84a28c96f3d",
            "dataset_path": "datasets/exness-demo/XAUUSDm_M15_2022-2026.csv",
            "data_sha256": digest,
            "symbol": metadata.get("symbol"),
            "timeframe": metadata.get("timeframe"),
            "source_server": metadata.get("broker_server"),
            "account_mode": metadata.get("account_mode"),
            "source_exported_at_utc": metadata.get("exported_at_utc"),
        },
        "inner_fold_boundary_source": {
            "model_manifest_path": "models/wave3_auto_tuned_20261030/model_manifest.json",
            "model_manifest_selected_trial": model_manifest["auto_tuning"]["selected_trial"],
            "purge_bars": model_manifest["auto_tuning"]["purge_bars"],
            "timestamp_note": "The upstream model writer places the last included validation-bar timestamp in a field named validation_end_exclusive. This comparison adds one M15 interval to form the true exclusive boundary.",
            "training_note": "Training counts here use raw source bars with a 12-source-bar purge before each validation fold; model-manifest train_rows are also recorded separately because label/feature eligibility can reduce the model sample count.",
        },
        "analysis_boundary": {
            "training_pool_end_exclusive_utc": "2026-07-01T00:00:00Z",
            "final_oos_start_utc": "2026-07-01T00:00:00Z",
            "final_oos_rows_parsed": 0,
            "final_oos_ohlc_converted": False,
            "final_oos_model_metrics_used": False,
            "stopped_at_first_final_oos_timestamp": True,
            "note": "The full-file SHA-256 is used only for immutable-source integrity. Parser stops at first Final-OOS timestamp before converting its OHLC values.",
        },
        "definitions": {
            "first_touch_only": "One event at the first post-confirmation candle-range overlap with the active latest bullish FVG.",
            "first_full_mitigation_only": "One event at the first post-confirmation candle whose low reaches/crosses the lower FVG boundary; later retouches do not reactivate.",
            "repeat_touch_within_48": "Every candle-range overlap with the active latest bullish FVG while its age is 1-48 bars; comparator for existing behavior.",
        },
        "pre_oos_training_pool": training_pool,
        "inner_walk_forward_folds": inner,
        "selection": {
            "winner_selected": None,
            "model_training_started": False,
            "first_hit_labels_generated": False,
            "trade_outcomes_generated": False,
            "net_expectancy_calculated": False,
            "feature_matrix_modified": False,
            "frozen_benchmark_modified": False,
            "final_oos_used": False,
        },
        "limitations": [
            "This run compares causal FVG event counts and intersections only; it is not a model-performance or trade-outcome comparison.",
            "Inner-fold training counts are raw source-bar windows; model-manifest train_rows give the label/feature-eligible training sample sizes separately.",
            "First-hit net labels remain blocked until account-specific commission is confirmed and historical swap/rollover costs are modeled.",
            "Only bullish XAUUSDm FVGs are compared; no bearish or other-symbol inference is claimed.",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bars-csv", required=True, type=Path)
    parser.add_argument("--metadata-json", required=True, type=Path)
    parser.add_argument("--model-manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = compare_fvg_windows(args.bars_csv, args.metadata_json, args.model_manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "pre_oos_training_pool": result["pre_oos_training_pool"],
        "inner_walk_forward_folds": result["inner_walk_forward_folds"],
        "final_oos_rows_parsed": result["analysis_boundary"]["final_oos_rows_parsed"],
        "output": str(args.output),
    }, indent=2))


if __name__ == "__main__":
    main()
