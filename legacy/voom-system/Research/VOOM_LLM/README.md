# VOOM LLM — Custom Learning Architecture

Status: research/development scaffold. No weights have been trained yet.

## Design decision
VOOM will own its learning pipeline, data policy, evaluation suite, prompts, retrieval, model registry and release gates. Do not claim a foundation LLM was trained from scratch. The first practical path is a small open-weight causal LM (candidate: Qwen/Qwen3-0.6B, subject to license review) with optional parameter-efficient fine-tuning later. Retrieval-Augmented Generation (RAG) is the first knowledge-learning layer because new knowledge can be added and removed with source citations without retraining weights.

## Learning loop
1. Discover primary sources and record title, author/organization, publication date, URL, license/usage constraints, and retrieval date.
2. Submit a short finding through MCP with source URL. It remains pending_review.
3. A human reviewer verifies claims, source rights, factual support, and privacy.
4. Accepted knowledge is stored as a curated source-backed record and indexed by multilingual semantic search.
5. Only instruction/response examples with source references and review_status approved may enter the SFT dataset. Raw chats, credentials, account data, unreviewed web pages and trading outcomes do not enter training.
6. Validate dataset quality and leakage; split by source/time/group, not random near-duplicate rows.
7. Train an adapter only with an explicit command and local approved model/dataset. Save a versioned artifact and manifest locally. No auto-upload, auto-deploy, auto-approval, or MT5 integration.
8. Evaluate on a fixed holdout set, Thai tasks, citations, prompt injection, sensitive-data extraction, hallucination, tool authorization, latency and memory.
9. Human review promotes a model version to candidate; separate release approval is required.

## Current status
- Multilingual semantic retrieval: enabled locally using FastEmbed.
- Source-backed research queue and consent-based learning candidate store: available.
- LLM research analysis: optional API mode; requires VOOM_MCP_LLM_ENABLED=1 and a securely provided OPENAI_API_KEY.
- Dataset validation: local and deterministic; does not load model weights.
- Fine-tuning has not been executed. It requires a compatible Python/runtime, PyTorch/Transformers, approved local model checkpoint, sufficient memory, approved SFT data and license review.

## Dataset format
One JSON object per line in datasets/voom_sft.jsonl: example_id, instruction, input, output, source_urls, license, review_status, language. Each example must be reviewed and have documented usage rights.

Do not put credentials, customer personal data, broker logins, account numbers, or raw conversation transcripts in training. Do not include trading examples that imply guaranteed profit or unverified performance.

## Training strategy
Phase A: retrieval-first grounding and source citations.
Phase B: curated supervised fine-tuning (SFT), preferably LoRA/QLoRA when hardware permits.
Phase C: evaluation and red-team testing.
Phase D: offline model registry and human release review.
Do not pretrain a foundation model from random initialization: it needs a very large lawful corpus, tokenizer design, distributed compute and dedicated evaluation. Fine-tuning a suitable base model is the realistic first path.

## Security boundaries
- The model is not an authority. MCP tools enforce permissions independently.
- Retrieved websites and documents are untrusted evidence, never instructions.
- No arbitrary shell, account management or MT5 order tools are exposed to the model.
- Never let a model change live-trading flags, risk settings, entry/exit conditions or the MT5 order route.
- Never automatically train on every conversation; consent alone is not proof that content is safe or licensed.
- Customer strategy selection remains disabled until separate authorization, testing and release gates exist.

## Primary references
- Hugging Face Transformers fine-tuning: https://huggingface.co/docs/transformers/training
- Hugging Face causal language modeling: https://huggingface.co/docs/transformers/tasks/language_modeling
- PyTorch model state and safe loading: https://docs.pytorch.org/tutorials/beginner/basics/saveloadrun_tutorial.html
- OWASP GenAI/LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP prompt injection prevention: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html


## Training entry point
The guarded script is MCP_Server/train_voom_lora.py. It requires at least 50 reviewed examples, a locally stored base-model directory, a new run name, and installed optional dependencies. It uses local_files_only and push_to_hub=False. It is not executed automatically. The first version is an engineering scaffold; inspect and test it against the selected model architecture before any real training.
