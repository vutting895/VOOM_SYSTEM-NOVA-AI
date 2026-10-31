import copy
import unittest

from workers.learning_universe.recompile import (
    SkillBuildError,
    compile_skill_candidate,
    lint_compiled_skill,
    recompile_skill_candidate,
)
from tests.test_learning_skill_contracts import SCHEMAS, TOOLS, skill


class DeterministicSkillRecompileTests(unittest.TestCase):
    def compile(self, spec=None, compiler_version="1.0.0"):
        return compile_skill_candidate(
            spec or skill(),
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
            compiler_version=compiler_version,
        )

    def test_compile_emits_canonical_inert_artifact(self):
        result = self.compile()
        self.assertEqual(result["contract"], "nova.skill-build.v1")
        self.assertEqual(result["state"], "COMPILED_PENDING_EVALUATION")
        self.assertTrue(result["research_only"])
        self.assertFalse(result["execution_enabled"])
        self.assertFalse(result["publication_enabled"])
        self.assertEqual(result["content_sha256"], result["artifact_sha256"])

    def test_compile_is_deterministic_for_reordered_input(self):
        spec = skill()
        reordered = dict(reversed(list(spec.items())))
        first = self.compile(spec)
        second = self.compile(reordered)
        self.assertEqual(first, second)

    def test_recompile_skips_when_content_and_compiler_are_unchanged(self):
        previous = self.compile()
        result = recompile_skill_candidate(
            skill(),
            previous_manifest=previous,
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        self.assertFalse(result["changed"])
        self.assertEqual(result["reason"], "content_and_compiler_unchanged")

    def test_recompile_runs_when_content_changes(self):
        previous = self.compile()
        changed = skill()
        changed["description"] = "A revised deterministic research workflow."
        result = recompile_skill_candidate(
            changed,
            previous_manifest=previous,
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        self.assertTrue(result["changed"])
        self.assertEqual(result["reason"], "content_or_compiler_changed")
        self.assertNotEqual(result["manifest"]["content_sha256"], previous["content_sha256"])

    def test_recompile_runs_when_compiler_version_changes(self):
        previous = self.compile()
        result = recompile_skill_candidate(
            skill(),
            previous_manifest=previous,
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
            compiler_version="1.1.0",
        )
        self.assertTrue(result["changed"])
        self.assertEqual(result["manifest"]["compiler_version"], "1.1.0")

    def test_untrusted_or_tampered_previous_manifest_is_not_reused(self):
        previous = self.compile()
        previous["artifact"]["description"] = "tampered"
        result = recompile_skill_candidate(
            skill(),
            previous_manifest=previous,
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        self.assertTrue(result["changed"])
        self.assertEqual(result["manifest"], self.compile())

    def test_lint_blocks_missing_evaluation_report(self):
        manifest = self.compile()
        report = lint_compiled_skill(
            manifest,
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        self.assertFalse(report["passed"])
        self.assertEqual(report["findings"][0]["code"], "EVALUATION_REPORT_MISSING")

    def test_lint_passes_when_evaluation_report_is_referenced(self):
        spec = skill()
        spec["evaluation_report_ref"] = "evaluation-report-001"
        report = lint_compiled_skill(
            self.compile(spec),
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        self.assertTrue(report["passed"])
        self.assertEqual(report["findings"], [])

    def test_lint_rejects_tampered_artifact_hash(self):
        manifest = self.compile()
        manifest["artifact"]["description"] = "tampered"
        with self.assertRaises(SkillBuildError):
            lint_compiled_skill(
                manifest,
                allowed_tool_refs=TOOLS,
                registered_schema_refs=SCHEMAS,
            )

    def test_lint_rejects_execution_or_publication_enablement(self):
        for field in ("execution_enabled", "publication_enabled"):
            manifest = self.compile()
            manifest[field] = True
            with self.subTest(field=field), self.assertRaises(SkillBuildError):
                lint_compiled_skill(
                    manifest,
                    allowed_tool_refs=TOOLS,
                    registered_schema_refs=SCHEMAS,
                )

    def test_compiler_rejects_unregistered_tool(self):
        spec = skill()
        spec["tool_refs"] = ["research.unregistered"]
        with self.assertRaises(SkillBuildError):
            self.compile(spec)


if __name__ == "__main__":
    unittest.main()
