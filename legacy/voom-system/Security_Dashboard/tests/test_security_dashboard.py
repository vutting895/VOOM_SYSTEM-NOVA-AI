import hashlib
import json
import os
import secrets
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server

class SecurityDashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_port = server.PORT
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        server.PORT = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{server.PORT}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        server.PORT = cls.old_port

    def test_catalog_fails_safe(self):
        data=server.load_catalog()
        self.assertIn("modules",data)
        self.assertFalse(data["production_changes_enabled"])

    def test_controls_not_marked_verified(self):
        controls=server.load_controls()
        self.assertTrue(controls)
        self.assertTrue(all(c["status"]=="not_tested" for c in controls))

    def test_valid_finding_is_candidate(self):
        f=server.validate_finding({"title":"Missing authorization on staging endpoint","summary":"Authorized staging test showed an endpoint returned data without expected session.","asset":"staging API","severity":"high","source_url":"https://docs.example.org/security","proposed_remediation":"Add server-side authorization and regression tests."})
        self.assertEqual(f["status"],"review_required")
        self.assertFalse(f["production_change_permitted"])
        self.assertTrue(f["approval_required"])

    def test_rejects_secret_like_content(self):
        with self.assertRaises(ValueError):
            server.validate_finding({"title":"Leaked token","summary":"api_key=exampleSecretValue123","severity":"high"})

    def test_rejects_invalid_source_scheme(self):
        with self.assertRaises(ValueError):
            server.validate_finding({"title":"Finding","summary":"An observation","source_url":"javascript:alert(1)"})

    def test_rejects_unknown_severity(self):
        with self.assertRaises(ValueError):
            server.validate_finding({"title":"Finding","summary":"An observation","severity":"world-ending"})

    def test_role_permissions_are_least_privilege(self):
        self.assertTrue(server.has_permission({"role":"admin"}, "view_audit"))
        self.assertTrue(server.has_permission({"role":"security_analyst"}, "submit_finding"))
        self.assertFalse(server.has_permission({"role":"security_analyst"}, "view_audit"))
        self.assertFalse(server.has_permission({"role":"auditor"}, "submit_finding"))
        self.assertFalse(server.has_permission({"role":"unknown"}, "read"))

    def test_scrypt_password_verification(self):
        password="example-only-test-password"
        salt=secrets.token_bytes(16)
        digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1,dklen=32).hex()
        auth={"salt":salt.hex(),"password_hash":digest}
        self.assertTrue(server.verify_password(password,auth))
        self.assertFalse(server.verify_password("wrong-password",auth))

    def test_dashboard_redirects_unauthenticated_user_to_login(self):
        from urllib.request import build_opener, HTTPRedirectHandler
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener=build_opener(NoRedirect)
        request=Request(self.base+"/",headers={"Host":f"127.0.0.1:{server.PORT}"})
        with self.assertRaises(HTTPError) as cm:
            opener.open(request)
        self.assertEqual(cm.exception.code,303)
        self.assertEqual(cm.exception.headers.get("Location"),"/login")

    def test_private_api_rejects_unauthenticated_user(self):
        request=Request(self.base+"/api/status",headers={"Host":f"127.0.0.1:{server.PORT}"})
        with self.assertRaises(HTTPError) as cm:
            urlopen(request)
        self.assertEqual(cm.exception.code,401)
        self.assertEqual(json.loads(cm.exception.read()),{"error":"admin_login_required"})

    def test_mutation_rejects_unauthenticated_user(self):
        request=Request(self.base+"/api/findings",data=b'{"title":"test","summary":"test"}',method="POST",
                        headers={"Host":f"127.0.0.1:{server.PORT}","Content-Type":"application/json"})
        with self.assertRaises(HTTPError) as cm:
            urlopen(request)
        self.assertEqual(cm.exception.code,401)

    def test_invalid_host_is_rejected(self):
        request=Request(self.base+"/api/health",headers={"Host":"evil.example"})
        with self.assertRaises(HTTPError) as cm:
            urlopen(request)
        self.assertEqual(cm.exception.code,400)

    def test_login_csrf_logout_and_audit_flow(self):
        old_auth, old_audit = server.AUTH_FILE, server.AUDIT_FILE
        with tempfile.TemporaryDirectory() as tmp:
            server.AUTH_FILE = Path(tmp) / "admin_auth.json"
            server.AUDIT_FILE = Path(tmp) / "admin_audit.jsonl"
            password = "test-only-password-12345"
            salt = secrets.token_bytes(16)
            digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32).hex()
            server.AUTH_FILE.write_text(json.dumps({"username":"admin","salt":salt.hex(),"password_hash":digest}), encoding="utf-8")
            try:
                payload=json.dumps({"username":"admin","password":password}).encode()
                req=Request(self.base+"/api/login",data=payload,method="POST",headers={"Host":f"127.0.0.1:{server.PORT}","Content-Type":"application/json","Origin":self.base})
                with urlopen(req) as response:
                    data=json.loads(response.read())
                    cookie=response.headers["Set-Cookie"].split(";",1)[0]
                    self.assertIn("HttpOnly",response.headers["Set-Cookie"])
                self.assertTrue(data["ok"])
                csrf=data["csrf"]
                status_req=Request(self.base+"/api/status",headers={"Host":f"127.0.0.1:{server.PORT}","Cookie":cookie})
                with urlopen(status_req) as response:
                    self.assertTrue(json.loads(response.read())["ok"])
                bad=Request(self.base+"/api/logout",data=b"{}",method="POST",headers={"Host":f"127.0.0.1:{server.PORT}","Cookie":cookie,"Content-Type":"application/json","Origin":self.base})
                with self.assertRaises(HTTPError) as cm:
                    urlopen(bad)
                self.assertEqual(cm.exception.code,403)
                good=Request(self.base+"/api/logout",data=b"{}",method="POST",headers={"Host":f"127.0.0.1:{server.PORT}","Cookie":cookie,"Content-Type":"application/json","Origin":self.base,"X-CSRF-Token":csrf})
                with urlopen(good) as response:
                    self.assertTrue(json.loads(response.read())["ok"])
                audit=server.AUDIT_FILE.read_text(encoding="utf-8")
                self.assertIn("login",audit)
                self.assertIn("logout",audit)
                self.assertNotIn(password,audit)
            finally:
                server.AUTH_FILE, server.AUDIT_FILE = old_auth, old_audit

if __name__=="__main__": unittest.main()
