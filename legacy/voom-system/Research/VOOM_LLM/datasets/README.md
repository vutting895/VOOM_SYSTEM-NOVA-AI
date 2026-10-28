# VOOM LLM datasets

Place reviewed supervised fine-tuning examples in voom_sft.jsonl only after verifying sources, usage rights, privacy and correctness.

Each line is one JSON object:
{
  "example_id": "unique-id-001",
  "instruction": "Answer the question using the supplied evidence.",
  "input": "Evidence text with source context.",
  "output": "A supported answer that states uncertainty and cites sources.",
  "source_urls": ["https://example.org/source"],
  "license": "internal-authored",
  "review_status": "approved",
  "language": "en"
}

No examples are preloaded: do not mistake template data for training data. Raw conversation history, customer information, secrets, unreviewed web pages and unverified trading-performance claims are prohibited.
