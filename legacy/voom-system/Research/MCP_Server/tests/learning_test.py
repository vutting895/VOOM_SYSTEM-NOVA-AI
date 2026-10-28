"""Tests for consent, privacy, candidate review and safe export."""
import json
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))
import learning_store as store


def main():
    original_db, original_pub = store.DB_PATH, store.PUBLISHED_DIR
    checks = []
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        store.DB_PATH = root / "learning_test.db"
        store.PUBLISHED_DIR = root / "published"

        no_consent = store.ingest_conversation("test-no-consent", "[]", False)
        assert "error" in no_consent
        checks.append("consent required: PASS")

        messages = [
            {"role": "user", "content": "Decision: The dashboard replaces Telegram notifications in the VOOM project."},
            {"role": "user", "content": "Rule: XAUUSD buy signals should use a 0.5 percent risk limit."},
            {"role": "user", "content": "Project fact: contact me at private@example.com for access."},
            {"role": "assistant", "content": "We will use the existing Research folder for curated documents."},
            {"role": "user", "content": "Can you research current MCP SDK guidance?"},
        ]
        result = store.ingest_conversation("test-conversation-1", json.dumps(messages), True)
        assert result["ok"] and result["new_candidates"] >= 2, result
        assert result["research_requests_queued"] == 1, result
        queued = store.list_research_requests("pending")
        assert queued["count"] == 1 and "MCP SDK" in queued["requests"][0]["query"], queued
        checks.append("conversation question queued for web research: PASS")
        assert result["auto_published_safe_project_decisions"] >= 1, result
        checks.append("consented conversation ingestion and safe auto-publish: PASS")

        status = store.learning_status()
        assert status["raw_transcripts_saved"] is False
        checks.append("raw transcript not persisted: PASS")

        pending = store.list_learning_candidates("pending_review", 100)["candidates"]
        assert any(item["category"] == "trading_hypothesis" for item in pending), pending
        checks.append("trading hypothesis held for review: PASS")

        research = store.add_research_result("Test source", "A summary that needs verification.", "https://example.org/reference")
        assert research["ok"] and research["status"] == "pending_review", research
        checks.append("external research queued for review: PASS")

        candidate_id = next(item["id"] for item in pending if item["category"] == "trading_hypothesis")
        reviewed = store.review_learning_candidate(candidate_id, "approve", "Reviewed for test only")
        assert reviewed["status"] == "published", reviewed
        assert (store.PUBLISHED_DIR / "Reviewed_Research_Candidates.md").exists()
        checks.append("explicitly reviewed research export: PASS")

        print("\n".join(checks))
        print(f"TOTAL: {len(checks)}/{len(checks)} passed")
    store.DB_PATH, store.PUBLISHED_DIR = original_db, original_pub
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
