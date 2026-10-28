# MCP Integration Gaps and Safe Research Worker

## Added in this update

- research_worker.py: opt-in web-search handoff for questions already stored in the consent-gated queue.
- integrations/mcp-client-config.example.json: local stdio config template for an MCP-capable AI client.
- tests/research_worker_test.py: offline tests for dry-run, missing credentials, and HTTPS/source filtering.

## Research worker safety

The worker uses Brave Search only when explicitly run with --execute and BRAVE_SEARCH_API_KEY is present in the process environment. Default mode is dry-run. Each run is limited to 20 queued requests and five results per query. Search snippets are stored as unverified candidates and never auto-published. A request is marked done only when at least one new candidate is queued. No API key is stored in source files, no HTTP server is opened, and no trading tools are called.

From PowerShell:

    Set-Location 'C:\Users\Administrator\Documents\Voom_system\Research\MCP_Server'
    .\.venv\Scripts\python.exe research_worker.py
    $env:BRAVE_SEARCH_API_KEY = '<set this securely in your own shell/session>'
    .\.venv\Scripts\python.exe research_worker.py --execute --limit 3

Do not put a real API key in source control, chat, or logs. The external provider may charge or impose usage limits under its current plan; verify pricing before enabling execution. Search snippets are leads, not authoritative verification. Review sources and candidate text before approval.

## AI client registration

Copy the mcpServers entry from integrations/mcp-client-config.example.json into the chosen client's MCP configuration. Client config locations differ. Restart/reload the client and verify that voom-knowledge tools are listed. The existing protocol_smoke_test.py verifies local stdio independently of the client UI.

## Consent ingestion adapter

The optional ingestion gateway listens only on 127.0.0.1:8766 and is not started by setup. It requires VOOM_MCP_INGEST_TOKEN to be set in the same process environment (minimum 40 characters). Generate a one-session token without putting it in a file:

    $env:VOOM_MCP_INGEST_TOKEN = (& '.\.venv\Scripts\python.exe' -c "import secrets; print(secrets.token_urlsafe(48))")
    & '.\.venv\Scripts\python.exe' ingestion_gateway.py

A trusted app on the same computer can POST JSON to /ingest with Authorization: Bearer <token> and a payload containing conversation_id, messages (list of role/content objects), and consent_confirmed: true. The endpoint has no CORS, rejects unauthenticated requests, limits body/message sizes and rate, and does not log payloads. Do not put the token into browser code or a public website. This is a receiver adapter only; the actual AI client must implement the consent UI and call it. Stop the process with Ctrl+C when not needed.

## Still needs explicit integration or credentials

- Conversation ingestion: only the app that owns a conversation can send its messages. It must request/record consent and call ingest_conversation. This server cannot passively read chat history from other apps.
- Always-on scheduled research: intentionally not enabled. First run dry-run, verify provider access and result quality, then explicitly decide whether to schedule it.
- Public paid Skill API and billing: not enabled. The commercial schema is design-only. An authenticated API, tenant isolation, key rotation, payment provider, metering enforcement and security review are still required.
- Model fine-tuning: not provided by MCP. It requires a separately governed dataset, training/evaluation pipeline and model deployment.

No code here adds order execution or enables live trading. Keep MCP on local stdio and leave the MT5 order path unchanged.
