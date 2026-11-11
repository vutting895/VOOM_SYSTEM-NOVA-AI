"""Unit tests for NOVA durable queue contracts (PostgreSQL adapter mocked)."""
import asyncio
import json
import unittest

from workers.jobs.queue import (
    IdempotencyConflict,
    QueueError,
    claim_job,
    complete_job,
    enqueue_job,
    fail_job,
    heartbeat_job,
)


class FakeConnection:
    def __init__(self, rows=None, execute_result="UPDATE 1"):
        self.rows = list(rows or [])
        self.execute_result = execute_result
        self.calls = []

    async def fetchrow(self, query, *args):
        self.calls.append((query, args))
        return self.rows.pop(0) if self.rows else None

    async def execute(self, query, *args):
        self.calls.append((query, args))
        return self.execute_result


class QueueTests(unittest.TestCase):
    def run_async(self, coro):
        return asyncio.run(coro)

    def test_enqueue_uses_idempotency_insert(self):
        row = {"id": "job-1", "job_type": "dataset.validate", "payload": {"manifest": "abc"}}
        conn = FakeConnection([row])
        result = self.run_async(enqueue_job(
            conn, job_type="dataset.validate", payload={"manifest": "abc"},
            idempotency_key="dataset:abc123",
        ))
        self.assertEqual(result, row)
        self.assertIn("ON CONFLICT (idempotency_key) DO NOTHING", conn.calls[0][0])

    def test_enqueue_returns_same_existing_request(self):
        existing = {"id": "job-1", "job_type": "dataset.validate", "payload": {"manifest": "abc"}}
        conn = FakeConnection([None, existing])
        result = self.run_async(enqueue_job(
            conn, job_type="dataset.validate", payload={"manifest": "abc"},
            idempotency_key="dataset:abc123",
        ))
        self.assertEqual(result["id"], "job-1")

    def test_enqueue_rejects_idempotency_key_reuse(self):
        existing = {"id": "job-1", "job_type": "dataset.validate", "payload": {"manifest": "other"}}
        conn = FakeConnection([None, existing])
        with self.assertRaises(IdempotencyConflict):
            self.run_async(enqueue_job(
                conn, job_type="dataset.validate", payload={"manifest": "abc"},
                idempotency_key="dataset:abc123",
            ))

    def test_enqueue_rejects_non_allowlisted_job(self):
        with self.assertRaises(QueueError):
            self.run_async(enqueue_job(
                FakeConnection(), job_type="broker.place_order", payload={},
                idempotency_key="job:broker123",
            ))

    def test_enqueue_rejects_credentials_in_payload(self):
        with self.assertRaises(QueueError):
            self.run_async(enqueue_job(
                FakeConnection(), job_type="dataset.validate",
                payload={"nested": {"access_token": "do-not-store"}},
                idempotency_key="job:dataset123",
            ))

    def test_enqueue_rejects_non_json_numbers(self):
        with self.assertRaises(QueueError):
            self.run_async(enqueue_job(
                FakeConnection(), job_type="dataset.validate", payload={"score": float("nan")},
                idempotency_key="job:dataset123",
            ))

    def test_claim_uses_skip_locked_and_lease(self):
        conn = FakeConnection([{"id": "job-1", "status": "running"}])
        result = self.run_async(claim_job(conn, worker_id="nova-research-1", lease_seconds=30))
        self.assertEqual(result["id"], "job-1")
        self.assertIn("FOR UPDATE SKIP LOCKED", conn.calls[0][0])

    def test_claim_rejects_invalid_lease(self):
        with self.assertRaises(QueueError):
            self.run_async(claim_job(FakeConnection(), worker_id="worker", lease_seconds=1))

    def test_heartbeat_requires_current_worker_lease(self):
        conn = FakeConnection(execute_result="UPDATE 1")
        self.assertTrue(self.run_async(heartbeat_job(
            conn, job_id="job-1", worker_id="worker-1", lease_seconds=30,
        )))
        self.assertIn("worker_id = $2", conn.calls[0][0])

    def test_complete_is_worker_scoped(self):
        conn = FakeConnection(execute_result="UPDATE 1")
        self.assertTrue(self.run_async(complete_job(conn, job_id="job-1", worker_id="worker-1")))
        self.assertIn("status = 'succeeded'", conn.calls[0][0])

    def test_fail_job_uses_bounded_error_code_and_retry_state(self):
        conn = FakeConnection([{"status": "retry"}])
        result = self.run_async(fail_job(
            conn, job_id="job-1", worker_id="worker-1", error_code="DATA_VALIDATION_FAILED",
        ))
        self.assertEqual(result, "retry")

    def test_fail_job_rejects_raw_error_text(self):
        with self.assertRaises(QueueError):
            self.run_async(fail_job(
                FakeConnection(), job_id="job-1", worker_id="worker-1",
                error_code="token=secret",
            ))


if __name__ == "__main__":
    unittest.main()
