import ast
import json
import tempfile
import unittest
from pathlib import Path

from workers.quant_engine.unified_evaluation import (
    DatasetGateError,
    expanding_purged_walk_forward,
    fuse_research_signals,
    require_immutable_llm_replay,
    validate_dataset_manifest,
    validate_point_in_time_rows,
    split_development_final_oos,
)


class UnifiedEvaluationTests(unittest.TestCase):
    def test_manifest_requires_complete_hash_and_read_only_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bars.csv"
            path.write_bytes(b"timestamp,open,high,low,close,volume\n")
            import hashlib
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            manifest = {
                "dataset_id": "fixture", "provider": "fixture", "symbol": "XAUUSDm",
                "timeframe": "H1", "timezone": "UTC",
                "actual_start_utc": "2026-01-01T00:00:00Z",
                "actual_end_utc": "2026-02-01T00:00:00Z", "row_count": 1,
                "completeness_status": "PASS", "training_eligible": True,
                "content_sha256": digest, "ordersEnabled": False,
                "executionEnabled": False, "liveTradingEnabled": False,
            }
            self.assertEqual(validate_dataset_manifest(manifest, path), digest)
            manifest["executionEnabled"] = True
            with self.assertRaises(DatasetGateError):
                validate_dataset_manifest(manifest, path)

    def test_hash_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bars.csv"
            path.write_bytes(b"data")
            with self.assertRaises(DatasetGateError):
                validate_dataset_manifest({}, path)

    def test_walk_forward_is_chronological_and_purged(self):
        folds = expanding_purged_walk_forward(1200, n_splits=4, min_train_size=400, horizon=8)
        self.assertEqual(len(folds), 4)
        for fold in folds:
            self.assertEqual(fold.train_end + fold.purge_bars, fold.valid_start)
            self.assertLess(fold.train_end, fold.valid_start)
            self.assertLess(fold.valid_start, fold.valid_end)

    def test_walk_forward_rejects_insufficient_rows(self):
        with self.assertRaises(ValueError):
            expanding_purged_walk_forward(20, n_splits=5, min_train_size=10, horizon=5)

    def test_final_oos_boundary_purges_crossing_forward_labels(self):
        from datetime import datetime, timezone
        cutoff = datetime(2026, 7, 1, tzinfo=timezone.utc)
        events = [
            datetime(2026, 6, 25, tzinfo=timezone.utc),
            datetime(2026, 6, 30, tzinfo=timezone.utc),
            datetime(2026, 7, 1, tzinfo=timezone.utc),
        ]
        label_ends = [
            datetime(2026, 6, 30, tzinfo=timezone.utc),
            datetime(2026, 7, 5, tzinfo=timezone.utc),
            datetime(2026, 7, 6, tzinfo=timezone.utc),
        ]
        dev, oos, purged = split_development_final_oos(events, label_ends, cutoff)
        self.assertEqual(dev, [True, False, False])
        self.assertEqual(oos, [False, False, True])
        self.assertEqual(purged, [False, True, False])

    def test_notebook_json_and_code_cells_are_valid(self):
        notebook_path = Path(__file__).resolve().parents[1] / "notebooks" / "NOVA_Unified_Intelligence_Research.ipynb"
        notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
        self.assertEqual(notebook.get("nbformat"), 4)
        self.assertGreaterEqual(len(notebook.get("cells", [])), 10)
        for index, cell in enumerate(notebook["cells"]):
            if cell.get("cell_type") == "code":
                compile("".join(cell.get("source", [])), f"notebook_cell_{index}", "exec")

    def test_notebook_lstm_training_return_contract_is_unpacked(self):
        notebook_path = Path(__file__).resolve().parents[1] / "notebooks" / "NOVA_Unified_Intelligence_Research.ipynb"
        notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
        training_source = "".join(notebook["cells"][15]["source"])
        tree = ast.parse(training_source)
        parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
        calls = [node for node in ast.walk(tree)
                 if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                 and node.func.id == "train_lstm_fold"]
        self.assertEqual(len(calls), 2)
        unpacked = []
        for call in calls:
            parent = parents.get(call)
            self.assertIsInstance(parent, ast.Assign)
            self.assertEqual(len(parent.targets), 1)
            target = parent.targets[0]
            self.assertIsInstance(target, ast.Tuple)
            self.assertEqual(len(target.elts), 5)
            unpacked.append({item.id for item in target.elts if isinstance(item, ast.Name)})
        self.assertTrue(any("valid_ends" in names for names in unpacked))
        self.assertTrue(any("final_valid_ends" in names for names in unpacked))

    def test_future_available_feature_is_rejected(self):
        with self.assertRaises(DatasetGateError):
            validate_point_in_time_rows([1, 2, 3], [1, 2, 4])

    def test_non_monotonic_timestamps_are_rejected(self):
        with self.assertRaises(DatasetGateError):
            validate_point_in_time_rows([1, 3, 2])

    def test_llm_replay_must_precede_decision(self):
        record = {
            "model_id": "local-model-v1", "prompt_sha256": "a" * 64,
            "response_sha256": "b" * 64, "created_at": "2026-01-02T00:00:00Z", "decision": "LONG",
        }
        with self.assertRaises(DatasetGateError):
            require_immutable_llm_replay(record, "2026-01-01T00:00:00Z")
        record["created_at"] = "2026-01-02T00:00:00Z"
        with self.assertRaises(DatasetGateError):
            require_immutable_llm_replay(record, "2026-01-01T00:00:00Z")
        record["created_at"] = "2026-01-01T00:00:00Z"
        self.assertEqual(require_immutable_llm_replay(record, "2026-01-01T00:00:01Z"), record)

    def test_signal_fusion_abstains_on_missing_or_conflicting_inputs(self):
        missing = fuse_research_signals(0.8, 0.7, 1, None, 0.9)
        self.assertEqual(missing["decision"], "ABSTAIN")
        conflict = fuse_research_signals(0.8, 0.7, -1, -1, 0.9)
        self.assertEqual(conflict["decision"], "ABSTAIN")
        accepted = fuse_research_signals(0.8, 0.7, 1, 1, 0.9)
        self.assertEqual(accepted["decision"], "LONG")
        accepted_short = fuse_research_signals(0.2, 0.3, -1, -1, 0.1)
        self.assertEqual(accepted_short["decision"], "SHORT")
        neutral_meta = fuse_research_signals(0.8, 0.7, 1, 1, 0.55)
        self.assertEqual(neutral_meta["decision"], "ABSTAIN")


if __name__ == "__main__":
    unittest.main()
