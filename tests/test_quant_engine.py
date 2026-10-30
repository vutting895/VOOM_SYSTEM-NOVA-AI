"""Contract tests for the Internal Quant Engine research foundation."""
import unittest

from workers.quant_engine import (
    DatasetValidationError,
    build_run_fingerprint,
    canonical_dataset_sha256,
    chronological_split,
    purge_bars_for_label_horizon,
    validate_ohlcv,
    walk_forward_windows,
)


def sample_rows(count=20):
    rows = []
    for index in range(count):
        close = 100 + index
        rows.append({
            "timestamp": f"2026-01-01T{index:02d}:00:00Z" if index < 24 else f"2026-01-02T{index-24:02d}:00:00Z",
            "open": close - 0.5,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 1000,
        })
    return rows


class QuantQualityTests(unittest.TestCase):
    def test_valid_rows_return_quality_report(self):
        report = validate_ohlcv(sample_rows(3), expected_interval_seconds=3600)
        self.assertEqual(report.row_count, 3)
        self.assertEqual(report.observed_gap_count, 0)
        self.assertEqual(report.schema_version, "nova.ohlcv.v1")

    def test_gap_is_reported_but_never_filled(self):
        rows = sample_rows(3)
        rows[2]["timestamp"] = "2026-01-01T04:00:00Z"
        report = validate_ohlcv(rows, expected_interval_seconds=3600)
        self.assertEqual(report.observed_gap_count, 2)
        self.assertEqual(len(rows), 3)
        with self.assertRaises(DatasetValidationError):
            validate_ohlcv(rows, expected_interval_seconds=3600, reject_gaps=True)

    def test_irregular_interval_is_not_floor_counted_as_missing_bars(self):
        rows = sample_rows(2)
        rows[1]["timestamp"] = "2026-01-01T02:30:00Z"
        report = validate_ohlcv(rows, expected_interval_seconds=3600)
        self.assertEqual(report.observed_gap_count, 0)
        self.assertEqual(report.irregular_interval_count, 1)
        self.assertIn("non-aligned", report.warnings[0])

    def test_rejects_naive_timestamp_and_bad_ohlc(self):
        rows = sample_rows(2)
        rows[0]["timestamp"] = "2026-01-01T00:00:00"
        with self.assertRaises(DatasetValidationError):
            validate_ohlcv(rows)
        rows = sample_rows(2)
        rows[1]["high"] = rows[1]["close"] - 1
        with self.assertRaises(DatasetValidationError):
            validate_ohlcv(rows)

    def test_rejects_duplicate_or_out_of_order_timestamps(self):
        rows = sample_rows(3)
        rows[2]["timestamp"] = rows[1]["timestamp"]
        with self.assertRaises(DatasetValidationError):
            validate_ohlcv(rows)

    def test_dataset_fingerprint_is_canonical_and_deterministic(self):
        rows_a = sample_rows(2)
        rows_b = sample_rows(2)
        rows_b[0]["timestamp"] = "2026-01-01T07:00:00+07:00"
        self.assertEqual(canonical_dataset_sha256(rows_a), canonical_dataset_sha256(rows_b))
        changed = sample_rows(2)
        changed[1]["volume"] = 1001
        self.assertNotEqual(canonical_dataset_sha256(rows_a), canonical_dataset_sha256(changed))


class QuantExperimentIdentityTests(unittest.TestCase):
    def test_run_fingerprint_is_order_independent_but_config_sensitive(self):
        common = {
            "dataset_sha256": "a" * 64,
            "code_revision": "abc123",
            "strategy_id": "wave3-smc",
            "strategy_version": "6.2.6.3",
            "evaluation": {"train_bars": 1000, "test_bars": 200},
            "seed": 42,
        }
        first = build_run_fingerprint(**common, parameters={"fast": 12, "slow": 26})
        second = build_run_fingerprint(**common, parameters={"slow": 26, "fast": 12})
        changed = build_run_fingerprint(**common, parameters={"fast": 13, "slow": 26})
        self.assertEqual(first, second)
        self.assertNotEqual(first, changed)

    def test_run_fingerprint_rejects_non_finite_values(self):
        with self.assertRaises(ValueError):
            build_run_fingerprint(
                dataset_sha256="a" * 64,
                code_revision="abc",
                strategy_id="test",
                strategy_version="1",
                parameters={"threshold": float("nan")},
                evaluation={},
            )


class QuantSplitTests(unittest.TestCase):
    def test_chronological_split_purges_boundary_bars(self):
        rows = list(range(100))
        split = chronological_split(rows, train_fraction=0.6, validation_fraction=0.2, purge_bars=3)
        self.assertEqual(split.train, tuple(range(57)))
        self.assertEqual(split.validation, tuple(range(60, 77)))
        self.assertEqual(split.test, tuple(range(80, 100)))
        self.assertEqual(split.purged_indices, (57, 58, 59, 77, 78, 79))
        self.assertLess(max(split.train), min(split.validation))
        self.assertLess(max(split.validation), min(split.test))

    def test_walk_forward_windows_are_chronological_and_purged(self):
        windows = walk_forward_windows(100, train_bars=40, test_bars=10, step_bars=10, purge_bars=2)
        self.assertEqual(len(windows), 5)
        self.assertEqual((windows[0].train_start, windows[0].train_end), (0, 40))
        self.assertEqual((windows[0].test_start, windows[0].test_end), (42, 52))
        self.assertLess(windows[0].train_end, windows[0].test_start)
        self.assertLess(windows[0].test_end, windows[1].test_end)

    def test_overlapping_test_folds_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "overlapping test folds"):
            walk_forward_windows(100, train_bars=40, test_bars=10, step_bars=5, purge_bars=2)

    def test_rolling_windows_keep_training_size_fixed(self):
        windows = walk_forward_windows(100, train_bars=30, test_bars=10, expanding=False)
        self.assertEqual(windows[0].train_end - windows[0].train_start, 30)
        self.assertEqual(windows[-1].train_end - windows[-1].train_start, 30)

    def test_purge_policy_uses_strategy_label_horizon(self):
        self.assertEqual(purge_bars_for_label_horizon(12), 12)
        with self.assertRaises(ValueError):
            purge_bars_for_label_horizon(-1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
