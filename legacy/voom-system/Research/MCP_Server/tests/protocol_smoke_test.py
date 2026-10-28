"""End-to-end MCP stdio protocol test (launches server as a subprocess)."""
import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER_DIR = Path(__file__).resolve().parents[1]
PYTHON = SERVER_DIR / ".venv" / "Scripts" / "python.exe"
SERVER = SERVER_DIR / "server.py"


async def main() -> int:
    params = StdioServerParameters(command=str(PYTHON), args=[str(SERVER)], env=None)
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            listed = await session.list_tools()
            names = {tool.name for tool in listed.tools}
            expected = {"list_documents", "search_knowledge", "read_document", "list_topics", "ingest_conversation", "learning_status", "list_learning_candidates", "review_learning_candidate", "submit_research_finding", "list_research_requests", "mark_research_request", "semantic_search_knowledge", "semantic_index_status", "rebuild_semantic_index", "list_skill_packages", "export_skill_package", "list_trading_systems", "get_trading_system", "list_security_modules", "get_security_module", "voom_learning_status", "validate_voom_training_dataset", "ai_learning_status", "llm_analyze_research"}
            assert expected.issubset(names), f"Missing tools: {expected - names}"
            result = await session.call_tool("search_knowledge", {"query": "MQL5_Learning_Path.md", "top_k": 3})
            assert not result.isError, result
            payload = str(result.content)
            assert "MQL5_Learning_Path.md" in payload, payload

            status_result = await session.call_tool("learning_status", {})
            assert not status_result.isError, status_result
            queue_result = await session.call_tool("list_research_requests", {"status": "pending", "limit": 5})
            assert not queue_result.isError, queue_result

            systems_result = await session.call_tool("list_trading_systems", {"include_research": True})
            assert not systems_result.isError, systems_result
            systems_payload = str(systems_result.content)
            assert "voom-core" in systems_payload and "research" in systems_payload, systems_payload

            denied_result = await session.call_tool("get_trading_system", {"system_id": "voom-core"})
            assert not denied_result.isError and "not approved_for_ai" in str(denied_result.content), denied_result

            system_result = await session.call_tool("get_trading_system", {"system_id": "voom-core", "include_research": True})
            assert not system_result.isError and "SYSTEM.md" in str(system_result.content), system_result
            print("Trading systems catalog and research-stage guard: PASS")

            security_list = await session.call_tool("list_security_modules", {"include_research": True})
            assert not security_list.isError and "security-core" in str(security_list.content), security_list
            security_denied = await session.call_tool("get_security_module", {"module_id": "security-core"})
            assert not security_denied.isError and "not approved_for_ai" in str(security_denied.content), security_denied
            security_doc = await session.call_tool("get_security_module", {"module_id": "security-core", "include_research": True})
            security_payload = str(security_doc.content)
            assert not security_doc.isError and "production_changes_enabled" in security_payload and "SYSTEM.md" in security_payload, security_doc
            assert "execution_permissions_granted" in security_payload, security_payload
            print("Security knowledge catalog and research-stage guard: PASS")

            resources = await session.list_resources()
            resource_uris = {str(resource.uri) for resource in resources.resources}
            assert "knowledge://catalog" in resource_uris, resource_uris

            prompts = await session.list_prompts()
            prompt_names = {prompt.name for prompt in prompts.prompts}
            assert "research_guidance" in prompt_names, prompt_names

            print("MCP initialize: PASS")
            print(f"Tool discovery: PASS ({', '.join(sorted(names))})")
            print("MCP tool call/search result: PASS")
            print("Resource discovery: PASS (knowledge://catalog)")
            print("Prompt discovery: PASS (research_guidance)")
            print("TOTAL: 5/5 passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
