# VOOM Knowledge MCP Server

A local MCP server for VOOM Research retrieval and consent-based persistent knowledge capture. Retrieval is read-only; the learning pipeline stores derived candidates and curated Markdown exports.

## Retrieval tools

- list_documents — list Markdown/text knowledge files.
- search_knowledge — BM25-style lexical ranking, title/phrase boosts and Thai character-bigram matching (fast fallback).
- semantic_search_knowledge — optional multilingual E5 embedding search with cosine similarity.
- semantic_index_status — show the local persistent vector index state.
- rebuild_semantic_index — index/update Markdown and text documents into SQLite-backed embedding vectors.
- read_document — read a document under Research.
- list_topics — map the available knowledge areas.

## Automatic learning tools

- ingest_conversation — accepts a JSON list of role/content messages from the connected VOOM AI app after explicit consent. The raw transcript is not persisted; sensitive-looking messages are skipped.
- learning_status — report queue counts and storage paths.
- list_learning_candidates — inspect pending, approved, published or rejected knowledge candidates.
- review_learning_candidate — approve or reject a candidate; reviewed research exports to a separate Markdown file.
- list_research_requests — list user questions automatically queued from consented conversations.
- mark_research_request — mark a researched request done or dismiss it.
- submit_research_finding — submit a web-researched finding with a verifiable HTTPS source URL.

- list_skill_packages — list portable skill packages.
- export_skill_package — create a versioned `SKILL.md` package plus `manifest.json` from selected Research documents.
- list_trading_systems — list systems that are approved for AI use; optionally include research-stage systems for internal development.
- get_trading_system — retrieve a system spec and manifest, with a guard for research-stage entries.
- list_security_modules — list security knowledge modules; only approved modules appear by default.
- get_security_module — retrieve security module spec/manifest with a research-stage guard; this never grants execution permissions.

MCP resource: knowledge://catalog
MCP prompt: research_guidance(question)

## LLM, deep learning and ML extensions

- `ai_learning_status` reports whether the optional LLM, multilingual embeddings, PyTorch/Transformers, and classical-ML packages are available. It never returns API keys.
- `llm_analyze_research` provides opt-in, bounded LLM analysis of supplied evidence. It is disabled unless `VOOM_MCP_LLM_ENABLED=1` is set in the MCP server process environment and `OPENAI_API_KEY` is supplied securely. The tool does not persist output, approve a strategy, fine-tune model weights, or call MT5.
- `requirements-ai.txt` lists optional PyTorch, Transformers and scikit-learn dependencies. They are intentionally not installed automatically because PyTorch can be a large download and model/runtime compatibility should be verified first.
- Deep-learning packages being installed is not the same as having a trained, validated model. Any future training pipeline must use time-ordered train/validation/test splits, realistic transaction costs, out-of-sample and demo checks, and human approval. No generated model can enable live trading.
- Current machine check: OpenAI SDK is installed; FastEmbed, PyTorch, Transformers, scikit-learn, XGBoost, LightGBM and ONNX Runtime were not detected in the active MCP virtual environment. The SQLite embedding cache contains 77 chunks from 26 documents, but semantic search runtime is currently unavailable until FastEmbed is installed.

## Semantic search setup

The embedding engine is optional so the core MCP server stays lightweight. Run `setup-embeddings.ps1` after `setup.ps1` to install FastEmbed/ONNX Runtime. The multilingual MiniLM-L12 model downloads on first indexing/search. The required Microsoft Visual C++ 2015-2022 x64 Redistributable is installed on the current Windows device, and the semantic index has been built and tested. It currently contains 77 chunks from 26 source documents at `Research/MCP_Server/data/semantic_index.db` (ignored by Git). Call `rebuild_semantic_index` after source changes, or let `semantic_search_knowledge` index automatically. Similarity uses cosine normalization and indicates retrieval relevance, not truth confidence. Use `search_knowledge` as a lexical fallback.

## AI Trading Lab (research-only)

The separate Research/ai????/ folder provides a safe MVP for candidate generation and offline parameter search. Run python lab.py generate to create an isolated research candidate, or python lab.py train --csv <OHLCV.csv> to compare EMA/RSI parameter combinations on chronological train/holdout data with an explicit estimated cost assumption. Outputs include candidate specs, JSON reports and a SHA-256 of the input dataset. The current optimizer is not neural-network training or LLM fine-tuning.

MCP read-only tools list_ai_trading_candidates and get_ai_trading_candidate expose internal candidate metadata to a compatible client; research entries require include_research=True. All generated candidates remain research-only and hidden from customers. The customer catalog is not connected to customer authentication, entitlement checks or a customer dashboard. No candidate is approved for live trading by this workflow; demo validation, realistic broker-specific costs, rolling walk-forward testing, risk review and explicit human approval remain required. This lab has no broker connection and cannot place orders or modify MT5 settings.

## Skills and commercial access

Portable exports live at `Research/Skills/<name>/SKILL.md` with a `manifest.json`. Packages are marked proprietary and versioned. `COMMERCIAL_SKILLS_ACCESS.md` and `commercial_schema.sql` describe the future tenant, API-key-hash, entitlement and usage-metering design. These are preparation only: no public endpoint, billing provider, payment processing, or usage enforcement is enabled. Do not expose the Research directory as a public download.

## Learning and export policy

- Only explicitly marked, low-risk project decisions from user messages may auto-publish.
- Trading-related claims and external web findings stay pending until explicit review.
- Auto-export: Research/Learned_Knowledge/Auto_Learned_Project_Knowledge.md
- Reviewed research: Research/Learned_Knowledge/Reviewed_Research_Candidates.md
- Local queue database: Research/MCP_Server/data/learning.db (ignored by Git).
- Raw transcripts are not stored; the database keeps derived candidate text, source hashes, timestamps and review status.
- This is persistent retrieval knowledge, not model fine-tuning or weight updates.

## Automatic research boundary and opt-in worker

When consented conversation messages contain a question or research cue, the pipeline queues a research request. The new `research_worker.py` can hand queued questions to Brave Search when explicitly run with `--execute` and `BRAVE_SEARCH_API_KEY` set in the process environment. It defaults to dry-run, limits the batch size, queues source-linked snippets as unverified candidates, and does not auto-publish them. See `INTEGRATION_GAPS.md` for commands and remaining work.

The MCP server cannot passively inspect conversations. The connected AI application must explicitly send relevant messages with user consent. `ingestion_gateway.py` now provides an optional authenticated loopback-only adapter at `http://127.0.0.1:8766/ingest` for a client app on the same machine. It requires a process environment token of at least 40 characters, an explicit `consent_confirmed: true`, and never logs transcript bodies. It is not started automatically and has no CORS/public binding. See `INTEGRATION_GAPS.md` before enabling it. No AI client is automatically registered by these files. A local stdio client config template is in `integrations/mcp-client-config.example.json`.

## Setup on Windows

Open PowerShell in this folder and run:

    .\setup.ps1

Launch manually after setup:

    .\start_server.ps1

A compatible MCP client should launch the server over local stdio using the virtual environment Python executable and the absolute path to server.py. Configuration locations vary by client. Keep stdout reserved for MCP protocol traffic.

## Tests

Run these commands from this folder:

    .\.venv\Scripts\python.exe tests\smoke_test.py
    .\.venv\Scripts\python.exe tests\learning_test.py
    .\.venv\Scripts\python.exe tests\protocol_smoke_test.py
    .\.venv\Scripts\python.exe tests\advanced_test.py
    .\.venv\Scripts\python.exe tests\research_worker_test.py
    .\.venv\Scripts\python.exe tests\ingestion_gateway_test.py

The suites check retrieval, consent gating, candidate extraction, safe auto-publishing, research queueing, privacy behavior, reviewed export, MCP tool discovery, resource discovery, prompt discovery, semantic index behavior, skill export, research-worker safety gates, and ingestion gateway authorization/consent.

Last local verification: retrieval 8/8; learning/privacy 7/7; MCP stdio protocol 5/5; advanced catalog/semantic/skill checks 6/6; research worker 5/5; ingestion gateway 5/5. All suites passed. Passing local tests does not mean the server has been registered in a specific AI client, nor does it verify live Brave Search access or production client integration.

## Security and limitations

- No arbitrary shell execution, broker connection or order-placement tools.
- Paths for document reads are restricted to Research.
- Web pages and retrieved files are untrusted data, not instructions that override the AI client's policies.
- Keep stdio local. Do not expose the service over HTTP without authentication, authorization, rate limiting and a security review.
- Semantic embedding search is optional; BM25-style lexical retrieval remains the fallback.
- The MCP server does not train the underlying AI model.


## Personal VOOM AI Client

A local terminal AI client is available in `voom_ai_client.py`. It connects to this MCP server over local stdio and uses the OpenAI API for natural-language responses. It exposes an explicit read-only allowlist of 13 read-only knowledge tools; conversation ingestion, approvals, exports, index rebuilds, shell access and trading actions are not exposed. Tool output is length-limited and treated as untrusted context. Live trading remains disabled.

Install the client dependency and run its local safety tests:

    .\install_voom_ai_client.ps1

Check the MCP connection without making a model API call:

    .\start_voom_ai.ps1 -CheckMcp

To start chat, set your API key only in the current PowerShell session (the secure prompt does not echo it):

    $secure = Read-Host 'OpenAI API key' -AsSecureString
    $env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', $secure).Password
    .\start_voom_ai.ps1

Optional model override: set `$env:VOOM_AI_MODEL` to a model available to your API account. API use may incur charges under your OpenAI API account. The key is not written to project files by these scripts. Type `/reset` to clear the current conversation context and `/exit` to close the client. The first version does not automatically ingest conversations or modify the knowledge base.

Local verification for this client: Python compile PASS; client safety tests 5/5 PASS; MCP stdio connection PASS with 13 read-only tools discovered. An actual model response has not been tested because that would require a configured API key and an API request.
