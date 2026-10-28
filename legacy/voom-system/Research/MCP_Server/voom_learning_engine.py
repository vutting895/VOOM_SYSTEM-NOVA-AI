"""VOOM source-governed LLM learning pipeline checks."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from typing import Any

SERVER_DIR = Path(__file__).resolve().parent
RESEARCH_ROOT = SERVER_DIR.parent.resolve()
LLM_ROOT = (RESEARCH_ROOT / "VOOM_LLM").resolve()
DATASET_PATH = LLM_ROOT / "datasets" / "voom_sft.jsonl"
REGISTRY_PATH = LLM_ROOT / "model_registry.json"
REQUIRED = ("example_id", "instruction", "output", "source_urls", "license", "review_status", "language")
SENSITIVE_TERMS = ("api_key=", "access_token=", "password=", "private_key=", "sk-proj-")

def _read_registry() -> dict[str, Any]:
    try:
        data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}

def _has_sensitive(text: str) -> bool:
    lower = text.lower()
    return any(term in lower for term in SENSITIVE_TERMS) or bool(re.search(r"\b\d{3}-\d{2}-\d{4}\b", text))

def _valid_https_url(value: Any) -> bool:
    return isinstance(value, str) and len(value) <= 2000 and value.startswith("https://") and not any(c.isspace() for c in value)

def validate_dataset() -> dict[str, Any]:
    if not DATASET_PATH.is_file():
        return {"ok": True, "exists": False, "examples": 0, "errors": [], "note": "No training examples yet."}
    errors: list[dict[str, Any]] = []
    seen: set[str] = set()
    count = 0
    try:
        with DATASET_PATH.open("r", encoding="utf-8") as handle:
            for line_no, raw in enumerate(handle, 1):
                if not raw.strip():
                    continue
                count += 1
                if len(raw) > 100_000:
                    errors.append({"line": line_no, "error": "line exceeds 100 KB"})
                    continue
                try:
                    row = json.loads(raw)
                except json.JSONDecodeError:
                    errors.append({"line": line_no, "error": "invalid JSON"})
                    continue
                if not isinstance(row, dict):
                    errors.append({"line": line_no, "error": "each row must be an object"})
                    continue
                missing = [field for field in REQUIRED if field not in row]
                if missing:
                    errors.append({"line": line_no, "error": "missing fields", "fields": missing})
                    continue
                eid = row.get("example_id")
                if not isinstance(eid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{3,100}", eid):
                    errors.append({"line": line_no, "error": "invalid example_id"})
                elif eid in seen:
                    errors.append({"line": line_no, "error": "duplicate example_id"})
                else:
                    seen.add(eid)
                for field in ("instruction", "input", "output", "license", "language"):
                    value = row.get(field, "")
                    if not isinstance(value, str) or len(value) > 30_000:
                        errors.append({"line": line_no, "error": field + " must be text <=30000 characters"})
                    elif field in ("instruction", "output") and len(value.strip()) < 8:
                        errors.append({"line": line_no, "error": field + " is too short"})
                if row.get("review_status") != "approved":
                    errors.append({"line": line_no, "error": "review_status must be approved"})
                urls = row.get("source_urls")
                if not isinstance(urls, list) or not urls or not all(_valid_https_url(url) for url in urls):
                    errors.append({"line": line_no, "error": "source_urls must contain HTTPS source links"})
                joined = " ".join(str(row.get(k, "")) for k in ("instruction", "input", "output"))
                if _has_sensitive(joined):
                    errors.append({"line": line_no, "error": "possible credential or sensitive identifier detected"})
                license_value = row.get("license")
                if not isinstance(license_value, str) or license_value.strip().lower() in {"unknown", "unverified", "none", ""}:
                    errors.append({"line": line_no, "error": "usage rights must be documented"})
        return {
            "ok": not errors, "exists": True, "examples": count,
            "unique_ids": len(seen), "errors": errors[:100], "error_count": len(errors),
            "dataset_sha256": hashlib.sha256(DATASET_PATH.read_bytes()).hexdigest(),
            "note": "Structure checks do not replace source/license review or model evaluation."
        }
    except OSError as exc:
        return {"ok": False, "exists": True, "examples": count, "errors": [{"error": type(exc).__name__}]}

def status() -> dict[str, Any]:
    registry = _read_registry()
    dataset = validate_dataset()
    packages = {}
    for name in ("torch", "transformers", "peft", "datasets"):
        try:
            packages[name] = importlib.util.find_spec(name) is not None
        except (ImportError, ValueError, ModuleNotFoundError):
            packages[name] = False
    versions = registry.get("model_versions", [])
    return {
        "project": "VOOM LLM",
        "dataset_path": str(DATASET_PATH),
        "dataset_examples": dataset.get("examples", 0),
        "dataset_validation": dataset,
        "runtime_packages": packages,
        "base_model_candidate": registry.get("default_base_model_candidate"),
        "active_model": registry.get("active_model"),
        "registered_model_versions": len(versions) if isinstance(versions, list) else 0,
        "training_executed": bool(versions),
        "auto_training_enabled": False,
        "auto_deploy_enabled": False,
        "auto_upload_enabled": False,
        "live_trading_enabled": False,
        "mt5_order_path_modified": False,
        "limitations": [
            "No foundation model was trained from random initialization.",
            "Dataset validation is not proof of answer quality or trading profitability.",
            "External research requires source and usage-rights review before training."
        ]
    }
