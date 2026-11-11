"""Static contract tests for the tenant-isolated, read-only Windows MT5 bridge.

These tests intentionally do not import MetaTrader5 or connect to a terminal.
"""
import ast
import re
import unittest
from pathlib import Path

BRIDGE_PATH = Path(__file__).with_name("bridge.py")
SOURCE = BRIDGE_PATH.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE, filename=str(BRIDGE_PATH))
LAUNCHER = Path(__file__).with_name("run-bridge.ps1").read_text(encoding="utf-8")
RELAY_CLIENT = Path(__file__).with_name("bridge_relay_client.py").read_text(encoding="utf-8")


def called_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def function_nodes():
    return {node.name: node for node in TREE.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}


def has_call(function, name, expected_args=None):
    for node in ast.walk(function):
        if isinstance(node, ast.Call) and called_name(node.func) == name:
            if expected_args is None:
                return True
            names = [arg.id if isinstance(arg, ast.Name) else None for arg in node.args]
            if names[:len(expected_args)] == expected_args:
                return True
    return False


class TenantGuardContractTests(unittest.TestCase):
    def test_tenant_id_is_read_from_environment(self):
        self.assertIn('os.environ.get("MT5_TENANT_ID", "")', SOURCE)

    def test_tenant_guard_uses_constant_time_comparison(self):
        functions = function_nodes()
        guard = functions["require_token"]
        self.assertTrue(has_call(guard, "compare_digest", ["tenant_id", "TENANT_ID"]))
        self.assertRegex(SOURCE, r"MT5_TENANT_ID")
        self.assertRegex(SOURCE, r"status_code\s*=\s*503")
        self.assertRegex(SOURCE, r"status_code\s*=\s*403")
        self.assertRegex(SOURCE, r"status_code\s*=\s*401")

    def test_missing_or_invalid_bearer_is_rejected_before_tenant_mismatch(self):
        guard_start = SOURCE.index("def require_token(")
        guard_end = SOURCE.index("def initialize_mt5", guard_start)
        guard_source = SOURCE[guard_start:guard_end]
        self.assertLess(guard_source.index("if not authorization"), guard_source.index("if not tenant_id"))
        self.assertLess(guard_source.index("hmac.compare_digest(supplied, BRIDGE_TOKEN)"), guard_source.index("if not tenant_id"))
        self.assertIn('status_code=401, detail="Missing bearer token"', guard_source)
        self.assertIn('status_code=401, detail="Invalid bearer token"', guard_source)
        self.assertIn('status_code=403, detail="Bridge tenant mismatch"', guard_source)

    def test_every_private_read_endpoint_checks_bearer_and_tenant(self):
        functions = function_nodes()
        for name in ("health", "account_summary", "account_exposure", "symbols", "quotes"):
            with self.subTest(endpoint=name):
                function = functions[name]
                args = {arg.arg for arg in function.args.args + function.args.kwonlyargs}
                self.assertIn("authorization", args)
                self.assertIn("tenant_id", args)
                self.assertTrue(has_call(function, "require_token", ["authorization", "tenant_id"]))

    def test_exposure_endpoint_is_read_only_and_counts_all_account_positions_and_orders(self):
        functions = function_nodes()
        exposure = functions["account_exposure"]
        self.assertTrue(has_call(exposure, "positions_get"))
        self.assertTrue(has_call(exposure, "orders_get"))
        source = ast.get_source_segment(SOURCE, exposure)
        self.assertIn('"open_positions": len(position_tickets)', source)
        self.assertIn('"open_pending_orders": len(pending_tickets)', source)
        self.assertIn('"position_tickets": position_tickets', source)
        self.assertIn('"pending_order_tickets": pending_tickets', source)
        self.assertIn('"order_submission_enabled": False', source)
        self.assertIn('"liveTradingEnabled": False', source)
        self.assertIn('"ordersEnabled": False', source)

    def test_tenant_header_is_allowed_by_cors(self):
        self.assertIn('"X-VOOM-TENANT-ID"', SOURCE)
        self.assertRegex(SOURCE, r"allow_methods\s*=\s*\[\s*['\"]GET['\"],\s*['\"]OPTIONS['\"]")

    def test_read_only_middleware_rejects_mutating_methods_and_order_paths(self):
        self.assertIn('request.method not in {"GET", "OPTIONS"}', SOURCE)
        self.assertRegex(SOURCE, r"orders\?\|trades\?\|execute\|withdraw\|transfer")

    def test_no_order_submission_endpoint_is_registered(self):
        registered_paths = []
        for node in TREE.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call) and called_name(decorator.func) in {"get", "post", "put", "patch", "delete"}:
                    if decorator.args and isinstance(decorator.args[0], ast.Constant) and isinstance(decorator.args[0].value, str):
                        registered_paths.append(decorator.args[0].value)
        self.assertFalse(any(re.search(r"/(orders?|trades?|execute|withdraw|transfer)(/|$)", p, re.I) for p in registered_paths))

    def test_launcher_uses_the_documented_isolated_virtual_environment(self):
        self.assertIn("'.venv\\Scripts\\python.exe'", LAUNCHER)
        self.assertIn("& $python bridge_relay_client.py", LAUNCHER)
        self.assertNotIn("cloudflared", LAUNCHER.lower())
        self.assertNotIn("voom.ai", LAUNCHER.lower())
        self.assertNotIn("C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python311\\python.exe", LAUNCHER)

    def test_exposure_snapshot_is_allowed_through_the_authenticated_read_only_relay(self):
        self.assertIn('"/api/exposure"', RELAY_CLIENT)
        self.assertIn('"/api/exposure"', SOURCE)
        self.assertIn('"/api/exposure"', Path(__file__).with_name("README.md").read_text(encoding="utf-8"))

    def test_outbound_relay_uses_stable_workers_dev_and_no_custom_domain(self):
        self.assertIn("wss://voom-mt5-bridge-relay.suwapat787.workers.dev/connect", RELAY_CLIENT)
        self.assertNotIn("voom.ai", RELAY_CLIENT.lower())
        self.assertIn("X-VOOM-TENANT-ID", RELAY_CLIENT)
        self.assertIn("Authorization", RELAY_CLIENT)
        self.assertIn('method="GET"', RELAY_CLIENT)
        self.assertNotIn('"/api/orders"', RELAY_CLIENT)
        self.assertIn("127.0.0.1:8787", RELAY_CLIENT)


if __name__ == "__main__":
    unittest.main()
