"""Authentication contract tests for the NOVA research worker."""
import httpx
from fastapi.testclient import TestClient

from workers import runtime


class StubAsyncClient:
    response_status = 200
    response_body = {"id": "user-test-123"}
    should_raise = False
    last_headers = None

    def __init__(self, *, timeout, follow_redirects):
        assert timeout == 5.0
        assert follow_redirects is False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, *, headers):
        assert url == "https://nova-test.supabase.co/auth/v1/user"
        type(self).last_headers = headers
        if type(self).should_raise:
            raise httpx.ConnectError("test connection failure")
        return httpx.Response(type(self).response_status, json=type(self).response_body)


def configure_auth(monkeypatch, *, status=200, body=None, should_raise=False):
    monkeypatch.setenv("SUPABASE_URL", "https://nova-test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    StubAsyncClient.response_status = status
    StubAsyncClient.response_body = body if body is not None else {"id": "user-test-123"}
    StubAsyncClient.should_raise = should_raise
    StubAsyncClient.last_headers = None
    monkeypatch.setattr(runtime.httpx, "AsyncClient", StubAsyncClient)


def test_health_is_public_and_reports_execution_disabled(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    with TestClient(runtime.app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["orders_enabled"] is False
    assert response.json()["live_trading_enabled"] is False


def test_research_api_rejects_missing_bearer_token():
    with TestClient(runtime.app) as client:
        response = client.post("/v1/smc/analyze", json={})
    assert response.status_code == 401
    assert response.json()["detail"] == "authenticated_user_token_required"


def test_research_api_rejects_expired_session(monkeypatch):
    configure_auth(monkeypatch, status=401, body={"message": "invalid token"})
    with TestClient(runtime.app) as client:
        response = client.get("/openapi.json", headers={"Authorization": "Bearer expired-token"})
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_or_expired_session"


def test_research_api_allows_supabase_verified_user(monkeypatch):
    configure_auth(monkeypatch)
    with TestClient(runtime.app) as client:
        response = client.get("/openapi.json", headers={"Authorization": "Bearer valid-token"})
    assert response.status_code == 200
    assert StubAsyncClient.last_headers["Authorization"] == "Bearer valid-token"


def test_research_api_fails_closed_when_supabase_is_unavailable(monkeypatch):
    configure_auth(monkeypatch, should_raise=True)
    with TestClient(runtime.app) as client:
        response = client.get("/openapi.json", headers={"Authorization": "Bearer valid-token"})
    assert response.status_code == 503
    assert response.json()["detail"] == "authentication_service_unavailable"


def test_research_api_fails_closed_when_auth_config_is_missing(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    with TestClient(runtime.app) as client:
        response = client.get("/openapi.json", headers={"Authorization": "Bearer valid-token"})
    assert response.status_code == 503
    assert response.json()["detail"] == "authentication_service_not_configured"
