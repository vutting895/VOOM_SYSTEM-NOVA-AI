"""Train a leakage-safe LightGBM next-bar-return candidate; never promote or trade."""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit

from .data_sources import chronological_splits, load_market_dataset
from .price_features import TARGET_COLUMN, build_price_features


def _git_sha(root: Path) -> str | None:
    value = os.getenv("GITHUB_SHA") or os.getenv("NOVA_GIT_SHA")
    if value:
        return value
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, check=True,
            capture_output=True, text=True, timeout=5,
        ).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def _metrics(y: np.ndarray, pred: np.ndarray) -> dict[str, Any]:
    y, pred = np.asarray(y, float), np.asarray(pred, float)
    return {
        "mae": float(mean_absolute_error(y, pred)),
        "rmse": float(np.sqrt(mean_squared_error(y, pred))),
        "directional_accuracy": float(np.mean(np.sign(y) == np.sign(pred))),
        "sample_count": int(len(y)),
    }


def _model(rounds: int, seed: int) -> lgb.LGBMRegressor:
    return lgb.LGBMRegressor(
        objective="regression_l1", n_estimators=rounds, learning_rate=0.025,
        num_leaves=15, min_child_samples=30, subsample=0.8, subsample_freq=1,
        colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=1.0,
        random_state=seed, n_jobs=-1, verbosity=-1,
    )


def _walk_forward(frame: pd.DataFrame, columns: list[str], rounds: int,
                  seed: int, gap: int) -> list[dict[str, Any]]:
    if len(frame) < 240:
        raise ValueError("Need at least 240 training rows for 3 walk-forward folds")
    report = []
    splitter = TimeSeriesSplit(n_splits=3, gap=gap)
    for fold, (train_i, valid_i) in enumerate(splitter.split(frame), 1):
        train, valid = frame.iloc[train_i], frame.iloc[valid_i]
        if len(train) < 100 or len(valid) < 30:
            raise ValueError(f"Walk-forward fold {fold} is too small")
        candidate = _model(rounds, seed + fold)
        candidate.fit(train[columns], train[TARGET_COLUMN].to_numpy(float))
        actual = valid[TARGET_COLUMN].to_numpy(float)
        pred = candidate.predict(valid[columns])
        score = _metrics(actual, pred)
        baseline = _metrics(actual, np.zeros_like(actual))
        report.append({
            "fold": fold, "train_rows": len(train), "validation_rows": len(valid),
            "mae": score["mae"], "zero_return_baseline_mae": baseline["mae"],
            "beats_baseline": score["mae"] < baseline["mae"],
        })
    return report


def _upload(output: Path, repo_id: str, run_id: str, eligible: bool) -> None:
    from huggingface_hub import HfApi

    token = os.getenv("HF_TOKEN")
    if not token or not repo_id:
        raise RuntimeError("HF_TOKEN and HF_MODEL_REPO_ID are required for Hub upload")
    api = HfApi(token=token)
    info = api.repo_info(repo_id=repo_id, repo_type="model")
    if getattr(info, "private", True) is False:
        raise RuntimeError("Refusing to upload model artifacts to a public repository")
    api.upload_folder(
        folder_path=str(output), repo_id=repo_id, repo_type="model",
        path_in_repo=f"experiments/{run_id}",
        allow_patterns=["manifest.json", "metrics.json", "feature_schema.json",
                        "feature_importance.csv"],
        commit_message=f"Record NOVA training evaluation {run_id}",
    )
    if eligible:
        api.upload_folder(
            folder_path=str(output), repo_id=repo_id, repo_type="model",
            path_in_repo=f"candidates/{run_id}",
            allow_patterns=["model.txt", "model.joblib", "manifest.json",
                            "metrics.json", "feature_schema.json"],
            commit_message=f"Upload gated NOVA LightGBM candidate {run_id}",
        )


def train(*, repo_root: Path, dataset_id: str, output_root: Path,
          min_validation_samples: int = 100, min_mae_improvement_pct: float = 0.1,
          seed: int = 42, upload_to_hf: bool = False,
          model_repo_id: str | None = None) -> dict[str, Any]:
    dataset = load_market_dataset(
        repo_root, dataset_id, allow_research_training=True
    )
    if dataset.live_feed or dataset.benchmark_eligible:
        raise ValueError("Only historical research-candidate datasets are allowed")
    if getattr(dataset, "unexplained_gap_after_indices", ()):
        raise ValueError("Datasets with unexplained historical gaps are not eligible for training")
    splits = chronological_splits(
        dataset, label_horizon_bars=1, embargo_bars=1
    )
    feature_set = build_price_features(dataset)
    train_times = {pd.Timestamp(b.timestamp) for b in splits.train.bars}
    valid_times = {pd.Timestamp(b.timestamp) for b in splits.validation.bars}
    test_times = {pd.Timestamp(b.timestamp) for b in splits.test.bars}
    frame = feature_set.frame
    train_frame = frame.loc[frame.index.isin(train_times)]
    valid_frame = frame.loc[frame.index.isin(valid_times)]
    # The final holdout is counted only. It is not scored, tuned, or selected.
    reserved_test_rows = int(frame.index.isin(test_times).sum())
    if len(train_frame) < 240 or len(valid_frame) < min_validation_samples:
        raise ValueError(
            f"Insufficient rows after feature warm-up and purge: "
            f"train={len(train_frame)}, validation={len(valid_frame)}"
        )

    columns = list(feature_set.feature_columns)
    x_train, y_train = train_frame[columns], train_frame[TARGET_COLUMN].to_numpy(float)
    x_valid, y_valid = valid_frame[columns], valid_frame[TARGET_COLUMN].to_numpy(float)

    # Early stopping uses a purged chronological tail inside train only.
    cut, gap = int(len(train_frame) * 0.85), 2
    x_fit = train_frame.iloc[:cut][columns]
    y_fit = train_frame.iloc[:cut][TARGET_COLUMN].to_numpy(float)
    x_early = train_frame.iloc[cut + gap:][columns]
    y_early = train_frame.iloc[cut + gap:][TARGET_COLUMN].to_numpy(float)
    if len(x_fit) < 100 or len(x_early) < 30:
        raise ValueError("Not enough rows for an independent early-stopping tail")
    selector = _model(700, seed)
    selector.fit(
        x_fit, y_fit, eval_set=[(x_early, y_early)],
        callbacks=[lgb.early_stopping(50, verbose=False)],
    )
    rounds = int(selector.best_iteration_ or selector.n_estimators)

    folds = _walk_forward(train_frame, columns, rounds, seed, gap=2)
    folds_beating = sum(bool(x["beats_baseline"]) for x in folds)
    candidate = _model(rounds, seed)
    candidate.fit(x_train, y_train)
    score = _metrics(y_valid, candidate.predict(x_valid))
    baseline = _metrics(y_valid, np.zeros_like(y_valid))
    improvement = (
        (baseline["mae"] - score["mae"]) / baseline["mae"] * 100
        if baseline["mae"] > 0 else 0.0
    )
    eligible = (
        score["sample_count"] >= min_validation_samples
        and score["mae"] < baseline["mae"]
        and improvement >= min_mae_improvement_pct
        and folds_beating >= 2
    )

    sha = _git_sha(repo_root)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + (sha or "local")[:8]
    output = output_root / run_id
    output.mkdir(parents=True, exist_ok=False)
    candidate.booster_.save_model(str(output / "model.txt"))
    joblib.dump(candidate, output / "model.joblib", compress=3)
    metrics = {
        "candidate": score, "zero_return_baseline": baseline,
        "mae_improvement_pct": float(improvement),
        "candidate_eligible_for_upload": bool(eligible),
        "validation_only": True, "reserved_test_evaluated": False,
        "reserved_test_rows_available": reserved_test_rows,
        "walk_forward": folds, "walk_forward_folds_beating_baseline": folds_beating,
    }
    manifest = {
        "schema_version": "nova.price-model-candidate.v1", "run_id": run_id,
        "model_family": "lightgbm", "target": TARGET_COLUMN,
        "target_definition": "log(close[t+1] / close[t])",
        "symbol": dataset.symbol, "timeframe": dataset.timeframe,
        "dataset_id": dataset.dataset_id, "dataset_sha256": dataset.sha256,
        "dataset_eligibility": dataset.eligibility,
        "missing_interval_count": dataset.missing_interval_count,
        "train_rows": len(train_frame), "validation_rows": len(valid_frame),
        "reserved_test_rows_available": reserved_test_rows,
        "final_oos_touched": False, "feature_schema_version": "nova.price-features.v1",
        "feature_columns": columns, "best_iteration": rounds,
        "code_commit_sha": sha, "python_version": platform.python_version(),
        "lightgbm_version": lgb.__version__,
        "candidate_status": "candidate" if eligible else "rejected",
        "auto_promoted": False, "live_trading_enabled": False,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    (output / "metrics.json").write_text(
        json.dumps(metrics, indent=2, sort_keys=True, allow_nan=False), encoding="utf-8"
    )
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True, allow_nan=False), encoding="utf-8"
    )
    (output / "feature_schema.json").write_text(
        json.dumps({"version": "nova.price-features.v1", "features": columns},
                   indent=2, sort_keys=True), encoding="utf-8"
    )
    pd.DataFrame({
        "feature": columns,
        "gain": candidate.booster_.feature_importance("gain"),
        "split": candidate.booster_.feature_importance("split"),
    }).sort_values("gain", ascending=False).to_csv(output / "feature_importance.csv", index=False)
    if upload_to_hf:
        _upload(output, model_repo_id or os.getenv("HF_MODEL_REPO_ID", ""), run_id, eligible)
    return {
        "run_id": run_id, "candidate_status": manifest["candidate_status"],
        "validation_mae": score["mae"], "baseline_mae": baseline["mae"],
        "mae_improvement_pct": improvement, "walk_forward_folds_beating_baseline": folds_beating,
        "reserved_test_rows_available": reserved_test_rows, "uploaded_to_hf": upload_to_hf,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--output-root", type=Path, default=Path("artifacts/learning-candidates"))
    parser.add_argument("--min-validation-samples", type=int, default=100)
    parser.add_argument("--min-mae-improvement-pct", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--upload-to-hf", action="store_true")
    parser.add_argument("--model-repo-id")
    args = parser.parse_args()
    try:
        result = train(
            repo_root=args.repo_root.resolve(), dataset_id=args.dataset_id,
            output_root=(args.repo_root / args.output_root).resolve(),
            min_validation_samples=args.min_validation_samples,
            min_mae_improvement_pct=args.min_mae_improvement_pct, seed=args.seed,
            upload_to_hf=args.upload_to_hf, model_repo_id=args.model_repo_id,
        )
    except Exception as exc:
        parser.exit(2, f"NOVA training failed: {type(exc).__name__}: {exc}\n")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
