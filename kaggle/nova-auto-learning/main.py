"""Kaggle CPU entrypoint: clone NOVA main, train, and publish gated artifacts to HF."""
from __future__ import annotations

import base64
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPOSITORY = "https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI.git"
BRANCH = "main"


DATASET_MANIFESTS = {
    "exness_xauusdm_m15": "datasets/exness/demo/xauusdm_m15/dataset_manifest.json",
    "exness_xauusdm_h1_3y": "data/market/exness/XAUUSDm_H1_3Y.manifest.json",
    "binance_btcusdt_h1_5y": "datasets/public/binance/btcusdt_h1/dataset_manifest.json",
    "binance_btcusdt_h1_500": "datasets/public/binance/btcusdt_h1/dataset_manifest.json",
}


def resolve_dataset_manifest(checkout: Path, dataset_id: str) -> Path:
    """Resolve only an explicitly supported, repository-relative dataset manifest."""
    relative_path = DATASET_MANIFESTS.get(dataset_id)
    if relative_path is None:
        supported = ", ".join(sorted(DATASET_MANIFESTS))
        raise ValueError(
            f"Unsupported NOVA_DATASET_ID {dataset_id!r}; supported IDs: {supported}"
        )
    return checkout / relative_path


def secret(name: str, required: bool = True) -> str | None:
    try:
        from kaggle_secrets import UserSecretsClient
        value = (UserSecretsClient().get_secret(name) or "").strip()
    except Exception as exc:
        if required:
            raise RuntimeError(f"Configure Kaggle Notebook secret {name!r}") from exc
        return None
    if required and not value:
        raise RuntimeError(f"Kaggle Notebook secret {name!r} is empty")
    return value or None


def run(command: list[str], *, cwd: Path | None = None, env=None) -> None:
    result = subprocess.run(
        command, cwd=cwd, env=env, text=True, capture_output=True,
        check=False, timeout=3600,
    )
    if result.returncode:
        # Do not echo args or environment; they can contain credentials.
        detail = (result.stderr or result.stdout or "no command output")[-2500:]
        raise RuntimeError(f"Command failed ({result.returncode}): {detail}")
    if result.stdout.strip():
        print(result.stdout[-3000:])


def main() -> None:
    github_token = secret("GITHUB_READ_TOKEN")
    hf_token = secret("HF_TOKEN")
    model_repo = secret("HF_MODEL_REPO_ID")
    dataset_id = secret("NOVA_DATASET_ID")
    approved = (secret("NOVA_TRAINING_APPROVED") or "").lower()
    approved_dataset_sha = secret("NOVA_APPROVED_DATASET_SHA256")
    approved_code_sha = secret("NOVA_APPROVED_CODE_SHA")
    if dataset_id != "exness_xauusdm_h1_3y":
        raise RuntimeError("Only the reviewed Exness XAUUSDm H1 3Y dataset is allowed")
    if approved != "true":
        raise RuntimeError("Training is disabled: NOVA_TRAINING_APPROVED must be explicitly set to true")
    if len(approved_dataset_sha) != 64 or len(approved_code_sha) != 40:
        raise RuntimeError("Approval must bind a full dataset SHA-256 and source commit SHA")

    temp_root = Path(tempfile.mkdtemp(prefix="nova-training-"))
    checkout = temp_root / "repo"
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    # Authentication header is supplied through child env, never in URL/argv.
    auth = base64.b64encode(f"x-access-token:{github_token}".encode()).decode("ascii")
    env["GIT_CONFIG_COUNT"] = "1"
    env["GIT_CONFIG_KEY_0"] = "http.extraheader"
    env["GIT_CONFIG_VALUE_0"] = f"AUTHORIZATION: Basic {auth}"
    try:
        run(["git", "clone", "--depth", "1", "--branch", BRANCH,
             REPOSITORY, str(checkout)], env=env)
        for key in ("GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"):
            env.pop(key, None)

        requirements = checkout / "backend/learning/requirements-training.txt"
        trainer = checkout / "backend/learning/train_price_model.py"
        manifest = resolve_dataset_manifest(checkout, dataset_id)
        if not requirements.is_file() or not trainer.is_file():
            raise RuntimeError("Trainer is not on main; review and merge the Learning Engine PR first.")
        if not manifest.is_file():
            raise RuntimeError(
                f"Dataset manifest for {dataset_id!r} is not on main; "
                "do not schedule training until its reviewed data dependency is available."
            )

        run([sys.executable, "-m", "pip", "install", "-r", str(requirements)])
        env["HF_TOKEN"] = hf_token
        env["HF_MODEL_REPO_ID"] = model_repo
        env["NOVA_GIT_SHA"] = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=checkout, text=True
        ).strip()
        if approved_code_sha.lower() != env["NOVA_GIT_SHA"].lower():
            raise RuntimeError("Approved source SHA does not match the checked-out repository")
        run([
            sys.executable, "-m", "backend.learning.train_price_model",
            "--repo-root", str(checkout), "--dataset-id", dataset_id,
            "--output-root", "artifacts/learning-candidates",
            "--training-approved",
            "--approved-dataset-sha256", approved_dataset_sha,
            "--approved-code-sha", approved_code_sha,
        ], cwd=checkout, env=env)
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


if __name__ == "__main__":
    main()
