import ast
import json
import unittest
from pathlib import Path

NOTEBOOK = Path(__file__).resolve().parents[1] / "notebooks" / "NOVA_Hybrid_Continuous_MultiAsset_Training.ipynb"

class HybridNotebookContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        cls.code = [ "".join(c.get("source", [])) for c in cls.nb["cells"] if c["cell_type"] == "code" ]
        cls.source = "\n".join(cls.code)

    def test_nbformat(self):
        self.assertEqual(self.nb["nbformat"], 4)
        self.assertGreaterEqual(self.nb["nbformat_minor"], 5)
        self.assertGreaterEqual(len(self.nb["cells"]), 10)

    def test_all_code_cells_parse(self):
        for index, source in enumerate(self.code):
            ast.parse(source, filename=f"notebook-cell-{index}")
            compile(source, f"notebook-cell-{index}", "exec")

    def test_safety_defaults_are_off(self):
        self.assertIn("RUN_TRAINING = False", self.source)
        self.assertIn("PERSIST_ARTIFACTS = False", self.source)
        self.assertIn("AUTO_PROMOTE = False", self.source)
        self.assertIn("FINAL_OOS_START = pd.Timestamp('2026-07-01T00:00:00Z')", self.source)

    def test_no_broker_execution_or_credentials(self):
        forbidden = ("OrderSend(", "order_send(", "positions_get(", "NOVA_MT5_BRIDGE_TOKEN")
        for value in forbidden:
            self.assertNotIn(value, self.source)

    def test_multimarket_contract_and_oof_gate(self):
        self.assertIn("ASSETS =", self.source)
        self.assertIn("TIMEFRAMES =", self.source)
        self.assertIn("def validate_oof_bundle", self.source)
        self.assertIn("is_oof", self.source)
        self.assertIn("calibration_id", self.source)

    def test_no_automatic_artifact_promotion(self):
        self.assertIn("auto_promote':False", self.source)
        self.assertIn("Artifact persistence is disabled", self.source)

if __name__ == "__main__":
    unittest.main()
