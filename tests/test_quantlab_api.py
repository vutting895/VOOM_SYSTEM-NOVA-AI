from __future__ import annotations

import httpx
import pytest
import sqlite3
from fastapi import FastAPI
from fastapi.testclient import TestClient

from workers.quantlab_api import router


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("QUANTLAB_DB_PATH", str(tmp_path / "quantlab.sqlite3"))
    monkeypatch.setenv("SUPABASE_URL", "https://supabase.example")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-test-key")
    monkeypatch.setenv("QUANTLAB_DISPATCHER_TOKEN", "dispatcher-test-token")

    def fake_get(url, *, headers, timeout, follow_redirects):
        assert str(url) == "https://supabase.example/auth/v1/user"
        assert headers["apikey"] == "public-test-key"
        token = headers["Authorization"].removeprefix("Bearer ")
        if token == "valid-user-a":
            return httpx.Response(200, json={"id": "user-a"})
        if token == "valid-user-b":
            return httpx.Response(200, json={"id": "user-b"})
        return httpx.Response(401, json={"message": "invalid"})

    monkeypatch.setattr(httpx, "get", fake_get)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def create_payload(**overrides):
    value = {
        "job_type": "backtest",
        "resource_profile": "free-cpu",
        "timeout_seconds": 600,
        "experiment": {"schema_version": "nova.quant-experiment.v1", "experiment_id": "exp-1"},
    }
    value.update(overrides)
    return value


def test_user_auth_required_and_supabase_session_is_revalidated(client):
    response = client.get("/v1/jobs")
    assert response.status_code == 401
    invalid = client.get("/v1/jobs", headers={"Authorization": "Bearer invalid"})
    assert invalid.status_code == 401
    valid = client.get("/v1/jobs", headers={"Authorization": "Bearer valid-user-a"})
    assert valid.status_code == 200


def test_create_is_idempotent_and_does_not_accept_tenant_identity(client):
    headers = {
        "Authorization": "Bearer valid-user-a",
        "Idempotency-Key": "idem-key-12345678",
    }
    created = client.post("/v1/jobs", headers=headers, json=create_payload())
    replay = client.post("/v1/jobs", headers=headers, json=create_payload())
    assert created.status_code == 202
    assert replay.status_code == 202
    assert created.json()["job"]["job_id"] == replay.json()["job"]["job_id"]
    assert replay.json()["replayed"] is True
    assert created.json()["job"]["state"] == "QUEUED"
    assert created.json()["ordersEnabled"] is False
    assert "tenant_id" not in created.json()["job"]

    conflict = client.post("/v1/jobs", headers=headers, json=create_payload(timeout_seconds=500))
    assert conflict.status_code == 409


def test_job_and_events_are_isolated_per_authenticated_user(client):
    headers_a = {"Authorization": "Bearer valid-user-a", "Idempotency-Key": "idem-key-12345678"}
    headers_b = {"Authorization": "Bearer valid-user-b"}
    created = client.post("/v1/jobs", headers=headers_a, json=create_payload())
    job_id = created.json()["job"]["job_id"]
    own = client.get(f"/v1/jobs/{job_id}", headers={"Authorization": "Bearer valid-user-a"})
    other = client.get(f"/v1/jobs/{job_id}", headers=headers_b)
    events = client.get(f"/v1/jobs/{job_id}/events", headers={"Authorization": "Bearer valid-user-a"})
    assert own.status_code == 200
    assert own.json()["job"]["job_id"] == job_id
    assert other.status_code == 404
    assert events.status_code == 200
    assert [event["to_state"] for event in events.json()["events"]] == ["QUEUED"]


def test_dispatcher_claim_heartbeat_and_finish_require_private_token(client):
    headers = {"Authorization": "Bearer valid-user-a", "Idempotency-Key": "idem-key-12345678"}
    created = client.post("/v1/jobs", headers=headers, json=create_payload())
    job_id = created.json()["job"]["job_id"]

    denied = client.post("/v1/internal/leases/claim", json={"worker_id": "worker-01"})
    assert denied.status_code == 401

    internal = {"X-QuantLab-Dispatcher-Token": "dispatcher-test-token"}
    claim = client.post("/v1/internal/leases/claim", headers=internal, json={"worker_id": "worker-01"})
    assert claim.status_code == 200
    lease = claim.json()["claim"]
    assert lease["job"]["job_id"] == job_id
    assert lease["job"]["tenant_id"] == "user-a"
    assert lease["payload"]["job_type"] == "backtest"

    heartbeat = client.post(
        f"/v1/internal/leases/{job_id}/heartbeat", headers=internal,
        json={"worker_id": "worker-01", "lease_token": lease["lease_token"], "lease_seconds": 30},
    )
    assert heartbeat.status_code == 200

    finished = client.post(
        f"/v1/internal/leases/{job_id}/finish", headers=internal,
        json={"worker_id": "worker-01", "lease_token": lease["lease_token"], "state": "SUCCEEDED"},
    )
    assert finished.status_code == 200
    assert finished.json()["job"]["state"] == "SUCCEEDED"

    events = client.get(f"/v1/jobs/{job_id}/events", headers=headers)
    assert [event["to_state"] for event in events.json()["events"]] == ["QUEUED", "RUNNING", "SUCCEEDED"]


def test_invalid_payload_and_dispatcher_lease_cannot_be_reused(client):
    headers = {"Authorization": "Bearer valid-user-a", "Idempotency-Key": "idem-key-12345678"}
    invalid = client.post("/v1/jobs", headers=headers, json=create_payload(job_type="place_order"))
    assert invalid.status_code == 400

    client.post("/v1/jobs", headers=headers, json=create_payload())
    internal = {"X-QuantLab-Dispatcher-Token": "dispatcher-test-token"}
    lease = client.post("/v1/internal/leases/claim", headers=internal,
                        json={"worker_id": "worker-01"}).json()["claim"]
    job_id = lease["job"]["job_id"]
    finish = client.post(
        f"/v1/internal/leases/{job_id}/finish", headers=internal,
        json={"worker_id": "worker-01", "lease_token": lease["lease_token"], "state": "SUCCEEDED"},
    )
    assert finish.status_code == 200
    replay = client.post(
        f"/v1/internal/leases/{job_id}/finish", headers=internal,
        json={"worker_id": "worker-01", "lease_token": lease["lease_token"], "state": "SUCCEEDED"},
    )
    assert replay.status_code == 409



def test_expired_leases_requeue_and_stop_after_three_claim_attempts(client, tmp_path, monkeypatch):
    headers = {"Authorization": "Bearer valid-user-a", "Idempotency-Key": "idem-key-12345678"}
    created = client.post("/v1/jobs", headers=headers, json=create_payload())
    job_id = created.json()["job"]["job_id"]
    internal = {"X-QuantLab-Dispatcher-Token": "dispatcher-test-token"}
    db_path = tmp_path / "quantlab.sqlite3"

    for expected_attempt in (1, 2, 3):
        claim_response = client.post("/v1/internal/leases/claim", headers=internal,
                                     json={"worker_id": f"worker-{expected_attempt}"})
        assert claim_response.status_code == 200
        claim = claim_response.json()["claim"]
        assert claim["job"]["attempt_count"] == expected_attempt
        with sqlite3.connect(db_path) as db:
            db.execute("UPDATE quantlab_jobs SET lease_expires_at=? WHERE job_id=?",
                       ("2000-01-01T00:00:00+00:00", job_id))

    # The next claim observes the third expired attempt and fails it closed.
    empty = client.post("/v1/internal/leases/claim", headers=internal, json={"worker_id": "worker-final"})
    assert empty.status_code == 200
    assert empty.json()["claim"] is None
    final = client.get(f"/v1/jobs/{job_id}", headers=headers)
    assert final.json()["job"]["state"] == "FAILED"
    assert final.json()["job"]["last_error_code"] == "lease_expired_max_attempts"


def test_worker_rejects_sensitive_and_oversized_experiment_payloads(client):
    headers = {"Authorization": "Bearer valid-user-a", "Idempotency-Key": "idem-key-12345678"}
    secret = client.post("/v1/jobs", headers=headers,
                         json=create_payload(experiment={"schema": "x", "account_id": "123"}))
    assert secret.status_code == 422
    oversized = client.post("/v1/jobs", headers=headers,
                            json=create_payload(experiment={"blob": "x" * 65000}))
    assert oversized.status_code == 422
