"""Static safety contract tests for the NOVA EA read-only telemetry bridge."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
EA = (ROOT / "integrations/mt5/NOVA_EA_v1.82_BRIDGE_READONLY.mq5").read_text(encoding="utf-8")
BRIDGE = (ROOT / "integrations/mt5/NOVA_EA_Bridge_v1.82.mqh").read_text(encoding="utf-8")
PY_BRIDGE = (ROOT / "integrations/mt5-readonly-bridge/bridge.py").read_text(encoding="utf-8")
RELAY = (ROOT / "integrations/mt5-bridge-relay/worker.js").read_text(encoding="utf-8")
CLIENT = (ROOT / "integrations/mt5-readonly-bridge/bridge_relay_client.py").read_text(encoding="utf-8")
PROXY = (ROOT / "integrations/mt5-readonly-proxy/worker.js").read_text(encoding="utf-8")


class NovaEABridgeTests(unittest.TestCase):
    def test_ea_heartbeat_is_timer_driven_every_two_seconds(self):
        self.assertIn("EventSetTimer(NOVA_EA_BRIDGE_INTERVAL_SEC)", EA)
        self.assertIn("void OnTimer()", EA)
        self.assertIn("#define NOVA_EA_BRIDGE_INTERVAL_SEC 2", BRIDGE)
        self.assertIn("NovaEABridgeHeartbeat(gNovaCoreDiagCandidates)", EA)

    def test_ea_uses_only_loopback_telemetry_endpoint(self):
        self.assertIn('http://127.0.0.1:8787/api/ea/heartbeat', BRIDGE)
        self.assertIn('WebRequest("POST",NOVA_EA_BRIDGE_URL', BRIDGE)
        self.assertNotIn("OrderSend(", BRIDGE)
        self.assertNotIn("CTrade", BRIDGE)
        self.assertNotIn("PositionClose", BRIDGE)

    def test_ea_telemetry_is_hard_coded_read_only(self):
        self.assertIn('"mode":"read-only"', BRIDGE)
        self.assertIn('"orders_enabled":false', BRIDGE)
        self.assertIn('"live_trading_enabled":false', BRIDGE)
        self.assertIn('NOVA_READ_ONLY_MODE true', EA)

    def test_private_token_is_not_embedded_in_ea_source(self):
        self.assertIn("NOVA_EA_BRIDGE_TOKEN_FILE", BRIDGE)
        self.assertIn("FILE_COMMON", BRIDGE)
        self.assertNotRegex(BRIDGE, r'(?i)(token|secret)\s*=\s*"[A-Za-z0-9_-]{40,}"')

    def test_cloud_path_only_exposes_authenticated_status_read(self):
        self.assertIn('"/api/ea/status"', RELAY)
        self.assertIn('"/api/ea/status"', CLIENT)
        self.assertIn('"/api/ea/status"', PROXY)
        self.assertIn('require_token(authorization, tenant_id)', PY_BRIDGE)

    def test_loopback_bridge_accepts_only_strict_telemetry_schema(self):
        for field in ("ea_id", "version", "symbol", "timeframe", "mode",
                      "orders_enabled", "live_trading_enabled",
                      "last_tick_utc", "last_bar_utc", "signal_count"):
            self.assertIn('"' + field + '"', PY_BRIDGE)
        self.assertIn('request.method == "POST" and request.url.path == "/api/ea/heartbeat"', PY_BRIDGE)
        self.assertIn('request.method not in {"GET", "OPTIONS"}', PY_BRIDGE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
