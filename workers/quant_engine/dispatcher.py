"""Single-process QuantLab dispatcher for the single-node SQLite queue.

Only dataset.validate is executable. Unsupported job types are rejected closed.
Run one dispatcher per persistent SQLite volume; this is not a distributed worker.
"""
from __future__ import annotations

import logging
import os
import signal
import threading
import time
from typing import Any

from workers.quant_engine.dataset_executor import (
    UnsupportedJobType,
    execute_claimed_job,
)
from workers.quant_engine.queue_store import (
    QueueConflict,
    SQLiteQuantLabQueue,
)

LOG = logging.getLogger("nova.quantlab.dispatcher")
LEASE_SECONDS = 30
HEARTBEAT_SECONDS = 10


class LeaseKeeper:
    def __init__(self, queue: SQLiteQuantLabQueue, claim: dict[str, Any],
                 worker_id: str, stop: threading.Event):
        self.queue = queue
        self.claim = claim
        self.worker_id = worker_id
        self.stop = stop
        self.lost = threading.Event()
        self.thread = threading.Thread(target=self._run, name="quantlab-lease-heartbeat", daemon=True)

    def start(self) -> None:
        self.thread.start()

    def _run(self) -> None:
        job_id = self.claim["job"]["job_id"]
        token = self.claim["lease_token"]
        while not self.stop.wait(HEARTBEAT_SECONDS):
            try:
                self.queue.heartbeat(job_id=job_id, worker_id=self.worker_id,
                                     lease_token=token, lease_seconds=LEASE_SECONDS)
            except (QueueConflict, OSError, RuntimeError):
                self.lost.set()
                LOG.error("lease lost for job %s; result will not be committed", job_id)
                return

    def close(self) -> None:
        self.stop.set()
        if self.thread.is_alive():
            self.thread.join(timeout=2)


def process_claim(queue: SQLiteQuantLabQueue, claim: dict[str, Any],
                  worker_id: str, *, artifact_root: str | None = None) -> dict[str, Any]:
    """Execute one leased job and persist a terminal result using its lease token."""
    job = claim["job"]
    job_id = job["job_id"]
    token = claim["lease_token"]
    stop = threading.Event()
    keeper = LeaseKeeper(queue, claim, worker_id, stop)
    keeper.start()
    try:
        try:
            result = execute_claimed_job(claim, artifact_root=artifact_root)
            state, error_code = "SUCCEEDED", None
        except UnsupportedJobType:
            result, state, error_code = None, "REJECTED", "executor_not_implemented"
        except (ValueError, OSError):
            result, state, error_code = None, "FAILED", "dataset_validation_failed"
        if keeper.lost.is_set():
            raise QueueConflict("lease_lost_before_finish")
        return queue.finish(job_id=job_id, worker_id=worker_id, lease_token=token,
                            state=state, error_code=error_code, result=result)
    finally:
        keeper.close()


def run_dispatcher(*, poll_seconds: float = 2.0) -> None:
    db_path = os.getenv("QUANTLAB_DB_PATH", "/data/nova-quantlab/quantlab.sqlite3")
    worker_id = os.getenv("QUANTLAB_WORKER_ID", "quantlab-dispatcher-1")
    artifact_root = os.getenv("QUANTLAB_DATASET_ROOT")
    if not os.path.isabs(db_path) or not os.path.isabs(artifact_root or "/"):
        raise RuntimeError("QuantLab storage paths must be absolute")
    if not 0.1 <= poll_seconds <= 30:
        raise ValueError("poll_seconds_out_of_range")

    queue = SQLiteQuantLabQueue(db_path)
    shutdown = threading.Event()

    def request_shutdown(_signum: int, _frame: Any) -> None:
        shutdown.set()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    LOG.info("QuantLab dispatcher started; worker_id=%s", worker_id)
    while not shutdown.is_set():
        claim = queue.claim(worker_id=worker_id, lease_seconds=LEASE_SECONDS)
        if claim is None:
            shutdown.wait(poll_seconds)
            continue
        job_id = claim["job"]["job_id"]
        try:
            outcome = process_claim(queue, claim, worker_id, artifact_root=artifact_root)
            LOG.info("job %s finished with state %s", job_id, outcome["state"])
        except QueueConflict:
            LOG.warning("job %s lease conflict; refusing stale completion", job_id)
        except Exception:
            LOG.exception("job %s failed in dispatcher", job_id)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    run_dispatcher()
