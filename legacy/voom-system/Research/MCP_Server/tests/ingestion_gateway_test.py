"""Local-only integration tests for the authenticated consent ingestion gateway."""
import json, os, sys, threading, unittest, urllib.error, urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ingestion_gateway

class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = "test-token-" + ("x" * 40)
        cls.env = patch.dict(os.environ, {ingestion_gateway.TOKEN_ENV: cls.token})
        cls.env.start()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ingestion_gateway.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.env.stop()

    def request(self, path, payload=None, token=None):
        data = None if payload is None else json.dumps(payload).encode()
        headers = {}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if token is not None:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=2) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as exc:
            try:
                return exc.code, json.loads(exc.read())
            finally:
                exc.close()

    def test_health_is_non_sensitive(self):
        status, body = self.request("/health")
        self.assertEqual(status, 200)
        self.assertFalse(body["raw_transcripts_saved"])

    def test_wrong_token_denied(self):
        status, body = self.request("/ingest", {"consent_confirmed": True}, "wrong-token")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "unauthorized")

    def test_consent_is_mandatory(self):
        status, body = self.request("/ingest", {"consent_confirmed": False}, self.token)
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "explicit_consent_required")

    def test_valid_consent_forwards_only_to_learning_pipeline(self):
        payload = {"conversation_id": "test-conversation", "consent_confirmed": True,
                   "messages": [{"role": "user", "content": "Question for research?"}]}
        with patch.object(ingestion_gateway.learning_store, "ingest_conversation",
                          return_value={"ok": True, "raw_transcript_saved": False}) as ingest:
            status, body = self.request("/ingest", payload, self.token)
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertTrue(ingest.called)
        self.assertTrue(ingest.call_args.kwargs["consent_confirmed"])

    def test_unknown_path_denied(self):
        status, body = self.request("/anything", {"x": 1}, self.token)
        self.assertEqual(status, 404)

if __name__ == "__main__":
    unittest.main(verbosity=2)
