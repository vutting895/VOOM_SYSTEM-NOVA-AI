"""Tests for semantic chunking and versioned skill export."""
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))
import semantic_search
import skill_export


def main():
    checks = []
    parts = semantic_search.chunk_document("A" * 3000, size=800, overlap=100)
    assert len(parts) >= 4 and all(parts), len(parts)
    assert parts[0][-100:] == parts[1][:100]
    checks.append("overlapping semantic chunks: PASS")
    cosine = semantic_search.cosine_similarity([3.0, 4.0], [6.0, 8.0])
    assert abs(cosine - 1.0) < 1e-9, cosine
    checks.append("cosine normalization: PASS")

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        (root / "Source.md").write_text("# Test Source\n\nVerified source content for skill export.", encoding="utf-8")
        skill_export.RESEARCH_ROOT = root.resolve()
        skill_export.SKILLS_ROOT = (root / "Skills").resolve()
        result = skill_export.export_skill("test-skill", "Test Skill", "A skill export test.",
                                           ["Source.md"], "1.2.3")
        assert result["ok"], result
        skill_path = root / result["skill_path"]
        manifest_path = root / result["manifest_path"]
        assert skill_path.exists() and "license: proprietary" in skill_path.read_text(encoding="utf-8")
        assert "Verified source content" in skill_path.read_text(encoding="utf-8")
        assert manifest_path.exists() and '"version": "1.2.3"' in manifest_path.read_text(encoding="utf-8")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["license"] == "proprietary" and manifest["billing"] == "not_enabled"
        checks.append("versioned SKILL.md and manifest export: PASS")

        commercial_db = sqlite3.connect(root / "commercial-test.db")
        schema = (SERVER_DIR / "commercial_schema.sql").read_text(encoding="utf-8")
        commercial_db.executescript(schema)
        tables = {row[0] for row in commercial_db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"tenants", "api_keys", "skill_entitlements", "usage_events"}.issubset(tables), tables
        commercial_db.close()
        checks.append("commercial entitlement/metering schema: PASS")

        bad = skill_export.export_skill("bad", "Bad", "Bad", ["../outside.md"])
        assert "error" in bad
        checks.append("skill source path traversal rejection: PASS")

        listed = skill_export.list_skills()
        assert listed["count"] == 1 and listed["skills"][0]["name"] == "test-skill"
        checks.append("skill package catalog: PASS")

    print("\n".join(checks))
    print(f"TOTAL: {len(checks)}/{len(checks)} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
