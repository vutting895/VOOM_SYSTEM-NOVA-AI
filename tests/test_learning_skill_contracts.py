import copy
import unittest

from workers.learning_universe.observations import (
    LearningObservationError,
    validate_observation,
)
from workers.learning_universe.skill_spec import (
    SkillSpecError,
    skill_content_sha256,
    validate_skill_spec,
)


NOW = "2026-10-31T09:00:00+07:00"
TOOLS = {"research.search_public", "research.read_approved_source", "knowledge.retrieve_owner"}
SCHEMAS = {"research.query.v1", "research.result.v1"}


def observation(source_type="external_provider"):
    external = source_type == "external_provider"
    return {
        "contract": "nova.learning-observation.v1",
        "observation_id": "obs-0001",
        "source_type": source_type,
        "source_id": "gemini-adapter" if external else "research-agent",
        "source_version": "1.2.0",
        "provider_id": "gemini" if external else None,
        "provider_model": "gemini-flash-latest" if external else None,
        "provider_version": "api-v1beta" if external else None,
        "fallback_from": None,
        "task_class": "research",
        "outcome": "success",
        "occurred_at": NOW,
        "policy_version": "learning-policy.v1",
        "sanitization_receipt_id": "redaction-001",
        "data_minimized": True,
        "evidence_refs": ["research-source:abc123", "evaluation:run-001"],
        "quality_signals": {"groundedness": 0.9, "policy_compliance": 1.0, "latency_ms": 320},
    }


def skill():
    return {
        "contract": "nova.skill.v1",
        "skill_id": "research-summarizer",
        "version": "1.0.0",
        "display_name": "Research Summarizer",
        "description": "Summarizes approved research sources into a typed draft.",
        "task_intents": ["research"],
        "input_schema_ref": "research.query.v1",
        "output_schema_ref": "research.result.v1",
        "tool_refs": ["research.search_public", "research.read_approved_source"],
        "data_scope": "public_research",
        "preconditions": ["user_authenticated", "sources_allowlisted"],
        "postconditions": ["summary_has_source_refs"],
        "failure_modes": ["source_unavailable", "schema_invalid"],
        "timeout_ms": 15000,
        "max_steps": 6,
        "max_tool_calls": 4,
        "evidence_refs": ["research-source:abc123"],
        "evaluation_report_ref": None,
        "policy_version": "skill-policy.v1",
        "research_only": True,
    }


class LearningObservationContractTests(unittest.TestCase):
    def test_accepts_external_provider_observation_with_fallback_provenance(self):
        value = observation()
        value["provider_id"] = "cloudflare_workers_ai"
        value["provider_model"] = "@cf/meta/llama"
        value["fallback_from"] = "gemini"
        validated = validate_observation(value)
        self.assertEqual(validated["provider_id"], "cloudflare_workers_ai")
        self.assertEqual(validated["fallback_from"], "gemini")

    def test_accepts_internal_agent_observation_without_provider_fields(self):
        validated = validate_observation(observation("internal_agent"))
        self.assertEqual(validated["source_type"], "internal_agent")
        self.assertIsNone(validated["provider_id"])

    def test_rejects_raw_transcript_or_unknown_fields(self):
        value = observation()
        value["transcript"] = "private conversation"
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_tenant_identity_in_observation_payload(self):
        value = observation()
        value["tenant_id"] = "tenant-a"
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_missing_provider_provenance(self):
        value = observation()
        value["provider_model"] = None
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_provider_metadata_on_internal_agent_event(self):
        value = observation("internal_agent")
        value["provider_id"] = "gemini"
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_naive_timestamp(self):
        value = observation()
        value["occurred_at"] = "2026-10-31T09:00:00"
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_url_as_evidence_reference(self):
        value = observation()
        value["evidence_refs"] = ["https://example.com/private"]
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_unbounded_quality_metric(self):
        value = observation()
        value["quality_signals"]["groundedness"] = 1.5
        with self.assertRaises(LearningObservationError):
            validate_observation(value)

    def test_rejects_unhashable_enum_values_without_crashing(self):
        for key in ("source_type", "outcome", "task_class", "provider_id", "fallback_from"):
            value = observation()
            value[key] = {"unexpected": "object"}
            with self.subTest(key=key), self.assertRaises(LearningObservationError):
                validate_observation(value)

    def test_rejects_untrusted_sanitization_claim(self):
        value = observation()
        value["data_minimized"] = False
        with self.assertRaises(LearningObservationError):
            validate_observation(value)


class AutoGenSkillContractTests(unittest.TestCase):
    def test_accepts_allowlisted_declarative_research_skill(self):
        validated = validate_skill_spec(
            skill(),
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        self.assertTrue(validated["research_only"])
        self.assertEqual(validated["tool_refs"], ["research.search_public", "research.read_approved_source"])

    def test_rejects_generated_code_or_unknown_fields(self):
        value = skill()
        value["python_code"] = "import os"
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_rejects_tool_outside_server_owned_allowlist(self):
        value = skill()
        value["tool_refs"] = ["research.search_public", "mcp.run_arbitrary"]
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_rejects_broker_and_execution_tool_even_if_allowlisted(self):
        value = skill()
        value["tool_refs"] = ["broker.order_send"]
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(
                value,
                allowed_tool_refs={"broker.order_send"},
                registered_schema_refs=SCHEMAS,
            )

    def test_rejects_unregistered_schema(self):
        value = skill()
        value["output_schema_ref"] = "arbitrary.schema"
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_rejects_unhashable_data_scope_without_crashing(self):
        value = skill()
        value["data_scope"] = {"tenant": "all"}
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_rejects_cross_tenant_scope(self):
        value = skill()
        value["data_scope"] = "all_tenants"
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_rejects_privilege_or_execution_flags(self):
        value = skill()
        value["research_only"] = False
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_rejects_unbounded_execution_budget(self):
        value = skill()
        value["max_steps"] = 1000
        with self.assertRaises(SkillSpecError):
            validate_skill_spec(value, allowed_tool_refs=TOOLS, registered_schema_refs=SCHEMAS)

    def test_content_hash_is_stable_and_changes_with_content(self):
        value = validate_skill_spec(
            skill(),
            allowed_tool_refs=TOOLS,
            registered_schema_refs=SCHEMAS,
        )
        reordered = dict(reversed(list(value.items())))
        self.assertEqual(skill_content_sha256(value), skill_content_sha256(reordered))
        changed = copy.deepcopy(value)
        changed["description"] = "Different description."
        self.assertNotEqual(skill_content_sha256(value), skill_content_sha256(changed))


if __name__ == "__main__":
    unittest.main()
