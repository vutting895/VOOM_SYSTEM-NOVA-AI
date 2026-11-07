"""Celery application for NOVA background market analysis."""

import os
from celery import Celery
from kombu import Queue

BROKER_URL = os.environ.get("REDIS_BROKER_URL", "redis://localhost:6379/0")
RESULT_BACKEND = os.environ.get("REDIS_RESULT_BACKEND_URL", "redis://localhost:6379/2")

celery_app = Celery(
    "voom_nova_worker",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["tasks"],
)

celery_app.conf.update(
    accept_content=["json"],
    task_serializer="json",
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=3600,
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=90,
    task_time_limit=120,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"visibility_timeout": 180},
    result_backend_transport_options={"visibility_timeout": 180},
    task_default_queue="smc_analysis",
    task_queues=(Queue("smc_analysis"),),
    task_routes={"tasks.scan_market_smc": {"queue": "smc_analysis"}},
    task_ignore_result=False,
)

# Celery CLI compatibility: "celery -A tasks worker ..." discovers app.
app = celery_app
