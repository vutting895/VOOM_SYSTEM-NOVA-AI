import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "strategy"))
from wave3_ml_pipeline import (
    HORIZON_BARS, _train_mask, backtest_window, build_causal_features,
    load_bars, make_labeled_frame, build_inner_validation_splits,
    generate_xgb_tuning_candidates, _fit_lstm, LSTM_BATCH_SIZE_FALLBACKS,
    _is_lstm_memory_error, _write_auto_tuning_history,
)


def synthetic_bars(n=700):
    timestamps = pd.date_range("2023-01-01", periods=n, freq="15min", tz="UTC")
    ix = np.arange(n, dtype=float)
    close = 1900 + 0.03 * ix + 5 * np.sin(ix / 7.0) + 2 * np.sin(ix / 19.0)
    open_ = np.r_[close[0], close[:-1]]
    high = np.maximum(open_, close) + 0.25 + 0.1 * (1 + np.sin(ix))
    low = np.minimum(open_, close) - 0.25 - 0.1 * (1 + np.cos(ix))
    return pd.DataFrame({
        "timestamp": timestamps, "open": open_, "high": high, "low": low,
        "close": close, "volume": 100 + 10 * (1 + np.sin(ix / 3)),
        "spread_price": np.full(n, 0.24), "tick_volume": 100 + 10 * (1 + np.sin(ix / 3)),
    })


class TestWave3Pipeline(unittest.TestCase):
    def test_features_are_causal(self):
        frame = synthetic_bars()
        before = build_causal_features(frame)
        changed = frame.copy()
        j = 500
        changed.loc[j, "open"] += 12
        changed.loc[j, "close"] += 11
        changed.loc[j, "high"] += 12
        changed.loc[j, "low"] += 10
        after = build_causal_features(changed)
        np.testing.assert_allclose(
            before.iloc[:j].to_numpy(), after.iloc[:j].to_numpy(),
            equal_nan=True, rtol=0, atol=0,
        )

    def test_labels_use_future_but_are_not_feature_columns(self):
        frame = synthetic_bars()
        features = build_causal_features(frame)
        X, y, meta = make_labeled_frame(frame, features)
        self.assertEqual(len(X), len(y))
        self.assertEqual(len(y), len(meta))
        self.assertNotIn("forward_return_price", X.columns)
        self.assertNotIn("label_threshold_price", X.columns)
        self.assertTrue(set(y.unique()).issubset({0, 1, 2}))
        self.assertTrue({"wave3_long_zone", "wave3_short_zone", "bos_up", "choch_down"}.issubset(X.columns))

    def test_training_mask_purges_forward_horizon(self):
        times = pd.date_range("2026-06-01", periods=100, freq="15min", tz="UTC")
        meta = pd.DataFrame({"timestamp": times})
        start = pd.Timestamp("2026-06-02", tz="UTC")
        mask = _train_mask(meta, start)
        cutoff = start - pd.Timedelta(minutes=15 * HORIZON_BARS)
        self.assertTrue((meta.loc[mask, "timestamp"] < cutoff).all())

    def test_backtest_enters_next_bar_and_never_submits_orders(self):
        frame = synthetic_bars(200)
        frame.loc[100:110, ["open", "high", "low", "close"]] = [2000.0, 2000.1, 2000.0, 2000.0]
        frame.loc[102, ["open", "high", "low", "close"]] = [2000.0, 2001.5, 2000.0, 2000.8]
        features = pd.DataFrame(0.0, index=frame.index, columns=[
            "wave3_long_breakout", "wave3_short_breakout", "bos_up", "bos_down",
            "choch_up", "choch_down", "bull_fvg", "bear_fvg", "bull_ob_zone",
            "bear_ob_zone", "sell_side_sweep", "buy_side_sweep", "atr_price",
        ])
        features["atr_price"] = 0.2
        features.loc[100, ["wave3_long_breakout", "bos_up"]] = [1, 1]
        indices = np.arange(100, 120)
        probs = np.tile(np.array([0.05, 0.10, 0.85]), (len(indices), 1))
        result = backtest_window(frame, features, indices, probs, require_news_calendar=False)
        self.assertEqual(result["trade_count"], 1)
        self.assertEqual(result["trades"][0]["entry_timestamp"], frame.loc[101, "timestamp"].isoformat())
        self.assertEqual(result["trades"][0]["exit_reason"], "take_profit")
        self.assertFalse(result.get("orders_submitted", False))

    def test_v6263_required_buy_gate_features_are_present_and_causal(self):
        frame = synthetic_bars(900)
        features = build_causal_features(frame)
        required = {
            "wave3_long_rule_breakout", "wave3_long_fib_score", "wave3_long_entry_price",
            "smc_score_long", "bos20_up", "choch_rule_up", "bull_ob_within5", "bull_fvg_fill",
            "rsi_buy_gate", "momentum_5_positive", "volume_gate", "near_fib_618",
            "discount_zone", "h1_trend_up", "deep_trend_gate", "atr_stop_gate", "spread_gate",
        }
        self.assertTrue(required.issubset(features.columns))
        self.assertTrue(features["smc_score_long"].between(0, 100).all())
        before = features.iloc[:500].copy()
        changed = frame.copy()
        changed.loc[600:, ["open", "high", "low", "close"]] *= 1.1
        after = build_causal_features(changed).iloc[:500]
        np.testing.assert_allclose(before.to_numpy(), after.to_numpy(), equal_nan=True, rtol=0, atol=0)


    def test_auto_tuning_splits_are_chronological_and_purged(self):
        timestamps = pd.date_range("2023-01-01", periods=10000, freq="15min", tz="UTC")
        meta = pd.DataFrame({"timestamp": timestamps})
        splits = build_inner_validation_splits(meta)
        self.assertEqual(len(splits), 2)
        for split in splits:
            train_last = meta["timestamp"].iloc[split["train_indices"][-1]]
            validation_start = pd.Timestamp(split["validation_start"])
            self.assertLess(train_last, validation_start - pd.Timedelta(minutes=15 * HORIZON_BARS))
            self.assertGreater(split["validation_indices"][0], split["train_indices"][-1])
            self.assertEqual(split["purge_bars"], HORIZON_BARS)

    def test_auto_tuning_candidates_are_deterministic_and_bounded(self):
        first = generate_xgb_tuning_candidates(4)
        second = generate_xgb_tuning_candidates(4)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 4)
        self.assertEqual(first[0]["max_depth"], 4)
        for candidate in first:
            self.assertIn(candidate["max_depth"], (3, 4, 5))
            self.assertIn(candidate["n_estimators"], (100, 120, 140, 160, 180))
            self.assertGreaterEqual(candidate["learning_rate"], 0.025)
            self.assertLessEqual(candidate["learning_rate"], 0.06)

    def test_lstm_cpu_memory_fallback_is_bounded_and_deterministic(self):
        self.assertEqual(LSTM_BATCH_SIZE_FALLBACKS, (256, 128, 64))
        self.assertTrue(_is_lstm_memory_error(RuntimeError(
            "DefaultCPUAllocator: not enough memory"
        )))
        self.assertFalse(_is_lstm_memory_error(RuntimeError("shape mismatch")))

        class DummyModel:
            pass

        X = pd.DataFrame(np.arange(300 * 3, dtype=float).reshape(300, 3))
        y = pd.Series(np.tile(np.array([0, 1, 2]), 100), dtype=np.int64)
        with patch(
            "wave3_ml_pipeline._fit_lstm_once",
            side_effect=[
                RuntimeError("DefaultCPUAllocator: not enough memory"),
                (DummyModel(), [0.9, 0.8, 0.7, 0.6]),
            ],
        ) as train_attempt:
            _, model = _fit_lstm(X, y)
        self.assertEqual([call.args[3] for call in train_attempt.call_args_list], [256, 128])
        self.assertEqual(model._training_batch_size, 128)
        self.assertEqual(len(model._training_losses), 4)

    def test_auto_tuning_history_checkpoint_is_atomic_and_excludes_final_oos(self):
        completed_fold = {
            "name": "wf_2024_H1",
            "status": "completed",
            "auto_tuning": {
                "status": "completed",
                "selected_parameters": {"max_depth": 4},
                "trials": [{"trial": 1, "robust_score": 0.25}],
            },
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            report_path = Path(temp_dir) / "wave3_report.json"
            history_path = _write_auto_tuning_history(
                report_path, 4, [completed_fold], status="in_progress"
            )
            history = json.loads(history_path.read_text(encoding="utf-8"))
            self.assertEqual(history["status"], "in_progress")
            self.assertEqual(history["windows_completed"], 1)
            self.assertFalse(history["final_oos_used_for_tuning"])
            self.assertEqual(history["final_oos_start"], "2026-07-01T00:00:00+00:00")
            self.assertEqual(
                history["walk_forward_windows"][0]["auto_tuning"]["selected_parameters"]["max_depth"],
                4,
            )
            self.assertFalse(history_path.with_suffix(".json.tmp").exists())

    def test_load_bars_rejects_bad_candle(self):
        frame = synthetic_bars(3500)
        frame.loc[300, "high"] = frame.loc[300, "low"] - 1
        with self.assertRaises(ValueError):
            import tempfile
            with tempfile.TemporaryDirectory() as d:
                path = Path(d) / "bars.csv"
                frame.to_csv(path, index=False)
                load_bars(path)


if __name__ == "__main__":
    unittest.main()
