import tempfile
import unittest
from pathlib import Path

from scripts.release_control import (
    EVIDENCE_FILES,
    EvidenceError,
    create_release_marker,
    validate_release_marker,
    write_immutable_json,
)


class ReleaseControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for relative in EVIDENCE_FILES:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture:" + relative + "\n", encoding="utf-8")
        self.sha = "a" * 40

    def tearDown(self):
        self.temp.cleanup()

    def marker(self):
        return create_release_marker(
            repository="vutting895/VOOM_SYSTEM-NOVA-AI",
            commit_sha=self.sha,
            root=self.root,
            review_evidence_reference="https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/999",
            approval_build_url="https://app.circleci.com/pipelines/github/vutting895/VOOM_SYSTEM-NOVA-AI/123",
            created_at_utc="2026-11-26T00:00:00+00:00",
        )

    def test_marker_binds_exact_repository_sha_and_workflow(self):
        marker = self.marker()
        validate_release_marker(
            marker, repository="vutting895/VOOM_SYSTEM-NOVA-AI",
            commit_sha=self.sha, root=self.root,
        )
        self.assertEqual(marker["workflow_version"], "wo-2026-11-26-008/v1")
        self.assertEqual(len(marker["artifact_sha256"]), len(EVIDENCE_FILES))

    def test_marker_rejects_stale_sha(self):
        with self.assertRaises(EvidenceError):
            validate_release_marker(
                self.marker(), repository="vutting895/VOOM_SYSTEM-NOVA-AI",
                commit_sha="b" * 40, root=self.root,
            )

    def test_marker_rejects_changed_artifact(self):
        marker = self.marker()
        (self.root / EVIDENCE_FILES[0]).write_text("tampered\n", encoding="utf-8")
        with self.assertRaises(EvidenceError):
            validate_release_marker(
                marker, repository="vutting895/VOOM_SYSTEM-NOVA-AI",
                commit_sha=self.sha, root=self.root,
            )

    def test_marker_id_is_stable_for_same_inputs(self):
        first = self.marker()
        second = self.marker()
        self.assertEqual(first["marker_id"], second["marker_id"])

    def test_marker_requires_review_reference_and_circleci_approval_url(self):
        with self.assertRaises(EvidenceError):
            create_release_marker(
                repository="vutting895/VOOM_SYSTEM-NOVA-AI",
                commit_sha=self.sha, root=self.root,
                review_evidence_reference="not-a-url",
                approval_build_url="https://app.circleci.com/pipelines/123",
            )

    def test_immutable_write_is_idempotent_but_rejects_replacement(self):
        target = self.root / "release-evidence/marker.json"
        payload = {"marker_id": "stable"}
        self.assertEqual(write_immutable_json(target, payload), "created")
        self.assertEqual(write_immutable_json(target, payload), "already_exists_identical")
        with self.assertRaises(EvidenceError):
            write_immutable_json(target, {"marker_id": "different"})


if __name__ == "__main__":
    unittest.main()
