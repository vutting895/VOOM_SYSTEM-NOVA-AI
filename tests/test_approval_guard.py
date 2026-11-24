from __future__ import annotations

import json

import httpx
import pytest

from integrations.notifications.approval_guard import ApprovalGuard, proposal_hash


def _guard(handler):
    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    return ApprovalGuard(
        supabase_url="https://example.supabase.co",
        publishable_key="sb_publishable_test_key",
        client=client,
    ), client


def test_create_forwards_user_bearer_and_publishable_key_only():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = request.headers
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "approval-1", "status": "pending"})

    guard, client = _guard(handler)
    try:
        proposal = {"symbol": "XAUUSDm", "side": "buy"}
        result = guard.create(
            thread_id="thread-1",
            proposal=proposal,
            access_token="user-access-token",
            expires_in_minutes=5,
        )
    finally:
        client.close()

    assert result["id"] == "approval-1"
    assert captured["url"] == "https://example.supabase.co/rest/v1/rpc/nova_create_approval"
    assert captured["headers"]["authorization"] == "Bearer user-access-token"
    assert captured["headers"]["apikey"] == "sb_publishable_test_key"
    assert "service_role" not in captured["headers"]["apikey"].lower()
    assert captured["body"]["p_thread_id"] == "thread-1"
    assert captured["body"]["p_proposal"] == proposal
    assert captured["body"]["p_proposal_hash"] == proposal_hash(proposal)
    assert captured["body"]["p_policy_version"] == "nova-approval.v1"


@pytest.mark.parametrize("token", ["", "token with whitespace"])
def test_rpc_rejects_invalid_user_access_token_before_network(token):
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    guard, client = _guard(handler)
    try:
        with pytest.raises(PermissionError):
            guard._rpc("nova_create_approval", {}, token)
    finally:
        client.close()

    assert called is False


def test_rpc_rejects_redirect_without_following_it():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "https://attacker.example/collect"})

    guard, client = _guard(handler)
    try:
        with pytest.raises(RuntimeError, match="redirect rejected"):
            guard._rpc("nova_create_approval", {}, "user-access-token")
    finally:
        client.close()


def test_rpc_suppresses_upstream_http_error_details():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "sensitive upstream detail"})

    guard, client = _guard(handler)
    try:
        with pytest.raises(RuntimeError, match="details suppressed") as error:
            guard._rpc("nova_create_approval", {}, "user-access-token")
    finally:
        client.close()

    assert "sensitive upstream detail" not in str(error.value)
