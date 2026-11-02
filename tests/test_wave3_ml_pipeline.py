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
    _news_backtest_assumption, _news_calendar_manifest,
    generate_xgb_tuning_candidates, smc_candidate_trace, _fit_lstm, LSTM_BATCH_SIZE_FALLBACKS,
    _is_lstm_memory_error, _write_auto_tuning_history,
    _bullish_ob_state, _bearish_ob_state, _SequenceDataset,
    _build_daily_candidate_features,
    PROBABILITY_THRESHOLD, XGB_MIN_CONFIDENCE, LSTM_MIN_CONFIDENCE,
    ENSEMBLE_XGB_WEIGHT, ENSEMBLE_LSTM_WEIGHT,
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
        meta = pd.DataFrame({"timestamp": times, "source_index": np.arange(len(times))})
        start = pd.Timestamp("2026-06-02", tz="UTC")
        mask = _train_mask(meta, start)
        cutoff = start - pd.Timedelta(minutes=15 * HORIZON_BARS)
        self.assertTrue((meta.loc[mask, "timestamp"] < cutoff).all())

    def test_training_mask_purges_source_bars_across_new_year_market_closure(self):
        # Only 13 source bars separate the last training row and the first
        # test row, despite a multi-day calendar closure.
        prior = pd.date_range("2023-12-29T12:00:00Z", periods=13, freq="15min")
        test_start = pd.Timestamp("2024-01-02T00:00:00Z")
        timestamps = prior.append(pd.DatetimeIndex([test_start]))
        meta = pd.DataFrame({"timestamp": timestamps, "source_index": np.arange(14)})
        mask = _train_mask(meta, test_start)
        self.assertEqual(np.flatnonzero(mask).tolist(), [0])

    def test_lstm_sequences_never_cross_frozen_oos_segment(self):
        values = np.arange(24 * 2, dtype=np.float32).reshape(24, 2)
        segments = np.array([0] * 12 + [1] * 12, dtype=np.int8)
        dataset = _SequenceDataset(values, labels=np.tile([0, 1, 2, 0], 6),
                                   sequence_length=5, segment_ids=segments)
        self.assertEqual(len(dataset), 16)
        for start in dataset.starts:
            self.assertEqual(len(np.unique(segments[start:start + 5])), 1)

    def test_daily_candidate_features_leave_frozen_historical_oos_gap_empty(self):
        history = pd.date_range("2026-05-01T00:00:00Z", periods=3000, freq="15min")
        frozen_gap = pd.date_range("2026-07-01T00:00:00Z", periods=32, freq="15min")
        live = pd.date_range("2026-10-29T17:00:00Z", periods=320, freq="15min")
        timestamps = history.append(frozen_gap).append(live)
        close = 2400 + np.arange(len(timestamps), dtype=float) * 0.01 + np.sin(np.arange(len(timestamps)) / 9)
        frame = pd.DataFrame({
            "timestamp": timestamps,
            "open": close - 0.02,
            "high": close + 0.10,
            "low": close - 0.10,
            "close": close,
            "volume": np.full(len(close), 100.0),
            "spread_price": np.full(len(close), 0.024),
        })
        features = _build_daily_candidate_features(
            frame,
            pd.Timestamp("2026-07-01T00:00:00Z"),
            pd.Timestamp("2026-10-29T17:00:00Z"),
        )
        gap = features.iloc[3000:3032]
        self.assertTrue(gap.isna().all().all())
        self.assertTrue(np.isfinite(features.iloc[2990].to_numpy(dtype=float)).all())
        self.assertTrue(np.isfinite(features.iloc[-1].to_numpy(dtype=float)).all())

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

    def test_backtest_uses_worse_open_on_gap_through_buy_stop(self):
        frame = synthetic_bars(200)
        frame.loc[100:103, ["open", "high", "low", "close"]] = [2000.0, 2000.5, 2000.0, 2000.1]
        frame.loc[102, ["open", "high", "low", "close"]] = [1990.0, 1991.0, 1989.0, 1990.5]
        features = pd.DataFrame(0.0, index=frame.index, columns=[
            "wave3_long_breakout", "wave3_short_breakout", "bos_up", "bos_down",
            "choch_up", "choch_down", "bull_fvg", "bear_fvg", "bull_ob_zone",
            "bear_ob_zone", "sell_side_sweep", "buy_side_sweep", "atr_price",
        ])
        features["atr_price"] = 0.2
        features.loc[100, ["wave3_long_breakout", "bos_up"]] = [1, 1]
        indices = np.arange(100, 120)
        probs = np.tile(np.array([0.05, 0.10, 0.85]), (len(indices), 1))
        trade = backtest_window(frame, features, indices, probs, require_news_calendar=False)["trades"][0]
        self.assertEqual(trade["exit_reason"], "stop_loss")
        self.assertLess(trade["exit_price"], trade["stop_price"])
        self.assertAlmostEqual(trade["exit_price"], 1990.0 - 0.02)

    def test_backtest_entry_candle_opening_gap_is_not_a_pre_entry_fill(self):
        frame = synthetic_bars(200)
        frame.loc[101, ["open", "high", "low", "close"]] = [1990.0, 2001.0, 1989.0, 2000.0]
        features = pd.DataFrame(0.0, index=frame.index, columns=[
            "wave3_long_rule_breakout", "wave3_long_fib_score", "wave3_long_entry_price",
            "smc_score_long", "rsi_buy_gate", "momentum_5_positive", "volume_gate",
            "near_fib_618", "discount_zone", "h1_trend_up", "deep_trend_gate",
            "choch_rule_up", "atr_stop_gate", "spread_gate", "atr_price",
        ])
        features["atr_price"] = 0.2
        features.loc[100, ["wave3_long_rule_breakout", "wave3_long_fib_score",
                           "wave3_long_entry_price", "smc_score_long",
                           "rsi_buy_gate", "momentum_5_positive", "volume_gate",
                           "near_fib_618", "discount_zone", "h1_trend_up",
                           "deep_trend_gate", "choch_rule_up", "atr_stop_gate",
                           "spread_gate"]] = [1, 80, 2000, 85, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        indices = np.arange(100, 120)
        probs = np.tile(np.array([0.05, 0.10, 0.85]), (len(indices), 1))
        trade = backtest_window(frame, features, indices, probs, require_news_calendar=False)["trades"][0]
        self.assertEqual(trade["exit_reason"], "stop_loss")
        self.assertAlmostEqual(trade["exit_price"], trade["stop_price"] - 0.02)

    def test_backtest_daily_entry_cap_uses_executable_entry_utc_day(self):
        frame = synthetic_bars(200)
        frame["timestamp"] = pd.date_range("2025-12-31T22:45:00Z", periods=len(frame), freq="15min")
        frame.loc[100:111, ["open", "high", "low", "close"]] = [2000.0, 2000.5, 1999.0, 2000.1]
        features = pd.DataFrame(0.0, index=frame.index, columns=[
            "wave3_long_breakout", "wave3_short_breakout", "bos_up", "bos_down",
            "choch_up", "choch_down", "bull_fvg", "bear_fvg", "bull_ob_zone",
            "bear_ob_zone", "sell_side_sweep", "buy_side_sweep", "atr_price",
        ])
        features["atr_price"] = 0.2
        signal_indices = np.array([100, 102, 104, 106, 108, 110])
        features.loc[signal_indices, ["wave3_long_breakout", "bos_up"]] = [1, 1]
        indices = np.arange(100, 120)
        probs = np.tile(np.array([0.05, 0.10, 0.85]), (len(indices), 1))
        result = backtest_window(frame, features, indices, probs, require_news_calendar=False)
        self.assertEqual(result["trade_count"], 5)
        self.assertEqual(result["trades"][0]["entry_timestamp"], "2026-01-02T00:00:00+00:00")

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
        meta = pd.DataFrame({"timestamp": timestamps, "source_index": np.arange(len(timestamps))})
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

    def test_news_calendar_blocks_full_day_for_untimed_events_and_checks_coverage(self):
        import tempfile
        from wave3_ml_pipeline import load_news_calendar

        frame = pd.DataFrame({
            "timestamp": pd.to_datetime([
                "2026-07-01T09:00:00Z",
                "2026-07-01T14:00:00Z",
                "2026-07-02T12:00:00Z",
            ], utc=True)
        })
        calendar = pd.DataFrame({
            "timestamp": ["2026-07-01T00:00:00Z", "2026-07-02T12:00:00Z"],
            "impact": ["high", "high"],
            "time_mode": ["notime", "datetime"],
            "calendar_source": ["MQL5 Economic Calendar"] * 2,
            "coverage_start_utc": ["2026-07-01T00:00:00Z"] * 2,
            "coverage_end_exclusive_utc": ["2026-07-03T00:00:00Z"] * 2,
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "news.csv"
            calendar.to_csv(path, index=False)
            safe = load_news_calendar(path, frame)
            self.assertEqual(safe.tolist(), [False, False, False])

            calendar["coverage_end_exclusive_utc"] = "2026-07-02T00:00:00Z"
            calendar.to_csv(path, index=False)
            with self.assertRaises(ValueError):
                load_news_calendar(path, frame)

    def test_v6263_confidence_and_ensemble_gates_remain_locked(self):
        self.assertEqual(PROBABILITY_THRESHOLD, 0.85)
        self.assertEqual(XGB_MIN_CONFIDENCE, 0.75)
        self.assertEqual(LSTM_MIN_CONFIDENCE, 0.80)
        self.assertEqual(ENSEMBLE_XGB_WEIGHT, 0.60)
        self.assertEqual(ENSEMBLE_LSTM_WEIGHT, 0.40)
        features = build_causal_features(synthetic_bars(900))
        expected = (features["smc_score_long"] >= 85).astype(float).to_numpy()
        np.testing.assert_array_equal(features["smc_buy_gate"].to_numpy(), expected)

    def test_order_block_validity_uses_price_invalidation_not_age(self):
        # OB age is deliberately not an input to validity; the hard rules remain
        # >=0.3% candidate size (detected upstream) and <=$5 proximity here.
        bullish = _bullish_ob_state(2010.0, 2005.0, 2015.0)
        self.assertTrue(bullish["valid"])
        self.assertTrue(bullish["zone"])
        self.assertTrue(bullish["within5"])
        self.assertEqual(bullish["distance"], 0.0)

        too_far = _bullish_ob_state(2021.0, 2005.0, 2015.0)
        self.assertTrue(too_far["valid"])
        self.assertFalse(too_far["within5"])
        self.assertEqual(too_far["distance"], 6.0)

        invalidated = _bullish_ob_state(2004.9, 2005.0, 2015.0)
        self.assertFalse(invalidated["valid"])
        self.assertFalse(invalidated["within5"])

        bearish = _bearish_ob_state(2010.0, 2005.0, 2015.0)
        self.assertTrue(bearish["valid"])
        self.assertTrue(bearish["zone"])
        invalid_bearish = _bearish_ob_state(2015.1, 2005.0, 2015.0)
        self.assertFalse(invalid_bearish["valid"])

    def test_news_calendar_exact_event_uses_consistent_timestamp_resolution(self):
        import tempfile
        from wave3_ml_pipeline import load_news_calendar

        # Force nanosecond market bars while the CSV parser may return microsecond
        # timestamps. All exact-time exclusions must remain limited to +/-30 minutes.
        timestamps = pd.to_datetime([
            "2026-07-01T09:00:00Z",
            "2026-07-01T12:00:00Z",
            "2026-07-01T12:30:00Z",
            "2026-07-01T13:00:00Z",
            "2026-07-01T13:15:00Z",
            "2026-07-02T12:00:00Z",
        ], utc=True).as_unit("ns")
        frame = pd.DataFrame({"timestamp": timestamps})
        calendar = pd.DataFrame({
            "timestamp": ["2026-07-01T12:30:00Z"],
            "impact": ["high"],
            "time_mode": ["datetime"],
            "calendar_source": ["MQL5 Economic Calendar"],
            "coverage_start_utc": ["2026-07-01T00:00:00Z"],
            "coverage_end_exclusive_utc": ["2026-07-03T00:00:00Z"],
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "news.csv"
            calendar.to_csv(path, index=False)
            safe = load_news_calendar(path, frame)
        self.assertEqual(safe.tolist(), [True, False, False, False, True, True])

    def test_news_calendar_rejects_empty_high_impact_dataset(self):
        import tempfile
        from wave3_ml_pipeline import load_news_calendar

        frame = pd.DataFrame({"timestamp": pd.to_datetime(["2026-07-01T09:00:00Z"], utc=True)})
        calendar = pd.DataFrame({
            "timestamp": ["2026-07-01T09:00:00Z"],
            "impact": ["medium"],
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "news.csv"
            calendar.to_csv(path, index=False)
            with self.assertRaises(ValueError):
                load_news_calendar(path, frame)

    def test_news_calendar_rejects_missing_high_impact_timestamp(self):
        import tempfile
        from wave3_ml_pipeline import load_news_calendar

        frame = pd.DataFrame({"timestamp": pd.to_datetime(["2026-07-01T09:00:00Z"], utc=True)})
        calendar = pd.DataFrame({"timestamp": [""], "impact": ["high"], "time_mode": ["notime"]})
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "news.csv"
            calendar.to_csv(path, index=False)
            with self.assertRaisesRegex(ValueError, "non-missing timestamps"):
                load_news_calendar(path, frame)

    def test_news_manifest_records_actual_calendar_provenance(self):
        import tempfile

        calendar = pd.DataFrame({
            "timestamp": ["2026-07-01T12:30:00Z", "2026-07-02T12:30:00Z"],
            "impact": ["high", "high"],
            "time_mode": ["datetime", "datetime"],
            "calendar_source": ["MQL5 Economic Calendar", "MQL5 Economic Calendar"],
            "calendar_timezone": ["UTC (Exness trade server GMT+0)"] * 2,
            "coverage_start_utc": ["2026-07-01T00:00:00Z"] * 2,
            "coverage_end_exclusive_utc": ["2026-07-03T00:00:00Z"] * 2,
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "news.csv"
            calendar.to_csv(path, index=False)
            safe = np.array([True, False, True], dtype=bool)
            manifest = _news_calendar_manifest(path, safe, total_bars=3)

        self.assertTrue(manifest["provided"])
        self.assertEqual(manifest["event_rows"], 2)
        self.assertEqual(manifest["high_impact_event_rows"], 2)
        self.assertEqual(manifest["time_mode_counts"], {"datetime": 2})
        self.assertEqual(manifest["market_bars_total"], 3)
        self.assertEqual(manifest["market_bars_news_safe"], 2)
        self.assertEqual(manifest["market_bars_blocked"], 1)
        self.assertEqual(len(manifest["sha256"]), 64)
        self.assertIn("applied", _news_backtest_assumption(safe))

        missing = _news_calendar_manifest(None, None, total_bars=3)
        self.assertFalse(missing["provided"])
        self.assertEqual(missing["market_bars_news_safe"], 0)
        self.assertEqual(missing["market_bars_blocked"], 3)
        self.assertIn("fail closed", _news_backtest_assumption(None))

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


    def test_smc_trace_indices_are_confirmed_no_lookahead_and_not_model_features(self):
        frame = synthetic_bars(900)
        features = build_causal_features(frame)
        for slot in (1, 2, 3):
            confirmation = features[f"higher_low_{slot}_confirmation_index"].dropna()
            self.assertTrue((confirmation.to_numpy() <= confirmation.index.to_numpy()).all())

        ob_mask = features["bull_ob_origin_index"].notna()
        if ob_mask.any():
            origin = features.loc[ob_mask, "bull_ob_origin_index"].to_numpy()
            confirmed = features.loc[ob_mask, "bull_ob_confirmation_index"].to_numpy()
            row_index = features.index[ob_mask].to_numpy()
            self.assertTrue((origin <= confirmed).all())
            self.assertTrue((confirmed <= row_index).all())
            self.assertTrue((features.loc[ob_mask, "bull_ob_age_from_origin_bars"].to_numpy() >= 0).all())

        fvg_mask = features["bull_fvg_fill_origin_index"].notna()
        if fvg_mask.any():
            origin = features.loc[fvg_mask, "bull_fvg_fill_origin_index"].to_numpy()
            row_index = features.index[fvg_mask].to_numpy()
            self.assertTrue((origin < row_index).all())

        X, _, _ = make_labeled_frame(frame, features)
        diagnostic_columns = {
            "structure_break_pivot_index", "higher_low_1_index", "higher_low_1_confirmation_index",
            "bull_ob_origin_index", "bull_ob_confirmation_index", "bull_ob_distance_price_trace",
            "bull_ob_last_invalidated_origin_index", "bull_ob_last_invalidated_at_index",
            "bull_fvg_fill_origin_index", "bull_fvg_active_origin_index", "bull_fvg_first_fill_index",
            "bull_fvg_first_full_mitigation_index", "bull_fvg_fully_mitigated_now", "bos20_prior_20_high",
        }
        self.assertTrue(diagnostic_columns.isdisjoint(set(X.columns)))

    def test_smc_candidate_trace_reports_same_bar_components_and_missing_gate(self):
        frame = synthetic_bars(900)
        features = build_causal_features(frame)
        i = 700
        features.loc[i, "wave3_long_rule_breakout"] = 1.0
        features.loc[i, "wave3_long_entry_price"] = float(frame["close"].iloc[i])
        features.loc[i, "wave3_long_fib_score"] = 80.0
        features.loc[i, "fib_pullback_ratio"] = 0.618
        features.loc[i, "bos20_up"] = 1.0
        features.loc[i, "choch_rule_up"] = 1.0
        features.loc[i, "bull_ob_within5"] = 0.0
        features.loc[i, "bull_fvg_fill"] = 1.0
        features.loc[i, "smc_score_long"] = 75.0
        features.loc[i, "bos_up"] = 1.0
        features.loc[i, "choch_up"] = 0.0
        features.loc[i, "structure_break_pivot_index"] = 680.0
        features.loc[i, "structure_break_pivot_confirmation_index"] = 683.0
        features.loc[i, "structure_break_pivot_price"] = 1905.0
        features.loc[i, "bull_ob_origin_index"] = 690.0
        features.loc[i, "bull_ob_confirmation_index"] = 695.0
        features.loc[i, "bull_ob_origin_low"] = 1900.0
        features.loc[i, "bull_ob_origin_high"] = 1906.0
        features.loc[i, "bull_ob_origin_range_pct"] = 0.0032
        features.loc[i, "bull_ob_age_from_origin_bars"] = 10.0
        features.loc[i, "bull_ob_age_from_confirmation_bars"] = 5.0
        features.loc[i, "bull_ob_distance_price_trace"] = 4.2
        features.loc[i, "bull_ob_valid_trace"] = 1.0
        features.loc[i, "bull_ob_zone_trace"] = 0.0
        features.loc[i, "bull_ob_within5_trace"] = 0.0
        features.loc[i, "bull_ob_invalidated_now"] = 0.0
        features.loc[i, "bull_ob_candidate_count"] = 3.0
        features.loc[i, "bull_ob_last_invalidated_origin_index"] = 660.0
        features.loc[i, "bull_ob_last_invalidated_confirmation_index"] = 665.0
        features.loc[i, "bull_ob_last_invalidated_at_index"] = 670.0
        features.loc[i, "bull_ob_last_invalidated_low"] = 1898.0
        features.loc[i, "bull_ob_last_invalidated_high"] = 1902.0
        features.loc[i, "bull_ob_last_invalidated_range_pct"] = 0.0035
        features.loc[i, "bull_ob_last_invalidated_distance_price"] = 5.4
        features.loc[i, "bull_ob_last_invalidated_candidate_count"] = 2.0
        features.loc[i, "bull_ob_last_invalidated_search_start_index"] = 650.0
        features.loc[i, "bull_ob_last_invalidated_search_end_exclusive_index"] = 665.0
        features.loc[i, "bull_fvg_fill_origin_index"] = 680.0
        features.loc[i, "bull_fvg_fill_lower"] = 1901.0
        features.loc[i, "bull_fvg_fill_upper"] = 1903.0
        features.loc[i, "bull_fvg_fill_age_bars"] = 20.0

        trace = smc_candidate_trace(frame, features, np.array([i, i + 1]))
        self.assertEqual(trace["summary"]["candidate_rows"], 1)
        self.assertEqual(trace["summary"]["all_four_components_same_bar"], 0)
        row = trace["rows"][0]
        self.assertEqual(row["missing_components"], ["bull_ob_within5"])
        self.assertTrue(row["same_closed_signal_bar"])
        self.assertEqual(row["smc_score"], 75.0)
        self.assertEqual(row["order_block"]["selected_origin_index"], 690)
        self.assertEqual(row["order_block"]["candidate_count_at_confirmation"], 3)
        self.assertEqual(row["order_block"]["age_from_origin_bars"], 10)
        self.assertEqual(row["order_block"]["last_invalidated"]["origin_index"], 660)
        self.assertEqual(row["order_block"]["last_invalidated"]["invalidated_at_index"], 670)
        self.assertEqual(row["fair_value_gap"]["refill_origin_index"], 680)


    def test_bull_fvg_trace_distinguishes_first_overlap_from_full_mitigation_and_retests(self):
        frame = synthetic_bars(900)
        base = float(frame["close"].iloc[702])

        # Create a deterministic bullish FVG at bar 702: [high[700], low[702]].
        frame.loc[700, ["open", "high", "low", "close"]] = [base - 2.0, base, base - 5.0, base - 1.0]
        frame.loc[701, ["open", "high", "low", "close"]] = [base + 5.0, base + 20.0, base + 2.0, base + 10.0]
        frame.loc[702, ["open", "high", "low", "close"]] = [base + 12.0, base + 18.0, base + 10.0, base + 15.0]
        # Bar 703 overlaps the gap but does not reach its lower boundary.
        frame.loc[703, ["open", "high", "low", "close"]] = [base + 7.0, base + 12.0, base + 5.0, base + 8.0]
        # Bar 704 reaches the lower boundary: first full mitigation.
        frame.loc[704, ["open", "high", "low", "close"]] = [base + 1.0, base + 2.0, base - 1.0, base + 1.5]
        # Bar 705 overlaps the same gap again after full mitigation.
        frame.loc[705, ["open", "high", "low", "close"]] = [base + 6.0, base + 8.0, base + 4.0, base + 7.0]

        features = build_causal_features(frame)
        self.assertEqual(features.loc[702, "bull_fvg_created_now"], 1.0)
        self.assertEqual(features.loc[703, "bull_fvg_fill"], 1.0)
        self.assertEqual(features.loc[703, "bull_fvg_first_fill_index"], 703.0)
        self.assertTrue(np.isnan(features.loc[703, "bull_fvg_first_full_mitigation_index"]))
        self.assertEqual(features.loc[703, "bull_fvg_fully_mitigated_now"], 0.0)

        self.assertEqual(features.loc[704, "bull_fvg_fill"], 1.0)
        self.assertEqual(features.loc[704, "bull_fvg_first_full_mitigation_index"], 704.0)
        self.assertEqual(features.loc[704, "bull_fvg_fully_mitigated_now"], 1.0)

        # The frozen overlap flag remains unchanged and can still be true on a later
        # re-touch; the diagnostic fields make that post-mitigation re-touch explicit.
        self.assertEqual(features.loc[705, "bull_fvg_fill"], 1.0)
        self.assertEqual(features.loc[705, "bull_fvg_first_fill_index"], 703.0)
        self.assertEqual(features.loc[705, "bull_fvg_first_full_mitigation_index"], 704.0)
        self.assertEqual(features.loc[705, "bull_fvg_fully_mitigated_now"], 0.0)

        for candidate_index in (704, 705):
            features.loc[candidate_index, "wave3_long_rule_breakout"] = 1.0
            features.loc[candidate_index, "wave3_long_entry_price"] = float(frame["close"].iloc[candidate_index])
        trace = smc_candidate_trace(frame, features, np.array([704, 705]))
        self.assertEqual(trace["summary"]["candidate_rows"], 2)
        self.assertEqual(trace["summary"]["fvg_full_mitigation_on_signal_bar"], 1)
        self.assertEqual(trace["summary"]["fvg_full_mitigation_touch_on_signal_bar_all_candidates"], 1)
        self.assertEqual(trace["summary"]["fvg_positive_rows_with_full_mitigation_touch_on_signal_bar"], 1)
        self.assertEqual(trace["summary"]["fvg_positive_rows_first_full_mitigation_precedes_signal"], 1)
        gaps = {row["signal_index"]: row["fair_value_gap"] for row in trace["rows"]}
        first = gaps[704]
        self.assertTrue(first["full_mitigation_touch_on_signal_bar"])
        self.assertTrue(first["first_full_mitigation_on_signal_bar"])
        self.assertFalse(first["full_mitigation_precedes_signal"])
        retouch = gaps[705]
        self.assertEqual(retouch["first_refill_index"], 703)
        self.assertEqual(retouch["first_full_mitigation_index"], 704)
        self.assertFalse(retouch["full_mitigation_touch_on_signal_bar"])
        self.assertFalse(retouch["first_full_mitigation_on_signal_bar"])
        self.assertTrue(retouch["full_mitigation_precedes_signal"])
        self.assertTrue(retouch["overlap_is_retest_after_full_mitigation"])

        X, _, _ = make_labeled_frame(frame, features)
        self.assertNotIn("bull_fvg_first_full_mitigation_index", X.columns)
        self.assertNotIn("bull_fvg_fully_mitigated_now", X.columns)



if __name__ == "__main__":
    unittest.main()
