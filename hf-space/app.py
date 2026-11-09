"""Read-only registry status; model activation is intentionally not implemented."""
from __future__ import annotations

import os

import gradio as gr
from huggingface_hub import HfApi


def registry_status() -> str:
    repo_id = os.getenv("HF_MODEL_REPO_ID", "").strip()
    if not repo_id:
        return (
            "## Model registry not configured\n\n"
            "Set the Space variable `HF_MODEL_REPO_ID` to the NOVA model repository. "
            "No model is loaded or activated."
        )
    try:
        info = HfApi().repo_info(repo_id=repo_id, repo_type="model")
    except Exception:
        return (
            "## Model registry unavailable\n\n"
            "The configured model repository could not be read. Check its visibility "
            "and the Space read token. No model is loaded or activated."
        )
    return (
        "## NOVA model registry reachable\n\n"
        f"Model repository: `{repo_id}`\n\n"
        f"Latest repository revision: `{info.sha}`\n\n"
        "**Activation:** disabled. Candidate artifacts are not automatically "
        "promoted. A separately reviewed approval and release process is required."
    )


with gr.Blocks(title="NOVA Learning Registry") as demo:
    gr.Markdown(
        "# NOVA Learning Registry\n"
        "Read-only visibility for learning artifacts. This Space does not train, "
        "approve, deploy, or execute trading actions."
    )
    status = gr.Markdown(registry_status())
    refresh = gr.Button("Refresh registry status")
    refresh.click(fn=registry_status, outputs=status)

if __name__ == "__main__":
    demo.launch()
