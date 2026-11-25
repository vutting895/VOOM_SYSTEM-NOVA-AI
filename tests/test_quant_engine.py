"""Contract tests for the Internal Quant Engine research foundation."""
import unittest

from workers.quant_engine import (
    DatasetValidationError,
    JobLifecycleError,
    JobState,
    create_research_job,
    transition_research_job,
    build_run_fingerprint,
    canonical_dataset_sha256,
    chronological_split,
    derive_purge_policy,
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

    def test_sub_interval_delta_is_reported_as_irregular(self):
        rows = sample_rows(3)
        rows[2]["timestamp"] = "2026-01-01T01:30:00Z"
        report = validate_ohlcv(rows, expected_interval_seconds=3600)
        self.assertEqual(report.observed_gap_count, 0)
        self.assertEqual(report.observed_irregular_interval_count, 1)
        self.assertTrue(any("do not align" in warning for warning in report.warnings))
        with self.assertRaises(DatasetValidationError):
            validate_ohlcv(rows, expected_interval_seconds=3600, reject_gaps=True)

    def test_non_integral_interval_is_not_floor_counted_as_missing_candles(self):
        rows = sample_rows(3)
        rows[2]["timestamp"] = "2026-01-01T03:30:00Z"
        report = validate_ohlcv(rows, expected_interval_seconds=3600)
        self.assertEqual(report.observed_gap_count, 0)
        self.assertEqual(report.observed_irregular_interval_count, 1)
        self.assertTrue(any("do not align" in warning for warning in report.warnings))
        with self.assertRaises(DatasetValidationError):
            validate_ohlcv(rows, expected_interval_seconds=3600, reject_gaps=True)


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
    def test_purge_policy_uses_maximum_forward_label_horizon_and_records_embargo(self):
        policy = derive_purge_policy([3, 8, 5], embargo_bars=2)
        self.assertEqual(policy.max_label_horizon_bars, 8)
        self.assertEqual(policy.purge_bars, 10)
        self.assertEqual(policy.to_manifest(), {
            "label_horizons_bars": [3, 8, 5],
            "max_label_horizon_bars": 8,
            "embargo_bars": 2,
            "purge_bars": 10,
        })
        with self.assertRaises(ValueError):
            derive_purge_policy([])
        with self.assertRaises(ValueError):
            derive_purge_policy([0, 4])

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

    def test_rolling_windows_keep_training_size_fixed(self):
        windows = walk_forward_windows(100, train_bars=30, test_bars=10, purge_bars=0, expanding=False)
        self.assertEqual(windows[0].train_end - windows[0].train_start, 30)
        self.assertEqual(windows[-1].train_end - windows[-1].train_start, 30)

    def test_split_rejects_boolean_non_finite_and_non_numeric_fractions(self):
        rows = list(range(100))
        for value in (True, float("nan"), "0.6"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                chronological_split(rows, train_fraction=value, validation_fraction=0.2, purge_bars=0)

    def test_walk_forward_requires_boolean_expanding_flag(self):
        with self.assertRaisesRegex(ValueError, "expanding must be a boolean"):
            walk_forward_windows(100, train_bars=30, test_bars=10, expanding="yes")

    def test_overlapping_test_folds_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "overlapping test folds"):
            walk_forward_windows(100, train_bars=30, test_bars=10, step_bars=5, purge_bars=0)


class QuantJobLifecycleTests(unittest.TestCase):
    def create_job(self, **overrides):
        values = {
            "job_id": "job-001",
            "tenant_id": "tenant-001",
            "requester_id": "user-001",
            "job_type": "backtest",
            "created_at": "2026-11-26T10:00:00Z",
        }
        values.update(overrides)
        return create_research_job(**values)

    def transition(self, job, target, minute, **overrides):
        values = {
            "expected_state": job.state,
            "next_state": target,
            "actor_id": "worker-001",
            "occurred_at": f"2026-11-26T10:{minute:02d}:00Z",
        }
        values.update(overrides)
        return transition_research_job(job, **values)

    def test_job_starts_queued_and_runs_complete_happy_path(self):
        job = self.create_job()
        self.assertEqual(job.state, JobState.QUEUED)
        self.assertEqual(job.resource_profile, "free-cpu")
        job, event = self.transition(job, JobState.VALIDATING, 1)
        self.assertEqual((job.state, event.sequence), (JobState.VALIDATING, 1))
        job, _ = self.transition(job, JobState.RUNNING, 2)
        job, _ = self.transition(job, JobState.FINALIZING, 3)
        job, event = self.transition(job, JobState.SUCCEEDED, 4)
        self.assertEqual(job.state, JobState.SUCCEEDED)
        self.assertEqual(event.from_state, JobState.FINALIZING)
        self.assertEqual(event.sequence, 4)

    def test_rejects_skipping_validation_and_finalization(self):
        job = self.create_job()
        with self.assertRaisesRegex(JobLifecycleError, "illegal job transition"):
            self.transition(job, JobState.RUNNING, 1)
        running, _ = self.transition(job, JobState.VALIDATING, 1)
        running, _ = self.transition(running, JobState.RUNNING, 2)
        with self.assertRaisesRegex(JobLifecycleError, "illegal job transition"):
            self.transition(running, JobState.SUCCEEDED, 3)

    def test_terminal_states_are_immutable(self):
        job = self.create_job()
        job, _ = self.transition(job, JobState.REJECTED, 1)
        with self.assertRaisesRegex(JobLifecycleError, "terminal"):
            self.transition(job, JobState.RUNNING, 2)

    def test_optimistic_state_conflict_is_rejected(self):
        job = self.create_job()
        with self.assertRaisesRegex(JobLifecycleError, "state conflict"):
            self.transition(job, JobState.VALIDATING, 1, expected_state=JobState.RUNNING)

    def test_only_allowlisted_research_job_types_are_accepted(self):
        for unsafe in ("order", "execute", "withdraw", "transfer", "close-position", "broker.trade"):
            with self.subTest(job_type=unsafe), self.assertRaises(JobLifecycleError):
                self.create_job(job_type=unsafe)

    def test_resource_profile_and_timeout_are_bounded(self):
        with self.assertRaisesRegex(JobLifecycleError, "free-cpu"):
            self.create_job(resource_profile="gpu")
        for timeout in (0, 901, True, 1.5):
            with self.subTest(timeout=timeout), self.assertRaises(JobLifecycleError):
                self.create_job(timeout_seconds=timeout)

    def test_server_resolved_identity_fields_are_validated(self):
        for field in ("job_id", "tenant_id", "requester_id"):
            with self.subTest(field=field), self.assertRaises(JobLifecycleError):
                self.create_job(**{field: "../other-tenant"})

    def test_timestamps_must_be_timezone_aware_and_monotonic(self):
        with self.assertRaisesRegex(JobLifecycleError, "timezone-aware"):
            self.create_job(created_at="2026-11-26T10:00:00")
        job = self.create_job()
        with self.assertRaisesRegex(JobLifecycleError, "cannot precede"):
            self.transition(job, JobState.VALIDATING, 0)

    def test_reason_code_is_bounded_and_event_is_tenant_scoped(self):
        job = self.create_job()
        updated, event = self.transition(job, JobState.VALIDATING, 1, reason_code="manifest_valid")
        self.assertEqual(event.tenant_id, job.tenant_id)
        self.assertEqual(event.job_id, job.job_id)
        self.assertEqual(updated.sequence, 1)
        with self.assertRaisesRegex(JobLifecycleError, "reason_code"):
            self.transition(job, JobState.VALIDATING, 1, reason_code="Unsafe Reason!")

    def test_transition_does_not_mutate_previous_snapshot(self):
        job = self.create_job()
        updated, _ = self.transition(job, JobState.VALIDATING, 1)
        self.assertEqual(job.state, JobState.QUEUED)
        self.assertEqual(job.sequence, 0)
        self.assertEqual(updated.sequence, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
