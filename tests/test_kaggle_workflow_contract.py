"""Static security contract tests for the manual Kaggle API workflow.

These tests never require or read the Kaggle secret and never make a network call.
"""
import os
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "kaggle-api-readonly-check.yml"
DOCS_PATH = ROOT / "docs" / "KAGGLE_GITHUB_ACTIONS.md"


def read_contract(path: Path, env_name: str) -> str:
    """Allow the same exact source to be checked in an in-memory local harness."""
    supplied = os.environ.get(env_name)
    return supplied if supplied is not None else path.read_text(encoding="utf-8")


class KaggleWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = read_contract(WORKFLOW_PATH, "NOVA_KAGGLE_WORKFLOW_SOURCE")
        cls.docs = read_contract(DOCS_PATH, "NOVA_KAGGLE_WORKFLOW_DOCS")

    def test_secret_is_the_single_token_only(self):
        self.assertRegex(
            self.workflow,
            r"(?m)^\s*KAGGLE_API_TOKEN:\s*\$\{\{\s*secrets\.KAGGLE_API_TOKEN\s*\}\}\s*$",
        )
        self.assertNotRegex(self.workflow, r"KAGGLE_(?:USERNAME|KEY)\b")
        secret_refs = re.findall(r"secrets\.([A-Z0-9_]+)", self.workflow)
        self.assertEqual(secret_refs, ["KAGGLE_API_TOKEN"])

    def test_auth_check_is_manual_only(self):
        trigger_block = self.workflow.split("\njobs:", 1)[0]
        self.assertIn("workflow_dispatch:", trigger_block)
        self.assertNotRegex(trigger_block, r"(?m)^\s*(?:pull_request|push|schedule):")

    def test_permissions_are_read_only(self):
        self.assertRegex(self.workflow, r"(?ms)^permissions:\s*\n\s+contents:\s*read\s*$")
        self.assertNotRegex(self.workflow, r"(?m)^\s+(?:contents|actions):\s*write\s*$")

    def test_request_is_a_read_only_dataset_listing(self):
        self.assertIn(
            '["kaggle", "datasets", "list", "--page", "1", "--csv"]',
            self.workflow,
        )
        self.assertIn("capture_output=True", self.workflow)
        self.assertIn("timeout=90", self.workflow)
        self.assertNotIn('"download"', self.workflow)
        self.assertNotIn('"create"', self.workflow)
        self.assertNotIn('"upload"', self.workflow)

    def test_failure_diagnostics_are_suppressed(self):
        self.assertIn("set +x", self.workflow)
        self.assertIn("CLI details were suppressed to protect credentials.", self.workflow)
        self.assertNotIn("print(token", self.workflow)
        self.assertNotIn("print(result.stdout", self.workflow)
        self.assertNotIn("print(result.stderr", self.workflow)

    def test_no_dataset_or_secret_artifact_is_uploaded(self):
        for forbidden in ("upload-artifact", "kaggle.json", "KAGGLE_KEY", "KAGGLE_USERNAME"):
            self.assertNotIn(forbidden, self.workflow)

    def test_setup_guide_matches_the_token_contract(self):
        self.assertIn("KAGGLE_API_TOKEN", self.docs)
        self.assertIn("does not require the legacy", self.docs)
        self.assertNotIn("Create these secrets", self.docs)
        self.assertNotRegex(self.docs, r"(?m)^- `KAGGLE_(?:USERNAME|KEY)`")

    def test_documented_check_does_not_claim_training_or_dataset_validation(self):
        self.assertIn("does not validate dataset provenance", self.docs)
        self.assertIn("does not download, upload, modify, publish, or train", self.docs)


if __name__ == "__main__":
    unittest.main()
