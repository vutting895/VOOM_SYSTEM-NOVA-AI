"""Explicit local-only VOOM adapter training entry point.

This script does not download base weights, upload artifacts, or connect to MT5.
It requires a reviewed dataset and a base-model directory already present on disk.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH_ROOT = HERE.parent.resolve()
LLM_ROOT = (RESEARCH_ROOT / "VOOM_LLM").resolve()
sys.path.insert(0, str(HERE))
import voom_learning_engine

MIN_EXAMPLES = 50

def main() -> int:
    parser = argparse.ArgumentParser(description="Train a local VOOM LoRA adapter from approved SFT data.")
    parser.add_argument("--base-model-dir", required=True, help="Existing local model directory; remote model IDs are rejected.")
    parser.add_argument("--run-name", required=True, help="Version label, e.g. voom-th-v0-1")
    parser.add_argument("--epochs", type=float, default=1.0)
    args = parser.parse_args()

    validation = voom_learning_engine.validate_dataset()
    if not validation.get("ok"):
        print(json.dumps({"ok": False, "stage": "dataset_validation", "details": validation}, ensure_ascii=False))
        return 2
    if validation.get("examples", 0) < MIN_EXAMPLES:
        print(json.dumps({"ok": False, "stage": "dataset_validation", "error": "not enough approved examples", "minimum_examples": MIN_EXAMPLES, "found": validation.get("examples", 0)}, ensure_ascii=False))
        return 2

    model_dir = Path(args.base_model_dir).expanduser().resolve()
    try:
        model_dir.relative_to(model_dir)
    except ValueError:
        print("Invalid model path.")
        return 2
    if not model_dir.is_dir() or not (model_dir / "config.json").is_file():
        print("Base model must already exist locally and contain config.json; network downloads are disabled.")
        return 2
    if not args.run_name or not all(ch.isalnum() or ch in "-_" for ch in args.run_name) or len(args.run_name) > 80:
        print("Invalid run name.")
        return 2
    if not 0.1 <= args.epochs <= 3:
        print("epochs must be between 0.1 and 3 for this guarded first version.")
        return 2

    output_dir = (LLM_ROOT / "models" / args.run_name).resolve()
    try:
        output_dir.relative_to((LLM_ROOT / "models").resolve())
    except ValueError:
        print("Output path is outside the VOOM model directory.")
        return 2
    if output_dir.exists():
        print("Output directory already exists; choose a new run name.")
        return 2

    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, DataCollatorForLanguageModeling
    except ImportError as exc:
        print("Optional training dependencies are missing. Install the reviewed training environment first: " + type(exc).__name__)
        return 3

    rows = []
    with voom_learning_engine.DATASET_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row = json.loads(line)
                text = "Instruction:\n" + row["instruction"] + "\nContext:\n" + row.get("input", "") + "\nAnswer:\n" + row["output"]
                rows.append({"text": text})
    if not torch.cuda.is_available():
        print("Warning: CUDA GPU not detected. Training may be slow or exceed memory; stop if resource pressure appears.")
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(str(model_dir), local_files_only=True)
    model.config.use_cache = False
    lora = LoraConfig(task_type="CAUSAL_LM", r=8, lora_alpha=16, lora_dropout=0.05, target_modules="all-linear")
    model = get_peft_model(model, lora)

    def tokenize(batch):
        return tokenizer(batch["text"], truncation=True, max_length=1024)
    dataset = Dataset.from_list(rows).map(tokenize, batched=True, remove_columns=["text"])
    training_args = TrainingArguments(
        output_dir=str(output_dir), num_train_epochs=args.epochs,
        per_device_train_batch_size=1, gradient_accumulation_steps=8,
        learning_rate=2e-4, logging_steps=5, save_strategy="epoch",
        report_to="none", push_to_hub=False, fp16=bool(torch.cuda.is_available()),
        use_cpu=not bool(torch.cuda.is_available()), dataloader_num_workers=0,
    )
    trainer = Trainer(
        model=model, args=training_args, train_dataset=dataset,
        data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False),
    )
    trainer.train()
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    manifest = {
        "run_name": args.run_name,
        "base_model_local_path": str(model_dir),
        "dataset_sha256": validation.get("dataset_sha256"),
        "dataset_examples": validation.get("examples"),
        "epochs": args.epochs,
        "adapter_type": "LoRA",
        "status": "research_candidate",
        "human_review_required": True,
        "auto_deploy_enabled": False,
        "auto_upload_enabled": False,
        "live_trading_enabled": False,
        "mt5_order_path_modified": False,
    }
    (output_dir / "training_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "output_dir": str(output_dir), "manifest": manifest}, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
