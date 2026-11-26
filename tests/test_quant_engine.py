"""Contract tests for the Internal Quant Engine research foundation."""
import unittest
import sqlite3
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory

from workers.quant_engine import (
    DatasetValidationError,
    JobLifecycleError,
    JobNotFoundError,
    JobConflictError,
    SQLiteResearchJobStore,
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
            walk_forward_windows(100, train_bars=30, test_bars=10, purge_bars=0, expanding="yes")

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
        with self.assertRaisesRegex(JobLifecycleError, "timezone"):
            self.create_job(created_at="2026-11-26T10:00:00")
        job = self.create_job()
        with self.assertRaisesRegex(JobLifecycleError, "cannot precede"):
            self.transition(job, JobState.VALIDATING, 0, occurred_at="2026-11-26T09:59:00Z")

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


    def test_transition_rejects_malformed_job_snapshots(self):
        job = self.create_job()
        malformed = (
            replace(job, sequence=-1),
            replace(job, sequence=True),
            replace(job, resource_profile="unbounded"),
            replace(job, timeout_seconds=901),
            replace(job, updated_at="2026-11-26T09:59:00Z"),
            replace(job, job_type="broker.trade"),
            replace(job, state="RUNNING"),
        )
        for snapshot in malformed:
            with self.subTest(snapshot=snapshot), self.assertRaises(JobLifecycleError):
                self.transition(snapshot, JobState.VALIDATING, 1)




class QuantJobStoreTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = TemporaryDirectory()
        self.database = Path(self.tempdir.name) / "quant-jobs.sqlite3"
        self.store = SQLiteResearchJobStore(self.database)

    def tearDown(self):
        self.tempdir.cleanup()

    def create(self, **overrides):
        values = {
            "job_id": "durable-job-001",
            "tenant_id": "tenant-001",
            "requester_id": "user-001",
            "job_type": "backtest",
            "created_at": "2026-11-26T10:00:00Z",
            "idempotency_key": "create-key-001",
        }
        values.update(overrides)
        return self.store.create(**values)

    def _create_legacy_database(self, *, mismatched_tenant=False):
        # Reproduce the pre-hardening schema: events reference job_id only.
        with sqlite3.connect(self.database) as connection:
            connection.execute("DROP TABLE IF EXISTS research_job_events")
            connection.execute("DROP TABLE IF EXISTS research_jobs")
            connection.execute(
                """CREATE TABLE research_jobs (
                    job_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    requester_id TEXT NOT NULL,
                    job_type TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    sequence INTEGER NOT NULL CHECK(sequence >= 0),
                    resource_profile TEXT NOT NULL CHECK(resource_profile = 'free-cpu'),
                    timeout_seconds INTEGER NOT NULL CHECK(timeout_seconds BETWEEN 1 AND 900),
                    UNIQUE(tenant_id, job_id)
                )"""
            )
            connection.execute(
                """CREATE TABLE research_job_events (
                    job_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL CHECK(sequence > 0),
                    from_state TEXT,
                    to_state TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    reason_code TEXT,
                    PRIMARY KEY(job_id, sequence),
                    FOREIGN KEY(job_id) REFERENCES research_jobs(job_id)
                )"""
            )
            connection.execute(
                """INSERT INTO research_jobs
                   (job_id, tenant_id, requester_id, job_type, state, created_at,
                    updated_at, sequence, resource_profile, timeout_seconds)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("legacy-job-001", "tenant-001", "user-001", "backtest", "VALIDATING",
                 "2026-11-26T10:00:00Z", "2026-11-26T10:01:00Z", 1, "free-cpu", 900),
            )
            connection.execute(
                """INSERT INTO research_job_events
                   (job_id, tenant_id, sequence, from_state, to_state,
                    actor_id, occurred_at, reason_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                ("legacy-job-001", "wrong-tenant" if mismatched_tenant else "tenant-001",
                 1, "QUEUED", "VALIDATING", "worker-001", "2026-11-26T10:01:00Z", None),
            )

    def test_legacy_schema_migrates_preserving_events_and_is_idempotent(self):
        self._create_legacy_database()
        migrated = SQLiteResearchJobStore(self.database)
        events = migrated.list_events(tenant_id="tenant-001", job_id="legacy-job-001")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].actor_id, "worker-001")

        with sqlite3.connect(self.database) as connection:
            fk_rows = connection.execute(
                "PRAGMA foreign_key_list(research_job_events)"
            ).fetchall()
            fk_pairs = {(row[3], row[4]) for row in fk_rows if row[2] == "research_jobs"}
            self.assertEqual(fk_pairs, {("tenant_id", "tenant_id"), ("job_id", "job_id")})
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    """INSERT INTO research_job_events
                       (job_id, tenant_id, sequence, from_state, to_state,
                        actor_id, occurred_at, reason_code)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    ("legacy-job-001", "attacker-tenant", 2, "VALIDATING",
                     "RUNNING", "attacker", "2026-11-26T10:02:00Z", None),
                )

        reopened = SQLiteResearchJobStore(self.database)
        self.assertEqual(
            reopened.list_events(tenant_id="tenant-001", job_id="legacy-job-001"),
            events,
        )
        with sqlite3.connect(self.database) as connection:
            trigger_names = {
                row[0] for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'trigger'"
                )
            }
        self.assertTrue({
            "research_job_events_no_update",
            "research_job_events_no_delete",
        }.issubset(trigger_names))

    def test_legacy_migration_fails_closed_and_preserves_original_table(self):
        self._create_legacy_database(mismatched_tenant=True)
        with self.assertRaises(sqlite3.IntegrityError):
            SQLiteResearchJobStore(self.database)

        with sqlite3.connect(self.database) as connection:
            row = connection.execute(
                "SELECT tenant_id, actor_id FROM research_job_events WHERE job_id = ?",
                ("legacy-job-001",),
            ).fetchone()
            self.assertEqual(row, ("wrong-tenant", "worker-001"))
            table_names = {
                item[0] for item in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            self.assertIn("research_job_events", table_names)
            self.assertNotIn("research_job_events_v2", table_names)
            fk_rows = connection.execute(
                "PRAGMA foreign_key_list(research_job_events)"
            ).fetchall()
            fk_pairs = {(item[3], item[4]) for item in fk_rows if item[2] == "research_jobs"}
            self.assertEqual(fk_pairs, {("job_id", "job_id")})

    def test_create_is_persistent_and_idempotent(self):
        first = self.create()
        second = self.create()
        reopened = SQLiteResearchJobStore(self.database).get(
            tenant_id="tenant-001", job_id="durable-job-001"
        )
        self.assertEqual(first, second)
        self.assertEqual(first, reopened)

    def test_create_idempotency_key_cannot_be_reused_for_different_payload(self):
        self.create()
        with self.assertRaises(JobConflictError):
            self.create(job_id="durable-job-002")

    def test_tenant_scope_hides_jobs_and_event_streams(self):
        self.create()
        with self.assertRaises(JobNotFoundError):
            self.store.get(tenant_id="other-tenant", job_id="durable-job-001")
        with self.assertRaises(JobNotFoundError):
            self.store.list_events(tenant_id="other-tenant", job_id="durable-job-001")

    def test_transition_and_event_commit_atomically_and_survive_reopen(self):
        self.create()
        updated, event = self.store.transition(
            tenant_id="tenant-001",
            job_id="durable-job-001",
            expected_state=JobState.QUEUED,
            next_state=JobState.VALIDATING,
            actor_id="worker-001",
            occurred_at="2026-11-26T10:01:00Z",
            idempotency_key="transition-key-001",
        )
        reopened = SQLiteResearchJobStore(self.database)
        self.assertEqual(
            reopened.get(tenant_id="tenant-001", job_id="durable-job-001"), updated
        )
        self.assertEqual(reopened.list_events(
            tenant_id="tenant-001", job_id="durable-job-001"
        ), (event,))

    def test_transition_replay_returns_original_result_without_duplicate_event(self):
        self.create()
        args = {
            "tenant_id": "tenant-001",
            "job_id": "durable-job-001",
            "expected_state": JobState.QUEUED,
            "next_state": JobState.VALIDATING,
            "actor_id": "worker-001",
            "occurred_at": "2026-11-26T10:01:00Z",
            "idempotency_key": "transition-replay-key",
        }
        first = self.store.transition(**args)
        replay = self.store.transition(**args)
        self.assertEqual(first, replay)
        self.assertEqual(len(self.store.list_events(
            tenant_id="tenant-001", job_id="durable-job-001"
        )), 1)

    def test_transition_idempotency_key_reuse_with_changed_payload_is_rejected(self):
        self.create()
        self.store.transition(
            tenant_id="tenant-001", job_id="durable-job-001",
            expected_state=JobState.QUEUED, next_state=JobState.VALIDATING,
            actor_id="worker-001", occurred_at="2026-11-26T10:01:00Z",
            idempotency_key="transition-conflict-key",
        )
        with self.assertRaises(JobConflictError):
            self.store.transition(
                tenant_id="tenant-001", job_id="durable-job-001",
                expected_state=JobState.VALIDATING, next_state=JobState.RUNNING,
                actor_id="worker-001", occurred_at="2026-11-26T10:02:00Z",
                idempotency_key="transition-conflict-key",
            )

    def test_stale_state_transition_does_not_write_event(self):
        self.create()
        with self.assertRaises(JobLifecycleError):
            self.store.transition(
                tenant_id="tenant-001", job_id="durable-job-001",
                expected_state=JobState.RUNNING, next_state=JobState.FINALIZING,
                actor_id="worker-001", occurred_at="2026-11-26T10:01:00Z",
                idempotency_key="stale-transition-key",
            )
        self.assertEqual(self.store.list_events(
            tenant_id="tenant-001", job_id="durable-job-001"
        ), ())

    def test_event_ledger_rejects_direct_update_and_delete(self):
        self.create()
        self.store.transition(
            tenant_id="tenant-001",
            job_id="durable-job-001",
            expected_state=JobState.QUEUED,
            next_state=JobState.VALIDATING,
            actor_id="worker-001",
            occurred_at="2026-11-26T10:01:00Z",
            idempotency_key="append-only-key",
        )
        with sqlite3.connect(self.database) as connection:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                connection.execute(
                    "UPDATE research_job_events SET actor_id = ? WHERE job_id = ?",
                    ("tampered-actor", "durable-job-001"),
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                connection.execute(
                    "DELETE FROM research_job_events WHERE job_id = ?",
                    ("durable-job-001",),
                )
        events = self.store.list_events(tenant_id="tenant-001", job_id="durable-job-001")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].actor_id, "worker-001")

    def test_event_foreign_key_rejects_cross_tenant_job_reference(self):
        self.create()
        with sqlite3.connect(self.database) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    """INSERT INTO research_job_events
                       (job_id, tenant_id, sequence, from_state, to_state,
                        actor_id, occurred_at, reason_code)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        "durable-job-001", "attacker-tenant", 1, None,
                        "QUEUED", "attacker", "2026-11-26T10:01:00Z", None,
                    ),
                )
        self.assertEqual(
            self.store.list_events(tenant_id="tenant-001", job_id="durable-job-001"),
            (),
        )

    def test_duplicate_job_id_is_rejected_even_with_new_idempotency_key(self):
        self.create()
        with self.assertRaises(JobConflictError):
            self.create(idempotency_key="create-key-002")




if __name__ == "__main__":
    unittest.main(verbosity=2)
