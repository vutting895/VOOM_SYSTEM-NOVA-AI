"""Causal, event-count-only FVG comparison using the pinned benchmark's exact inner-fold builder.

The source CSV is SHA-pinned. Parsing stops at the 2026-07-01 Final-OOS
boundary before converting the boundary row's OHLCV values. The benchmark's
own causal feature/label eligibility and inner-split functions are executed on
the pre-OOS-only frame. No XGBoost/LSTM model is fitted and no Final-OOS data
is accessed or scored.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import sys

from research.wave3_challenger.fvg_events import build_bullish_fvg_event_trace

EXPECTED_DATA_SHA256 = "0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266"
EXPECTED_BENCHMARK_COMMIT = "507b2949e3fa1861f25262cc330fb84a28c96f3d"
FINAL_OOS_START = datetime(2026, 7, 1, tzinfo=timezone.utc)
BAR_MINUTES = 15


def parse_utc(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp_missing")
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ValueError("timestamp_must_be_utc")
    return parsed.astimezone(timezone.utc)


def summarize_window(timestamps, trace, start, end):
    indices = [i for i, stamp in enumerate(timestamps) if start <= stamp < end]
    rows = [trace[i] for i in indices]
    first_touch = [bool(row["first_touch_only"]) for row in rows]
    full_mitigation = [bool(row["first_full_mitigation_only"]) for row in rows]
    repeat_touch = [bool(row["repeat_touch_within_48"]) for row in rows]
    overlap = [bool(row["overlap_now"]) for row in rows]
    post_full_retouch = [bool(row["post_full_mitigation_retouch"]) for row in rows]
    return {
        "bars": len(indices),
        "window_start_utc": start.isoformat().replace("+00:00", "Z"),
        "window_end_exclusive_utc": end.isoformat().replace("+00:00", "Z"),
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


def derive_fold_source_windows(timestamps, source_indices, split):
    train = split["train_indices"]
    validation = split["validation_indices"]
    if len(train) == 0 or len(validation) == 0:
        raise ValueError("inner_fold_empty_train_or_validation")
    if int(train[-1]) >= int(validation[0]):
        raise ValueError("inner_fold_train_not_before_validation")
    if any(int(a) >= int(b) for a, b in zip(train, train[1:])):
        raise ValueError("inner_fold_train_indices_not_chronological")
    if any(int(a) >= int(b) for a, b in zip(validation, validation[1:])):
        raise ValueError("inner_fold_validation_indices_not_chronological")

    train_first = int(source_indices[int(train[0])])
    train_last = int(source_indices[int(train[-1])])
    validation_first = int(source_indices[int(validation[0])])
    validation_last = int(source_indices[int(validation[-1])])
    purge_gap = validation_first - train_last - 1
    if purge_gap < 12:
        raise ValueError("benchmark_inner_fold_purge_below_12_source_bars")
    if validation_last + 1 >= len(timestamps):
        raise ValueError("inner_fold_end_exceeds_pre_oos_source")

    return {
        "fold": int(split["fold"]),
        "purge_bars_required": 12,
        "purge_gap_source_bars": purge_gap,
        "model_training_rows": int(len(train)),
        "model_validation_rows": int(len(validation)),
        "training_source_start_index": train_first,
        "training_source_end_exclusive_index": train_last + 1,
        "validation_source_start_index": validation_first,
        "validation_source_end_exclusive_index": validation_last + 1,
    }


def load_pre_oos_frame(csv_path: Path, metadata_path: Path, *, expected_sha256=EXPECTED_DATA_SHA256):
    """Read only closed pre-OOS bars; stop before converting the first OOS OHLCV."""
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("sha256") != expected_sha256:
        raise ValueError("dataset_metadata_sha256_mismatch")
    digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError("dataset_file_sha256_mismatch")

    rows, timestamps, fvg_bars = [], [], []
    stopped_at_cutoff = False
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if not header:
            raise ValueError("dataset_header_missing")
        required = ("timestamp", "open", "high", "low", "close", "spread_price")
        positions = {name: header.index(name) for name in required if name in header}
        if set(positions) != set(required):
            raise ValueError("dataset_required_columns_missing")
        volume_column = "tick_volume" if "tick_volume" in header else ("volume" if "volume" in header else None)
        volume_index = header.index(volume_column) if volume_column else None

        previous = None
        for raw in reader:
            if not raw:
                continue
            if len(raw) <= max(positions.values()):
                raise ValueError("dataset_row_truncated")
            stamp = parse_utc(raw[positions["timestamp"]])
            if stamp >= FINAL_OOS_START:
                # Do not convert this row's OHLCV fields or read later rows.
                stopped_at_cutoff = True
                break
            if previous is not None and stamp <= previous:
                raise ValueError("pre_oos_timestamps_not_strictly_increasing")
            previous = stamp
            values = {key: float(raw[positions[key]]) for key in ("open", "high", "low", "close", "spread_price")}
            volume = float(raw[volume_index]) if volume_index is not None else 0.0
            numbers = [*values.values(), volume]
            if any(not (value == value and abs(value) != float("inf")) for value in numbers):
                raise ValueError("pre_oos_ohlcv_must_be_finite")
            if volume < 0 or values["spread_price"] < 0:
                raise ValueError("pre_oos_volume_or_spread_invalid")
            rows.append({"timestamp": stamp, **values, "volume": volume})
            timestamps.append(stamp)
            fvg_bars.append({key: values[key] for key in ("open", "high", "low", "close")})

    if not stopped_at_cutoff:
        raise ValueError("dataset_does_not_reach_final_oos_boundary")
    if len(rows) < 3000:
        raise ValueError("insufficient_pre_oos_bars")
    return metadata, digest, rows, timestamps, fvg_bars


def derive_benchmark_inner_splits(rows, timestamps, benchmark_root: Path):
    """Run the exact pinned benchmark feature eligibility and inner-fold splitter."""
    sys.path.insert(0, str(benchmark_root.resolve()))
    import pandas as pd
    from workers.strategy.wave3_ml_pipeline import (
        AUTO_TUNING_FOLDS,
        HORIZON_BARS,
        build_causal_features,
        build_inner_validation_splits,
        make_labeled_frame,
    )

    if HORIZON_BARS != 12 or tuple(AUTO_TUNING_FOLDS) != ((0.62, 0.75), (0.82, 0.95)):
        raise ValueError("benchmark_inner_fold_definition_changed")
    frame = pd.DataFrame(rows)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    features = build_causal_features(frame)
    _, _, meta = make_labeled_frame(frame, features)
    if len(meta) < 10_000:
        raise ValueError("insufficient_benchmark_eligible_training_rows")
    splits = build_inner_validation_splits(meta)
    if len(splits) != len(AUTO_TUNING_FOLDS):
        raise ValueError("benchmark_inner_fold_builder_did_not_return_all_folds")

    source_indices = meta["source_index"].to_numpy(dtype="int64")
    fold_specs = [
        derive_fold_source_windows(timestamps, source_indices, split)
        for split in splits
    ]
    if [item["fold"] for item in fold_specs] != list(range(1, len(AUTO_TUNING_FOLDS) + 1)):
        raise ValueError("benchmark_inner_fold_sequence_invalid")
    return fold_specs


def compare_fvg_windows(csv_path: Path, metadata_path: Path, benchmark_root: Path):
    metadata, digest, rows, timestamps, fvg_bars = load_pre_oos_frame(csv_path, metadata_path)
    trace = build_bullish_fvg_event_trace(fvg_bars, max_age_bars=48)
    training_pool = summarize_window(timestamps, trace, timestamps[0], FINAL_OOS_START)
    folds = derive_benchmark_inner_splits(rows, timestamps, benchmark_root)

    fold_results = []
    for fold in folds:
        train_start = fold["training_source_start_index"]
        train_end = fold["training_source_end_exclusive_index"]
        val_start = fold["validation_source_start_index"]
        val_end = fold["validation_source_end_exclusive_index"]
        fold_results.append({
            "fold": fold["fold"],
            "purge_bars_required": fold["purge_bars_required"],
            "purge_gap_source_bars": fold["purge_gap_source_bars"],
            "model_training_rows": fold["model_training_rows"],
            "model_validation_rows": fold["model_validation_rows"],
            "training_source_start_index": train_start,
            "training_source_end_exclusive_index": train_end,
            "validation_source_start_index": val_start,
            "validation_source_end_exclusive_index": val_end,
            "training_raw_source_bars": summarize_window(
                timestamps, trace, timestamps[train_start], timestamps[train_end - 1] + timedelta(minutes=BAR_MINUTES)
            ),
            "validation_raw_source_bars": summarize_window(
                timestamps, trace, timestamps[val_start], timestamps[val_end - 1] + timedelta(minutes=BAR_MINUTES)
            ),
        })

    return {
        "schema_version": "nova.wave3.fvg-inner-fold-comparison.v3",
        "status": "event_semantics_counts_only",
        "source": {
            "dataset_branch": "feature/wave3-hybrid-backtest-20261029",
            "dataset_commit": EXPECTED_BENCHMARK_COMMIT,
            "dataset_path": "datasets/exness-demo/XAUUSDm_M15_2022-2026.csv",
            "data_sha256": digest,
            "symbol": metadata.get("symbol"),
            "timeframe": metadata.get("timeframe"),
            "source_server": metadata.get("broker_server"),
            "account_mode": metadata.get("account_mode"),
            "source_exported_at_utc": metadata.get("exported_at_utc"),
        },
        "inner_fold_definition": {
            "source": "workers/strategy/wave3_ml_pipeline.py::build_inner_validation_splits",
            "benchmark_commit": EXPECTED_BENCHMARK_COMMIT,
            "auto_tuning_fractions": [[0.62, 0.75], [0.82, 0.95]],
            "label_horizon_bars": 12,
            "folds_derived_from_current_snapshot": True,
            "model_fitting_or_hyperparameter_search_run": False,
            "training_note": "The exact pinned benchmark causal feature builder, make_labeled_frame and inner split builder determine eligible source indices; only feature/label eligibility is computed, no model is fitted.",
        },
        "analysis_boundary": {
            "training_pool_end_exclusive_utc": "2026-07-01T00:00:00Z",
            "final_oos_start_utc": "2026-07-01T00:00:00Z",
            "final_oos_rows_parsed": 0,
            "final_oos_ohlc_converted": False,
            "final_oos_model_metrics_used": False,
            "stopped_at_first_final_oos_timestamp": True,
            "note": "Full-file SHA-256 is only for immutable-source integrity; OHLCV parsing stops before the first Final-OOS row.",
        },
        "definitions": {
            "first_touch_only": "One event at the first post-confirmation candle-range overlap with the active latest bullish FVG.",
            "first_full_mitigation_only": "One event at the first post-confirmation candle whose low reaches/crosses the lower FVG boundary; later retouches do not reactivate.",
            "repeat_touch_within_48": "Every candle-range overlap with the active latest bullish FVG while age is 1-48 bars.",
        },
        "pre_oos_training_pool": training_pool,
        "inner_walk_forward_folds": fold_results,
        "selection": {
            "winner_selected": None,
            "model_training_started": False,
            "benchmark_feature_matrix_modified": False,
            "first_hit_labels_generated": False,
            "trade_outcomes_generated": False,
            "net_expectancy_calculated": False,
            "final_oos_used": False,
        },
        "limitations": [
            "This comparison reports causal event counts, not model performance or trade expectancy.",
            "Inner folds come from the pinned benchmark split function applied to this exact dataset snapshot; a model manifest with a different data hash is not reused.",
            "First-hit labels remain blocked until account-specific commission and historical swap/rollover costs are verified.",
            "Only bullish XAUUSDm FVGs are compared.",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bars-csv", required=True, type=Path)
    parser.add_argument("--metadata-json", required=True, type=Path)
    parser.add_argument("--benchmark-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = compare_fvg_windows(args.bars_csv, args.metadata_json, args.benchmark_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "pre_oos_training_pool": result["pre_oos_training_pool"],
        "inner_walk_forward_folds": result["inner_walk_forward_folds"],
        "final_oos_rows_parsed": result["analysis_boundary"]["final_oos_rows_parsed"],
    }, indent=2))


if __name__ == "__main__":
    main()
