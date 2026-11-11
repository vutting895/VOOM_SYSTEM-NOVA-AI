import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "pdi_backup_manifest.py"
spec = importlib.util.spec_from_file_location("pdi_backup_manifest", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for name in ("roles.sql", "schema.sql", "data.sql"):
            (self.root / name).write_text(f"-- {name}\n", encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def create(self, **overrides):
        values = {
            "backup_dir": str(self.root), "project": "NOVA",
            "project_ref": "tlyyxufuiimrbaksoitf", "roles": "roles.sql",
            "schema": "schema.sql", "data": "data.sql", "overwrite": False,
            "migration_history_schema": None, "migration_history_data": None,
        }
        values.update(overrides)
        return module.create_manifest(type("Args", (), values)())

    def verify(self, project="NOVA", ref="tlyyxufuiimrbaksoitf"):
        return module.verify_manifest(type("Args", (), {
            "backup_dir": str(self.root), "project": project, "project_ref": ref,
        })())

    def test_create_and_verify(self):
        self.assertEqual(self.create(), 0)
        self.assertEqual(self.verify(), 0)
        manifest = json.loads((self.root / "manifest.json").read_text())
        self.assertEqual(manifest["restore_test"]["status"], "not_run")
        self.assertEqual(manifest["archive"]["immutability"], "unverified")

    def test_detects_tampering(self):
        self.create()
        with (self.root / "data.sql").open("a") as stream:
            stream.write("-- tampered\n")
        self.assertEqual(self.verify(), 2)

    def test_rejects_wrong_project(self):
        self.create()
        self.assertEqual(self.verify(project="__wrong_project__"), 2)

    def test_rejects_path_traversal(self):
        (self.root / "manifest.json").write_text(json.dumps({
            "manifest_version": 1, "project": "NOVA",
            "project_ref": "tlyyxufuiimrbaksoitf",
            "artifacts": {kind: {"path": "../outside.sql", "size_bytes": 1, "sha256": "x"}
                          for kind in ("roles", "schema", "data")},
        }))
        self.assertEqual(self.verify(), 2)

    def test_rejects_symlink(self):
        outside = self.root.parent / "outside-pdi.sql"
        outside.write_text("not inside backup dir")
        try:
            (self.root / "roles-link.sql").symlink_to(outside)
            with self.assertRaises(ValueError):
                self.create(roles="roles-link.sql")
        finally:
            outside.unlink(missing_ok=True)

    def test_manifest_not_overwritten_implicitly(self):
        self.create()
        with self.assertRaises(FileExistsError):
            self.create()

    def test_migration_history_pair_is_manifested_and_verified(self):
        (self.root / "history-schema.sql").write_text("-- history schema\\n")
        (self.root / "history-data.sql").write_text("-- history data\\n")
        self.assertEqual(self.create(
            migration_history_schema="history-schema.sql",
            migration_history_data="history-data.sql",
        ), 0)
        self.assertEqual(self.verify(), 0)
        manifest = json.loads((self.root / "manifest.json").read_text())
        self.assertIn("migration_history_schema", manifest["artifacts"])
        self.assertIn("migration_history_data", manifest["artifacts"])

    def test_migration_history_pair_is_atomic(self):
        (self.root / "history-schema.sql").write_text("-- history schema\n")
        with self.assertRaises(ValueError):
            self.create(migration_history_schema="history-schema.sql")


if __name__ == "__main__":
    unittest.main()
