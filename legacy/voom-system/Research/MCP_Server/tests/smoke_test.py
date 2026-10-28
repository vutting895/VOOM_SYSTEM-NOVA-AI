"""Dependency-light smoke tests for the VOOM Knowledge MCP server."""
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))
import server  # noqa: E402


def main() -> int:
    checks = []

    docs = server.list_documents()
    assert docs["count"] >= 1, "No knowledge documents found"
    checks.append("list_documents: PASS")

    search = server.search_knowledge("walk-forward", 5)
    paths = [item["path"] for item in search["results"]]
    assert any("MQL5_Learning_Path.md" in path for path in paths), paths
    assert search["search_type"] == "bm25_lexical", search
    assert all("matched_terms" in item and "score" in item for item in search["results"])
    checks.append("BM25 lexical search/ranking: PASS")

    thai_text = "".join(chr(code) for code in [0x0e01,0x0e32,0x0e23,0x0e1a,0x0e23,0x0e34,0x0e2b,0x0e32,0x0e23,0x0e04,0x0e27,0x0e32,0x0e21,0x0e40,0x0e2a,0x0e35,0x0e48,0x0e22,0x0e07])
    thai_tokens = server._tokens(thai_text)
    assert chr(0x0e1a) + chr(0x0e23) in thai_tokens and chr(0x0e04) + chr(0x0e27) in thai_tokens, thai_tokens
    checks.append("Thai character-bigram tokenization: PASS")

    bad_top_k = server.search_knowledge("risk", "not-a-number")
    assert "error" in bad_top_k, bad_top_k
    checks.append("invalid top_k rejection: PASS")

    read = server.read_document("MQL5_Learning_Path.md", 1000)
    assert read.get("path") == "MQL5_Learning_Path.md"
    assert "MQL5 Learning Path" in read["content"]
    checks.append("read_document: PASS")

    traversal = server.read_document("../README.md")
    assert "error" in traversal, traversal
    checks.append("path traversal rejection: PASS")

    too_long = server.search_knowledge("x" * (server.MAX_QUERY_CHARS + 1))
    assert "error" in too_long, too_long
    checks.append("query size limit: PASS")

    topics = server.list_topics()
    assert topics["document_count"] == docs["count"]
    checks.append("list_topics: PASS")

    print("\n".join(checks))
    print(f"TOTAL: {len(checks)}/{len(checks)} passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
