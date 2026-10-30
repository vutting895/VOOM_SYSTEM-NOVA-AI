"""Synthetic contract tests; no disk, network, database or provider access."""
import unittest

from integrations.nova_data_guardian.contracts import (
    ContractError,
    SCHEMA_VERSION,
    validate_job_request,
    validate_job_result,
)

JOB_ID = "123e4567-e89b-42d3-a456-426614174000"
OBJECT_A = "obj_abcdefgh1234"
OBJECT_B = "obj_ijklmnop5678"


def request(operation="scan", object_refs=None, options=None):
    return {
        "schema_version": SCHEMA_VERSION,
        "job_id": JOB_ID,
        "idempotency_key": "guardian-job-key-0001",
        "operation": operation,
        "object_refs": object_refs if object_refs is not None else [OBJECT_A],
        "options": options if options is not None else {},
    }


class DataGuardianRequestContractTests(unittest.TestCase):
    def test_allowlisted_read_only_operations_validate(self):
        for operation in ("inventory", "scan"):
            with self.subTest(operation=operation):
                self.assertEqual(validate_job_request(request(operation))["operation"], operation)

    def test_transform_requires_allowlisted_format_and_bounded_dimensions(self):
        result = validate_job_request(request("transform", options={
            "target_format": "webp", "width": 1600, "height": 900, "quality": 82
        }))
        self.assertEqual(result["options"]["target_format"], "webp")
        with self.assertRaisesRegex(ContractError, "target_format_not_allowed"):
            validate_job_request(request("transform", options={"target_format": "exe"}))
        with self.assertRaisesRegex(ContractError, "transform_dimension_invalid"):
            validate_job_request(request("transform", options={"target_format": "png", "width": 0}))
        with self.assertRaisesRegex(ContractError, "transform_quality_invalid"):
            validate_job_request(request("transform", options={"target_format": "jpeg", "quality": 101}))

    def test_cleanup_is_candidate_only_and_rejects_delete_controls(self):
        self.assertEqual(
            validate_job_request(request("cleanup_candidate", options={"reason_class": "cache"}))
            ["options"]["reason_class"],
            "cache",
        )
        with self.assertRaisesRegex(ContractError, "options_fields_not_allowed"):
            validate_job_request(request("cleanup_candidate", options={"reason_class": "cache", "delete": True}))

    def test_backup_class_is_allowlisted(self):
        self.assertEqual(
            validate_job_request(request("backup", options={"backup_class": "critical"}))
            ["options"]["backup_class"],
            "critical",
        )
        with self.assertRaises(ContractError):
            validate_job_request(request("backup", options={"backup_class": "unlimited"}))

    def test_restore_is_forced_to_isolated_target(self):
        self.assertEqual(
            validate_job_request(request("restore", options={"restore_target": "isolated"}))
            ["options"]["restore_target"],
            "isolated",
        )
        with self.assertRaisesRegex(ContractError, "restore_target_must_be_isolated"):
            validate_job_request(request("restore", options={"restore_target": "production"}))

    def test_rejects_client_supplied_identity_paths_urls_and_credentials(self):
        for field, value in (
            ("tenant_id", "tenant-a"),
            ("owner_id", "user-a"),
            ("path", "../../etc/passwd"),
            ("url", "https://example.invalid/file"),
            ("credential", "never-accepted"),
        ):
            with self.subTest(field=field):
                payload = request()
                payload[field] = value
                with self.assertRaisesRegex(ContractError, "request_fields_not_allowed"):
                    validate_job_request(payload)

    def test_rejects_unknown_nested_options(self):
        with self.assertRaisesRegex(ContractError, "options_fields_not_allowed"):
            validate_job_request(request("scan", options={"force": True}))

    def test_object_references_are_opaque_bounded_and_unique(self):
        self.assertEqual(len(validate_job_request(request(object_refs=[OBJECT_A, OBJECT_B]))["object_refs"]), 2)
        for refs in (["../../secret"], [OBJECT_A, OBJECT_A], [], ["obj_short"]):
            with self.subTest(refs=refs):
                with self.assertRaises(ContractError):
                    validate_job_request(request(object_refs=refs))

    def test_request_ids_and_idempotency_are_validated(self):
        payload = request()
        payload["job_id"] = "not-a-uuid"
        with self.assertRaisesRegex(ContractError, "job_id_invalid"):
            validate_job_request(payload)
        payload = request()
        payload["idempotency_key"] = "tiny"
        with self.assertRaisesRegex(ContractError, "idempotency_key_invalid"):
            validate_job_request(payload)

    def test_rejects_unknown_operation_and_unexpected_fields(self):
        with self.assertRaisesRegex(ContractError, "operation_not_allowed"):
            validate_job_request(request("delete"))
        payload = request()
        payload["arbitrary"] = "value"
        with self.assertRaisesRegex(ContractError, "request_fields_not_allowed"):
            validate_job_request(payload)


class DataGuardianResultContractTests(unittest.TestCase):
    def test_result_accepts_sanitized_integrity_and_scan_metadata(self):
        result = validate_job_result({
            "schema_version": SCHEMA_VERSION,
            "job_id": JOB_ID,
            "state": "verifying",
            "source_sha256": "a" * 64,
            "result_sha256": "b" * 64,
            "scanner_verdict": "indeterminate",
        })
        self.assertEqual(result["scanner_verdict"], "indeterminate")

    def test_scanner_error_must_not_be_misreported_as_clean(self):
        with self.assertRaisesRegex(ContractError, "scanner_verdict_invalid"):
            validate_job_result({
                "schema_version": SCHEMA_VERSION,
                "job_id": JOB_ID,
                "state": "failed",
                "scanner_verdict": "scanner_error",
            })

    def test_result_rejects_file_bytes_and_secret_fields(self):
        payload = {"schema_version": SCHEMA_VERSION, "job_id": JOB_ID, "state": "failed", "file_bytes": "abc"}
        with self.assertRaisesRegex(ContractError, "result_fields_not_allowed"):
            validate_job_result(payload)

    def test_result_rejects_malformed_digest(self):
        payload = {"schema_version": SCHEMA_VERSION, "job_id": JOB_ID, "state": "committed", "source_sha256": "bad"}
        with self.assertRaisesRegex(ContractError, "sha256_invalid"):
            validate_job_result(payload)


if __name__ == "__main__":
    unittest.main(verbosity=2)
