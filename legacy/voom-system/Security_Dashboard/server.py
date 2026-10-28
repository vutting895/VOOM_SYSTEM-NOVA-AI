# -*- coding: utf-8 -*-
"""Local-only VOOM Admin Security Dashboard with server-side auth and audit."""
from __future__ import annotations
import hashlib, hmac, json, os, re, secrets, time, getpass, subprocess
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_ROOT = Path(__file__).resolve().parent
SECURITY_ROOT = PROJECT_ROOT / "Research" / "การป้องกันความปลอดภัยระบบ"
INCOMING = SECURITY_ROOT / "_incoming"
HOST = "127.0.0.1"
PORT = int(os.environ.get("VOOM_SECURITY_DASHBOARD_PORT", "8765"))
MAX_BODY = 16384
SESSION_TTL = 30 * 60
SEVERITIES = {"informational", "low", "medium", "high", "critical"}
ROLE_PERMISSIONS = {"admin": {"read", "submit_finding", "view_audit"}, "security_analyst": {"read", "submit_finding"}, "auditor": {"read", "view_audit"}}
AUTH_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Voom_system" / "SecurityDashboard"
AUTH_FILE = AUTH_DIR / "admin_auth.json"
AUDIT_FILE = DASHBOARD_ROOT / "logs" / "admin_audit.jsonl"
SESSIONS: dict[str, dict] = {}
LOGIN_ATTEMPTS: dict[str, list[float]] = {}

def read_json(path, fallback):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError): return fallback

def load_auth():
    data = read_json(AUTH_FILE, None)
    if not isinstance(data, dict) or not all(k in data for k in ("username", "salt", "password_hash")):
        return None
    return data

def verify_password(password, auth):
    try:
        derived = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(auth["salt"]), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(derived.hex(), auth["password_hash"])
    except (ValueError, TypeError, KeyError):
        return False

def has_permission(session, permission):
    return permission in ROLE_PERMISSIONS.get(session.get("role", "admin"), set())

def audit(event, username="admin", outcome="success"):
    AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
    record = {"timestamp": datetime.now(timezone.utc).isoformat(), "event": event,
              "actor": username, "outcome": outcome, "source": "loopback"}
    with AUDIT_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

def load_catalog():
    data = read_json(SECURITY_ROOT / "catalog.json", {"modules": []})
    if not isinstance(data, dict) or not isinstance(data.get("modules"), list): return {"modules": []}
    modules = []
    for m in data["modules"]:
        if isinstance(m, dict):
            modules.append({k: m.get(k, default) for k, default in {
                "id": "", "name": "", "version": "", "status": "research",
                "description": "", "allowed_ai_use": [], "blocked_actions": [],
                "evidence": {}, "limitations": []}.items()})
    return {"name": data.get("name", "VOOM Security"), "modules": modules,
            "production_changes_enabled": False, "default_policy": "read_analyze_propose_only"}

def load_controls():
    path = SECURITY_ROOT / "CONTROLS" / "SECURITY_CONTROLS.md"
    try: content = path.read_text(encoding="utf-8")
    except OSError: return []
    return [{"label": m.group(2), "status": "not_tested"}
            for line in content.splitlines()
            if (m := re.match(r"^\s*- \[([ xX])\]\s+(.+?)\s*$", line))]

def load_findings():
    INCOMING.mkdir(parents=True, exist_ok=True)
    out = []
    for path in sorted(INCOMING.glob("SEC-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:100]:
        item = read_json(path, None)
        if isinstance(item, dict):
            out.append({k: item.get(k) for k in ("id","title","severity","status","asset","created_at","source_url","summary","proposed_remediation")})
    return out

def validate_finding(payload):
    if not isinstance(payload, dict): raise ValueError("JSON object required")
    title, summary = str(payload.get("title","")).strip(), str(payload.get("summary","")).strip()
    asset, source = str(payload.get("asset","")).strip(), str(payload.get("source_url","")).strip()
    severity = str(payload.get("severity","medium")).lower().strip()
    remediation = str(payload.get("proposed_remediation","")).strip()
    if not title or len(title)>180: raise ValueError("title is required (max 180 characters)")
    if not summary or len(summary)>4000: raise ValueError("summary is required (max 4000 characters)")
    if len(asset)>180 or len(source)>500 or len(remediation)>3000: raise ValueError("field exceeds allowed length")
    if source and not (source.startswith("https://") or source.startswith("http://")): raise ValueError("source_url must be an http(s) URL")
    if severity not in SEVERITIES: raise ValueError("invalid severity")
    combined = "\n".join([title, summary, asset, source, remediation])
    patterns = [r"(?i)(api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*\S+",
                r"(?i)Bearer\s+[A-Za-z0-9._~+/-]{12,}", r"\bsk-[A-Za-z0-9_-]{16,}\b"]
    if any(re.search(p, combined) for p in patterns): raise ValueError("possible secret detected; redact credentials before saving")
    now = datetime.now(timezone.utc)
    return {"id":"SEC-"+now.strftime("%Y%m%d-%H%M%S")+"-"+secrets.token_hex(3).upper(),
            "title":title,"summary":summary,"asset":asset,"source_url":source,"severity":severity,
            "status":"review_required","proposed_remediation":remediation,"created_at":now.isoformat(),
            "evidence_status":"unverified_candidate","approval_required":True,"production_change_permitted":False}

class Handler(BaseHTTPRequestHandler):
    server_version, sys_version = "VOOM-Admin-Security", ""
    def log_message(self, fmt, *args):
        # Do not log request bodies, cookies, authorization headers or query values.
        print("VOOM Admin Security: " + (fmt % args).split("?")[0][:120], flush=True)
    def send_json(self, status, value, extra_headers=None):
        body=json.dumps(value,ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.send_header("X-Frame-Options","DENY")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("Permissions-Policy","camera=(), microphone=(), geolocation=()")
        self.send_header("Cross-Origin-Resource-Policy","same-origin")
        if extra_headers:
            for k,v in extra_headers: self.send_header(k,v)
        self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def send_static(self, name, ctype):
        try: body=(DASHBOARD_ROOT/name).read_bytes()
        except OSError: self.send_json(404,{"error":"static_file_missing"}); return
        self.send_response(200); self.send_header("Content-Type",ctype); self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.send_header("X-Frame-Options","DENY"); self.send_header("Referrer-Policy","no-referrer")
        self.send_header("Permissions-Policy","camera=(), microphone=(), geolocation=()")
        self.send_header("Cross-Origin-Resource-Policy","same-origin")
        self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def valid_host(self):
        return self.headers.get("Host", "") in {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
    def session(self):
        cookie=SimpleCookie()
        try: cookie.load(self.headers.get("Cookie",""))
        except Exception: return None
        morsel=cookie.get("voom_admin_session")
        if not morsel: return None
        item=SESSIONS.get(morsel.value)
        if not item: return None
        if item["expires"] < time.time():
            SESSIONS.pop(morsel.value,None); return None
        item["expires"]=time.time()+SESSION_TTL
        return morsel.value, item
    def require_session(self, permission=None):
        sess=self.session()
        if not sess:
            self.send_json(401,{"error":"admin_login_required"}); return None
        if permission and not has_permission(sess[1], permission):
            self.send_json(403,{"error":"role_forbidden"}); return None
        return sess
    def origin_ok(self):
        origin=self.headers.get("Origin")
        return not origin or origin in {f"http://127.0.0.1:{PORT}",f"http://localhost:{PORT}"}
    def read_payload(self):
        try: length=int(self.headers.get("Content-Length","0"))
        except ValueError: raise ValueError("invalid_content_length")
        if length<=0 or length>MAX_BODY: raise ValueError("request_too_large_or_empty")
        if self.headers.get("Content-Type","").split(";",1)[0].strip().lower()!="application/json":
            raise ValueError("application_json_required")
        return json.loads(self.rfile.read(length).decode("utf-8"))
    def do_GET(self):
        if not self.valid_host(): self.send_json(400,{"error":"invalid_host"}); return
        path=urlparse(self.path).path
        if path in ("/login","/login.html"): self.send_static("login.html","text/html; charset=utf-8"); return
        if path=="/login.js": self.send_static("login.js","text/javascript; charset=utf-8"); return
        if path=="/api/health":
            self.send_json(200,{"ok":True,"service":"voom-security-dashboard","mode":"local-only"}); return
        if path=="/api/session":
            sess=self.session()
            if not sess: self.send_json(200,{"authenticated":False}); return
            self.send_json(200,{"authenticated":True,"username":sess[1]["username"],"role":sess[1].get("role","admin"),"csrf":sess[1]["csrf"]}); return
        if path in ("/","/index.html"):
            if not self.session():
                self.send_response(303); self.send_header("Location","/login"); self.send_header("Cache-Control","no-store"); self.end_headers(); return
            self.send_static("index.html","text/html; charset=utf-8"); return
        if path=="/app.js":
            if not self.session(): self.send_json(401,{"error":"admin_login_required"}); return
            self.send_static("app.js","text/javascript; charset=utf-8"); return
        if path.startswith("/api/"):
            permission = "view_audit" if path=="/api/audit" else "read"
            sess=self.require_session(permission)
            if not sess:return
            if path=="/api/audit":
                records=[]
                try:
                    for line in AUDIT_FILE.read_text(encoding="utf-8").splitlines()[-200:]:
                        item=json.loads(line)
                        if isinstance(item,dict): records.append({k:item.get(k) for k in ("timestamp","event","actor","outcome","source")})
                except (OSError,ValueError): pass
                self.send_json(200,{"events":records}); return
            if path=="/api/status":
                catalog=load_catalog(); db=PROJECT_ROOT/"Research"/"MCP_Server"/"data"/"semantic_index.db"
                self.send_json(200,{"ok":True,"service":"voom-security-dashboard","mode":"admin-review-only",
                    "module_count":len(catalog["modules"]),"control_count":len(load_controls()),"finding_count":len(load_findings()),
                    "semantic_index_present":db.is_file(),"production_changes_enabled":False,"mcp_http_connected":False,
                    "auth_event_source_connected":False,"account_monitoring_active":False,
                    "note":"Customer authentication event source is not integrated; no real account monitoring or enforcement is active."}); return
            if path=="/api/catalog": self.send_json(200,load_catalog()); return
            if path=="/api/controls": self.send_json(200,{"controls":load_controls()}); return
            if path=="/api/findings": self.send_json(200,{"findings":load_findings()}); return
        self.send_json(404,{"error":"not_found"})
    def do_POST(self):
        if not self.valid_host(): self.send_json(400,{"error":"invalid_host"}); return
        path=urlparse(self.path).path
        if path not in ("/api/login","/api/logout","/api/findings"):
            self.send_json(404,{"error":"not_found"}); return
        if not self.origin_ok(): self.send_json(403,{"error":"origin_not_allowed"}); return
        if path=="/api/login":
            ip=self.client_address[0]
            now=time.time(); attempts=[t for t in LOGIN_ATTEMPTS.get(ip,[]) if now-t<300]
            LOGIN_ATTEMPTS[ip]=attempts
            if len(attempts)>=5:
                audit("login","unknown","rate_limited"); self.send_json(429,{"error":"too_many_login_attempts"}); return
            try: payload=self.read_payload()
            except (ValueError,UnicodeDecodeError,json.JSONDecodeError): self.send_json(400,{"error":"invalid_login_request"}); return
            auth=load_auth()
            username=str(payload.get("username","")) if isinstance(payload,dict) else ""
            password=str(payload.get("password","")) if isinstance(payload,dict) else ""
            if not auth or not hmac.compare_digest(username, str(auth.get("username","")) ) or not verify_password(password,auth):
                attempts.append(now); LOGIN_ATTEMPTS[ip]=attempts; audit("login","unknown","failure")
                self.send_json(401,{"error":"invalid_credentials"}); return
            LOGIN_ATTEMPTS[ip]=[]
            sid=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(32)
            role=str(auth.get("role","admin"))
            if role not in ROLE_PERMISSIONS:
                self.send_json(403,{"error":"configured_role_invalid"}); return
            SESSIONS[sid]={"username":username,"role":role,"csrf":csrf,"expires":now+SESSION_TTL}
            audit("login",username,"success")
            self.send_json(200,{"ok":True,"username":username,"csrf":csrf},
                [("Set-Cookie",f"voom_admin_session={sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL}")]); return
        sess=self.require_session("submit_finding" if path=="/api/findings" else None)
        if not sess:return
        sid,item=sess
        if path=="/api/logout":
            if not hmac.compare_digest(self.headers.get("X-CSRF-Token",""),item["csrf"]):
                self.send_json(403,{"error":"csrf_failed"}); return
            SESSIONS.pop(sid,None); audit("logout",item["username"],"success")
            self.send_json(200,{"ok":True},[("Set-Cookie","voom_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")]); return
        if path=="/api/findings":
            if not hmac.compare_digest(self.headers.get("X-CSRF-Token",""),item["csrf"]):
                self.send_json(403,{"error":"csrf_failed"}); return
            try:
                payload=self.read_payload(); finding=validate_finding(payload)
                INCOMING.mkdir(parents=True,exist_ok=True)
                (INCOMING/(finding["id"]+".json")).write_text(json.dumps(finding,ensure_ascii=False,indent=2),encoding="utf-8")
            except (UnicodeDecodeError,json.JSONDecodeError): self.send_json(400,{"error":"invalid_json"}); return
            except ValueError as exc: self.send_json(400,{"error":str(exc)}); return
            except OSError: self.send_json(500,{"error":"could_not_save_finding"}); return
            audit("finding_candidate_created",item["username"],"success")
            self.send_json(201,{"ok":True,"finding":finding}); return
    def log_error(self, event, username="system"):
        try: audit(event,username,"error")
        except OSError: pass

def main():
    if not load_auth():
        raise SystemExit("ADMIN AUTH NOT CONFIGURED. Run: python setup_admin.py")
    INCOMING.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer((HOST,PORT),Handler)
    print(f"VOOM Admin Security Dashboard at http://{HOST}:{PORT} (loopback only)",flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__=="__main__": main()
