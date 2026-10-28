"""Local learning pipeline for VOOM Knowledge MCP. Stores candidates, not raw transcripts."""
from __future__ import annotations
import hashlib, json, re, sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SERVER_DIR = Path(__file__).resolve().parent
DB_PATH = SERVER_DIR / "data" / "learning.db"
PUBLISHED_DIR = SERVER_DIR.parent / "Learned_Knowledge"
MAX_MESSAGES, MAX_MESSAGE_CHARS, MAX_CANDIDATES_PER_INGEST = 200, 12000, 40
SENSITIVE_PATTERNS = [
    re.compile(r"(?i)\b(api[_ -]?key|access[_ -]?token|password|secret|private[_ -]?key)\s*[:=]\s*\S+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"(?i)\b\d{3}-\d{2}-\d{4}\b"),
    re.compile(r"(?i)\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b"),
]
EXPLICIT_MARKERS = ("decision:", "confirmed:", "lesson:", "rule:", "project fact:", "ข้อสรุป:", "ยืนยัน:", "บทเรียน:", "กฎ:", "ข้อกำหนด:")
EXPLICIT_PHRASES = ("we decided to", "we will use", "the project uses", "confirmed that", "our requirement is", "the system must", "the agreed rule is", "สรุปว่า", "เราจะใช้", "ระบบต้อง", "ตกลงให้")
RISK_TERMS = ("trade", "trading", "buy", "sell", "entry", "exit", "profit", "loss", "strategy", "signal", "lot size", "risk percentage", "forex", "gold", "xauusd", "eurusd", "กำไร", "ขาดทุน", "เทรด", "ซื้อ", "ขาย", "จุดเข้า", "จุดออก", "กลยุทธ์", "สัญญาณ", "ความเสี่ยง")

def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY, source_id_hash TEXT NOT NULL, received_at TEXT NOT NULL,
        message_count INTEGER NOT NULL, candidate_count INTEGER NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY, content TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
        source_id_hash TEXT NOT NULL, source_role TEXT NOT NULL, confidence REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review', created_at TEXT NOT NULL,
        published_path TEXT, reviewer_note TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS research_requests (
        id INTEGER PRIMARY KEY, query TEXT NOT NULL, source_id_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, result_note TEXT,
        UNIQUE(query, source_id_hash))""")
    conn.commit()
    return conn

def _now():
    return datetime.now(timezone.utc).isoformat()

def _contains_sensitive(text):
    return any(pattern.search(text) for pattern in SENSITIVE_PATTERNS)

def _extract_candidates(messages):
    found, seen = [], set()
    for item in messages:
        if not isinstance(item, dict): continue
        role = str(item.get("role", "unknown"))[:30].lower()
        content = item.get("content", "")
        if not isinstance(content, str): continue
        content = content[:MAX_MESSAGE_CHARS].strip()
        if not content or _contains_sensitive(content): continue
        for raw in re.split(r"[\r\n]+|(?<=[.!?。！？])\s+", content):
            sentence = re.sub(r"\s+", " ", raw).strip(" \t-*•")
            if len(sentence) < 18 or len(sentence) > 900: continue
            lower = sentence.lower()
            marker = next((m for m in EXPLICIT_MARKERS if lower.startswith(m.lower())), None)
            phrase = next((p for p in EXPLICIT_PHRASES if p in lower), None)
            if not marker and not phrase: continue
            if _contains_sensitive(sentence): continue
            normalized = sentence[len(marker):].strip(" :-") if marker else sentence
            if len(normalized) < 12: continue
            risky = any(term in normalized.lower() for term in RISK_TERMS)
            category = "trading_hypothesis" if risky else "project_decision"
            explicit_user_marker = role == "user" and marker is not None
            confidence = 0.95 if explicit_user_marker else (0.78 if marker or phrase else 0.55)
            key = normalized.casefold()
            if key in seen: continue
            seen.add(key)
            found.append({"content": normalized, "category": category, "role": role,
                          "confidence": confidence, "auto_publish_eligible": explicit_user_marker and not risky})
            if len(found) >= MAX_CANDIDATES_PER_INGEST: return found
    return found

def _publish_candidate(conn, candidate_id, allow_reviewed=False):
    row = conn.execute("SELECT * FROM candidates WHERE id=?", (candidate_id,)).fetchone()
    if not row: return {"error": "candidate not found"}
    if row["status"] != "approved": return {"error": "candidate must be approved before publishing"}
    if not allow_reviewed and (row["category"] != "project_decision" or row["confidence"] < 0.9):
        return {"error": "candidate does not meet auto-publish safety gate"}
    PUBLISHED_DIR.mkdir(parents=True, exist_ok=True)
    if allow_reviewed and row["category"] != "project_decision":
        path = PUBLISHED_DIR / "Reviewed_Research_Candidates.md"
        heading = "# VOOM Reviewed Research Candidates\n\nEntries below were explicitly approved by a reviewer; approval is not a guarantee of trading performance.\n\n"
    else:
        path = PUBLISHED_DIR / "Auto_Learned_Project_Knowledge.md"
        heading = "# VOOM Auto-Learned Project Knowledge\n\nGenerated from explicitly marked conversation decisions. Verify source context before relying on entries.\n\n"
    existing = path.read_text(encoding="utf-8") if path.exists() else heading
    entry = f"- {row['content']} (source hash: {row['source_id_hash']}, confidence: {row['confidence']:.2f}, category: {row['category']})\n"
    if row["content"].casefold() not in existing.casefold():
        path.write_text(existing + entry, encoding="utf-8")
    try:
        relative = path.relative_to(SERVER_DIR.parent).as_posix()
    except ValueError:
        relative = path.name
    conn.execute("UPDATE candidates SET status='published', published_path=? WHERE id=?", (relative, candidate_id))
    conn.commit()
    return {"ok": True, "id": candidate_id, "path": relative}

def _queue_research_requests(conn, messages, source_hash):
    """Queue user questions for the connected AI client to research; no network calls here."""
    queued = 0
    research_markers = (
        "latest", "current", "today", "recent", "search the web", "look up",
        "find sources", "research", "compare", "ค้นหา", "ล่าสุด", "ปัจจุบัน",
        "ข้อมูลใหม่", "เปรียบเทียบ", "มีอะไรอัปเดต",
    )
    for item in messages:
        if not isinstance(item, dict) or str(item.get("role", "")).lower() != "user":
            continue
        query = item.get("content", "")
        if not isinstance(query, str):
            continue
        query = re.sub(r"\s+", " ", query).strip()
        if not query or len(query) > 1000 or _contains_sensitive(query):
            continue
        lower = query.lower()
        if "?" not in query and not any(marker in lower for marker in research_markers):
            continue
        cur = conn.execute(
            "INSERT OR IGNORE INTO research_requests(query,source_id_hash,status,created_at) VALUES(?,?,?,?)",
            (query, source_hash, "pending", _now()),
        )
        if cur.rowcount:
            queued += 1
    return queued


def list_research_requests(status="pending", limit=20):
    if status not in {"pending", "done", "dismissed", "all"}:
        return {"error": "status must be pending, done, dismissed, or all"}
    try:
        limit = max(1, min(int(limit), 100))
    except (ValueError, TypeError):
        return {"error": "limit must be an integer"}
    conn = _connect()
    try:
        if status == "all":
            rows = conn.execute("SELECT * FROM research_requests ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM research_requests WHERE status=? ORDER BY id DESC LIMIT ?", (status, limit)).fetchall()
        return {"count": len(rows), "requests": [dict(row) for row in rows]}
    finally:
        conn.close()


def mark_research_request(request_id: int, status: str, result_note=""):
    if status not in {"done", "dismissed"}:
        return {"error": "status must be done or dismissed"}
    try:
        request_id = int(request_id)
    except (ValueError, TypeError):
        return {"error": "request_id must be an integer"}
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE research_requests SET status=?, result_note=? WHERE id=?",
            (status, str(result_note)[:1500], request_id),
        )
        conn.commit()
        if not cur.rowcount:
            return {"error": "research request not found"}
        return {"ok": True, "id": request_id, "status": status}
    finally:
        conn.close()


def ingest_conversation(conversation_id: str, messages_json: str, consent_confirmed: bool):
    """Process explicitly consented client-supplied conversation messages."""
    if consent_confirmed is not True:
        return {"error": "explicit consent_confirmed=true is required"}
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 300:
        return {"error": "conversation_id must be a non-empty string up to 300 characters"}
    if not isinstance(messages_json, str) or len(messages_json) > 2_000_000:
        return {"error": "messages_json must be a JSON string no larger than 2 MB"}
    try: messages = json.loads(messages_json)
    except (TypeError, json.JSONDecodeError): return {"error": "messages_json is not valid JSON"}
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return {"error": f"messages_json must be a non-empty list of at most {MAX_MESSAGES} messages"}
    source_hash = hashlib.sha256(conversation_id.encode("utf-8")).hexdigest()[:24]
    candidates = _extract_candidates(messages)
    conn = _connect()
    try:
        conn.execute("INSERT INTO conversations(source_id_hash,received_at,message_count,candidate_count) VALUES(?,?,?,?)",
                     (source_hash, _now(), len(messages), len(candidates)))
        research_requests_queued = _queue_research_requests(conn, messages, source_hash)
        inserted, auto_ids = 0, []
        for candidate in candidates:
            status = "approved" if candidate["auto_publish_eligible"] else "pending_review"
            cur = conn.execute("""INSERT OR IGNORE INTO candidates
                (content,category,source_id_hash,source_role,confidence,status,created_at)
                VALUES(?,?,?,?,?,?,?)""",
                (candidate["content"], candidate["category"], source_hash, candidate["role"],
                 candidate["confidence"], status, _now()))
            if cur.rowcount:
                inserted += 1
                if status == "approved": auto_ids.append(int(cur.lastrowid))
        conn.commit()
        published = [_publish_candidate(conn, cid) for cid in auto_ids]
        return {"ok": True, "conversation_hash": source_hash, "messages_seen": len(messages),
                "candidates_found": len(candidates), "new_candidates": inserted,
                "research_requests_queued": research_requests_queued,
                "auto_published_safe_project_decisions": sum(1 for item in published if item.get("ok")),
                "pending_review": sum(1 for item in candidates if not item["auto_publish_eligible"]),
                "privacy": "Raw transcript is not persisted; messages matching sensitive-data filters are skipped."}
    finally: conn.close()

def list_learning_candidates(status="pending_review", limit=30):
    if status not in {"pending_review", "approved", "published", "rejected", "all"}:
        return {"error": "invalid status"}
    try: limit = max(1, min(int(limit), 100))
    except (ValueError, TypeError): return {"error": "limit must be an integer"}
    conn = _connect()
    try:
        if status == "all": rows = conn.execute("SELECT * FROM candidates ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        else: rows = conn.execute("SELECT * FROM candidates WHERE status=? ORDER BY id DESC LIMIT ?", (status, limit)).fetchall()
        return {"count": len(rows), "candidates": [dict(row) for row in rows]}
    finally: conn.close()

def review_learning_candidate(candidate_id: int, decision: str, note=""):
    if decision not in {"approve", "reject"}: return {"error": "decision must be approve or reject"}
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM candidates WHERE id=?", (int(candidate_id),)).fetchone()
        if not row: return {"error": "candidate not found"}
        if row["status"] == "published": return {"error": "published candidate cannot be reviewed again"}
        status = "approved" if decision == "approve" else "rejected"
        conn.execute("UPDATE candidates SET status=?, reviewer_note=? WHERE id=?", (status, str(note)[:1000], int(candidate_id)))
        conn.commit()
        if decision == "approve":
            result = _publish_candidate(conn, int(candidate_id), allow_reviewed=True)
            if result.get("ok"): return {"ok": True, "status": "published", **result}
            return {"ok": True, "status": "approved", "publish": result}
        return {"ok": True, "status": "rejected", "id": int(candidate_id)}
    except (TypeError, ValueError): return {"error": "candidate_id must be an integer"}
    finally: conn.close()

def add_research_result(title: str, summary: str, source_url: str, evidence_type="web_research"):
    title, summary, source_url = title.strip(), summary.strip(), source_url.strip()
    if not title or len(title) > 300 or not summary or len(summary) > 5000:
        return {"error": "title (<=300 chars) and summary (<=5000 chars) are required"}
    if not re.match(r"^https://", source_url, re.IGNORECASE) or len(source_url) > 2000:
        return {"error": "source_url must be an HTTPS URL"}
    if _contains_sensitive(title + "\n" + summary): return {"error": "content appears to contain sensitive information"}
    content = f"{title}\n\n{summary}\n\nSource: {source_url}"
    conn = _connect()
    try:
        cur = conn.execute("""INSERT OR IGNORE INTO candidates
            (content,category,source_id_hash,source_role,confidence,status,created_at,reviewer_note)
            VALUES(?,?,?,?,?,?,?,?)""",
            (content, evidence_type[:60], hashlib.sha256(source_url.encode()).hexdigest()[:24],
             "research_agent", 0.7, "pending_review", _now(), "Verify source and claims before approval."))
        conn.commit()
        return {"ok": True, "inserted": bool(cur.rowcount), "candidate_id": cur.lastrowid if cur.rowcount else None,
                "status": "pending_review", "note": "External research is never auto-published as verified fact."}
    finally: conn.close()

def learning_status():
    conn = _connect()
    try:
        counts = {row["status"]: row["n"] for row in conn.execute("SELECT status, COUNT(*) AS n FROM candidates GROUP BY status").fetchall()}
        conversations = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        return {"database": str(DB_PATH), "conversation_batches_processed": conversations,
                "candidate_counts": counts, "published_knowledge_directory": str(PUBLISHED_DIR),
                "pending_research_requests": conn.execute("SELECT COUNT(*) FROM research_requests WHERE status='pending'").fetchone()[0],
                "raw_transcripts_saved": False}
    finally: conn.close()
