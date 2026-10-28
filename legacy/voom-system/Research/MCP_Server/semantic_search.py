"""Optional local multilingual embedding search with a persistent SQLite vector cache.

Install requirements-embeddings.txt to enable this feature. No external API is called.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

SERVER_DIR = Path(__file__).resolve().parent
KNOWLEDGE_ROOT = SERVER_DIR.parent.resolve()
INDEX_DB = SERVER_DIR / "data" / "semantic_index.db"
DEFAULT_MODEL = os.getenv("VOOM_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
CHUNK_CHARS = 1400
CHUNK_OVERLAP = 180


def _connect():
    INDEX_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(INDEX_DB, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL,
        content_hash TEXT NOT NULL, chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL, embedding_json TEXT NOT NULL,
        model_name TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)")
    conn.commit()
    return conn


def chunk_document(text: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping paragraph-aware chunks."""
    text = text.strip()
    if not text:
        return []
    chunks, start = [], 0
    while start < len(text):
        end = min(len(text), start + size)
        if end < len(text):
            boundary = max(text.rfind("\n\n", start + size // 2, end), text.rfind(". ", start + size // 2, end))
            if boundary > start:
                end = boundary + (2 if text[boundary:boundary + 2] == "\n\n" else 1)
        part = text[start:end].strip()
        if part:
            chunks.append(part)
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)
    return chunks


def _load_model():
    try:
        from fastembed import TextEmbedding
    except ImportError as exc:
        raise RuntimeError(
            "The semantic engine cannot load. Run setup-embeddings.ps1; if the error mentions a missing ONNX Runtime DLL, install the Microsoft Visual C++ 2015-2022 x64 Redistributable and retry."
        ) from exc
    return TextEmbedding(model_name=DEFAULT_MODEL)


def _safe_docs():
    result = []
    for path in KNOWLEDGE_ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".md", ".txt"}:
            continue
        if any(part.lower() in {".git", ".venv", "node_modules", "__pycache__", "skills"} for part in path.parts):
            continue
        try:
            resolved = path.resolve()
            resolved.relative_to(KNOWLEDGE_ROOT)
        except (OSError, ValueError):
            continue
        result.append(resolved)
    return sorted(set(result), key=lambda p: str(p).lower())


def _title(text: str, path: Path) -> str:
    return next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), path.stem)


def cosine_similarity(left: list[float], right: list[float]) -> float:
    """Compute cosine similarity independent of embedding vector magnitude."""
    import math
    dot = sum(float(a) * float(b) for a, b in zip(left, right))
    left_norm = math.sqrt(sum(float(a) * float(a) for a in left))
    right_norm = math.sqrt(sum(float(b) * float(b) for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def rebuild_index(force: bool = False) -> dict[str, Any]:
    """Index current documents and persist their vector embeddings in SQLite."""
    model = _load_model()
    model_name = DEFAULT_MODEL
    docs = _safe_docs()
    conn = _connect()
    indexed, unchanged, removed = 0, 0, 0
    live_paths = set()
    try:
        for path in docs:
            rel = path.relative_to(KNOWLEDGE_ROOT).as_posix()
            live_paths.add(rel)
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            old = conn.execute("SELECT DISTINCT content_hash, model_name FROM chunks WHERE path=?", (rel,)).fetchone()
            if not force and old and old["content_hash"] == digest and old["model_name"] == model_name:
                unchanged += 1
                continue
            conn.execute("DELETE FROM chunks WHERE path=?", (rel,))
            title = _title(text, path)
            parts = chunk_document(text)
            if not parts:
                continue
            embeddings = list(model.embed(parts))
            for i, (part, vector) in enumerate(zip(parts, embeddings)):
                chunk_id = hashlib.sha256(f"{rel}:{digest}:{i}:{model_name}".encode()).hexdigest()
                conn.execute(
                    "INSERT OR REPLACE INTO chunks VALUES(?,?,?,?,?,?,?,?,datetime('now'))",
                    (chunk_id, rel, title, digest, i, part, json.dumps(vector.tolist()), model_name),
                )
                indexed += 1
            conn.commit()
        existing = [row["path"] for row in conn.execute("SELECT DISTINCT path FROM chunks").fetchall()]
        for rel in existing:
            if rel not in live_paths:
                conn.execute("DELETE FROM chunks WHERE path=?", (rel,))
                removed += 1
        conn.commit()
        total = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        return {"ok": True, "model": model_name, "documents_seen": len(docs),
                "chunks_indexed": indexed, "unchanged_documents": unchanged,
                "removed_documents": removed, "total_chunks": total,
                "index_db": str(INDEX_DB)}
    finally:
        conn.close()


def semantic_search(query: str, top_k: int = 5, rebuild: bool = False) -> dict[str, Any]:
    """Search indexed chunks by cosine similarity using a multilingual sentence embedding."""
    query = str(query or "").strip()
    if not query:
        return {"error": "query is required"}
    if len(query) > 500:
        return {"error": "query must be at most 500 characters"}
    try:
        top_k = max(1, min(int(top_k), 10))
    except (TypeError, ValueError):
        return {"error": "top_k must be an integer"}
    model = _load_model()
    conn = _connect()
    try:
        count = conn.execute("SELECT COUNT(*) FROM chunks WHERE model_name=?", (DEFAULT_MODEL,)).fetchone()[0]
    finally:
        conn.close()
    if rebuild or count == 0:
        result = rebuild_index(force=rebuild)
        if not result.get("ok"):
            return result
    vector = list(model.embed([query]))[0].tolist()
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM chunks WHERE model_name=?", (DEFAULT_MODEL,)).fetchall()
        scored = []
        for row in rows:
            other = json.loads(row["embedding_json"])
            similarity = cosine_similarity(vector, other)
            scored.append({"path": row["path"], "title": row["title"], "chunk_index": row["chunk_index"],
                           "similarity": round(similarity, 6), "excerpt": row["chunk_text"][:800],
                           "model": row["model_name"]})
        scored.sort(key=lambda x: (-x["similarity"], x["path"], x["chunk_index"]))
        return {"query": query, "search_type": "multilingual_embedding_cosine",
                "model": DEFAULT_MODEL, "index_chunks": len(rows),
                "note": "Similarity is retrieval relevance, not factual confidence. Check source documents.",
                "count": min(len(scored), top_k), "results": scored[:top_k]}
    finally:
        conn.close()


def index_status() -> dict[str, Any]:
    conn = _connect()
    try:
        row = conn.execute("SELECT COUNT(*) AS chunks, COUNT(DISTINCT path) AS documents, MAX(updated_at) AS updated_at FROM chunks").fetchone()
        return {"enabled_dependency": _dependency_present(), "model": DEFAULT_MODEL,
                "indexed_chunks": row["chunks"], "indexed_documents": row["documents"],
                "last_indexed_at": row["updated_at"], "index_db": str(INDEX_DB)}
    finally:
        conn.close()


def _dependency_present() -> bool:
    try:
        import fastembed  # noqa: F401
        return True
    except ImportError:
        return False
