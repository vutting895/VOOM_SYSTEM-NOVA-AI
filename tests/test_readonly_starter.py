"""Regression tests for NOVA read-only starter contracts."""
import importlib.util
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from workers.jobs.runner import (
    RetryPolicy, evaluate_freshness, mask_sensitive_context, run_with_retry,
)
from workers.schemas import ConnectionReadinessState, InferenceReport, ModelMetadata, PredictionPayload
from integrations.notifications.approval_guard import ApprovalGuard, POLICY_VERSION


ROOT = Path(__file__).resolve().parents[1]
ROUTER_PATH = ROOT / "integrations" / "mt5-relay" / "tenant_router.py"
spec = importlib.util.spec_from_file_location("nova_mt5_tenant_router", ROUTER_PATH)
router = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = router
spec.loader.exec_module(router)


class StarterContractTests(unittest.TestCase):
    def test_inference_contract_is_read_only(self):
        report = InferenceReport(readiness=ConnectionReadinessState.configured)
        self.assertEqual(report.schema_version, "nova.inference.v1")
        self.assertFalse(report.executionEnabled)
        self.assertFalse(report.liveTradingEnabled)
        with self.assertRaises(Exception):
            InferenceReport(executionEnabled=True)

    def test_prediction_metadata_contract(self):
        model = ModelMetadata(model_id="research", version="1")
        prediction = PredictionPayload(model=model, symbol="XAUUSD")
        self.assertEqual(prediction.symbol, "XAUUSD")

    def test_secret_masking_redacts_nested_values_and_bearers(self):
        masked = mask_sensitive_context({
            "access_token": "hidden",
            "context": "Authorization: Bearer abc.def.ghi password=hunter2",
            "safe": "read-only",
        })
        self.assertEqual(masked["access_token"], "[REDACTED]")
        self.assertNotIn("abc.def.ghi", masked["context"])
        self.assertNotIn("hunter2", masked["context"])
        self.assertEqual(masked["safe"], "read-only")

    def test_freshness_requires_aware_timestamps(self):
        now = datetime.now(timezone.utc)
        self.assertEqual(evaluate_freshness(now, max_age_seconds=5, now=now), "fresh")
        self.assertEqual(evaluate_freshness(now - timedelta(seconds=10),
                                           max_age_seconds=5, now=now), "stale")
        with self.assertRaises(ValueError):
            evaluate_freshness(datetime.now(), max_age_seconds=5, now=now)

    def test_retry_is_bounded_and_uses_backoff(self):
        calls, sleeps = [], []
        def flaky():
            calls.append(1)
            if len(calls) < 3:
                raise ValueError("sensitive exception must not escape")
            return "ok"
        result = run_with_retry(flaky, timeout_seconds=1,
                                policy=RetryPolicy(max_attempts=3, base_delay_seconds=0.1),
                                sleep=sleeps.append, random_uniform=lambda a, b: 0)
        self.assertEqual(result, "ok")
        self.assertEqual(len(calls), 3)
        self.assertEqual(sleeps, [0.1, 0.2])

    def test_timeout_is_not_retried(self):
        calls = []
        def slow():
            calls.append(1)
            import time
            time.sleep(0.15)
        with self.assertRaises(TimeoutError):
            run_with_retry(slow, timeout_seconds=0.01,
                           policy=RetryPolicy(max_attempts=3), sleep=lambda _: None)
        self.assertEqual(len(calls), 1)

    def test_tenant_router_requires_user_and_connection_pair(self):
        route = router.TenantRoute("user-A", "connection-A", "bridge-A",
                                   frozenset({"health.read", "quotes.read"}))
        registry = router.TenantRouteRegistry({("user-A", "connection-A"): route})
        self.assertEqual(registry.resolve(authenticated_user_id="user-A",
                                          connection_id="connection-A"), route)
        with self.assertRaises(PermissionError):
            registry.resolve(authenticated_user_id="user-B", connection_id="connection-A")
        with self.assertRaises(PermissionError):
            registry.resolve(authenticated_user_id="user-A", connection_id="")

    def test_tenant_router_rejects_any_write_capability(self):
        route = router.TenantRoute("user-A", "connection-A", "bridge-A",
                                   frozenset({"quotes.read", "orders.write"}))
        registry = router.TenantRouteRegistry({("user-A", "connection-A"): route})
        with self.assertRaises(PermissionError):
            registry.resolve(authenticated_user_id="user-A", connection_id="connection-A")

    def test_readiness_fails_closed_without_verified_fresh_data(self):
        self.assertEqual(router.evaluate_bridge_readiness(configured=False),
                         router.BridgeReadiness.unavailable)
        self.assertEqual(router.evaluate_bridge_readiness(configured=True, reachable=True),
                         router.BridgeReadiness.reachable)
        self.assertEqual(router.evaluate_bridge_readiness(
            configured=True, reachable=True, authenticated=True, data_verified=True),
            router.BridgeReadiness.incomplete)

    def test_approval_client_uses_durable_owner_scoped_rpc(self):
        import httpx
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(200, json=[{"id": "approval-id", "status": "pending"}])
        client = httpx.Client(transport=httpx.MockTransport(handler))
        guard = ApprovalGuard(supabase_url="https://project.supabase.co",
                              publishable_key="public-key", client=client)
        proposal = {"title": "Draft", "summary": "Research only", "market": "XAU/USD",
                    "timeframe": "1h", "riskProfile": "low"}
        guard.create(thread_id="thread-id", proposal=proposal, access_token="user.jwt.token")
        import json
        body = json.loads(requests[0].content)
        self.assertEqual(body["p_request_type"], "strategy_draft_review")
        self.assertEqual(body["p_policy_version"], POLICY_VERSION)
        self.assertEqual(requests[0].url.path, "/rest/v1/rpc/nova_create_approval")
        self.assertEqual(requests[0].headers["Authorization"], "Bearer user.jwt.token")
        self.assertEqual(requests[0].headers["apikey"], "public-key")
        client.close()

    def test_research_worker_approval_route_is_disabled_by_default(self):
        runtime_source = (ROOT / "workers" / "runtime.py").read_text(encoding="utf-8")
        self.assertIn('os.getenv("NOVA_APPROVALS_ENABLED", "false").lower() != "true"', runtime_source)
        self.assertIn('detail="approval_workflow_disabled"', runtime_source)

    def test_approval_client_never_accepts_execution_decisions(self):
        guard = ApprovalGuard(supabase_url="https://project.supabase.co",
                              publishable_key="public-key")
        with self.assertRaises(ValueError):
            guard.decide(approval_id="id", decision="execute", access_token="user.jwt.token")


if __name__ == "__main__":
    unittest.main()
