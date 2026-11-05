const TASK_TYPES = new Set(["video_generation", "video_analysis", "video_edit_export", "video_planning"]);
const PROVIDER_STATES = new Set(["research", "blocked", "approved"]);
function isHttpsUrl(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function isIsoDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function validSlug(value) { return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,62}$/.test(value); }

export function createProviderRegistry() {
  const providers = new Map();
  return Object.freeze({
    register(manifest, adapter) {
      if (!manifest || !validSlug(manifest.id)) throw new TypeError("invalid_provider_id");
      if (providers.has(manifest.id)) throw new TypeError("provider_already_registered");
      if (typeof manifest.version !== "string" || !manifest.version.trim()) throw new TypeError("provider_version_required");
      if (!Array.isArray(manifest.taskTypes) || manifest.taskTypes.length === 0 || manifest.taskTypes.some((task) => !TASK_TYPES.has(task))) throw new TypeError("invalid_provider_task_types");
      if (!PROVIDER_STATES.has(manifest.reviewStatus)) throw new TypeError("invalid_provider_review_status");
      if (!manifest.license || typeof manifest.license.commercialUse !== "boolean" || !isHttpsUrl(manifest.license.sourceUrl) || !isIsoDate(manifest.license.reviewedAt)) throw new TypeError("provider_license_evidence_required");
      if (!manifest.compute || typeof manifest.compute.zeroCostVerified !== "boolean" || !isHttpsUrl(manifest.compute.evidenceUrl) || !isIsoDate(manifest.compute.verifiedAt)) throw new TypeError("provider_compute_evidence_required");
      if (!manifest.approval || typeof manifest.approval.reviewer !== "string" || !manifest.approval.reviewer.trim() || !isIsoDate(manifest.approval.reviewedAt) || !Array.isArray(manifest.approval.evidenceRefs) || manifest.approval.evidenceRefs.length < 1 || manifest.approval.evidenceRefs.some((url) => !isHttpsUrl(url))) throw new TypeError("provider_independent_review_evidence_required");
      if (!adapter || typeof adapter.invoke !== "function") throw new TypeError("provider_adapter_required");
      providers.set(manifest.id, { manifest: structuredClone(manifest), adapter });
      return manifest.id;
    },
    list() {
      return [...providers.values()].map(({ manifest }) => ({
        id: manifest.id, version: manifest.version, taskTypes: [...manifest.taskTypes], reviewStatus: manifest.reviewStatus,
        commercialUse: manifest.license.commercialUse, zeroCostVerified: manifest.compute.zeroCostVerified,
        eligible: manifest.reviewStatus === "approved" && manifest.license.commercialUse === true && manifest.compute.zeroCostVerified === true && manifest.approval.evidenceRefs.length > 0,
      }));
    },
    async invoke(taskType, payload, { executionEnabled = false } = {}) {
      if (!executionEnabled) throw new Error("provider_execution_disabled");
      if (!TASK_TYPES.has(taskType)) throw new TypeError("unsupported_provider_task_type");
      const selected = [...providers.values()].find(({ manifest }) => manifest.taskTypes.includes(taskType) && manifest.reviewStatus === "approved" && manifest.license.commercialUse === true && manifest.compute.zeroCostVerified === true && manifest.approval.evidenceRefs.length > 0);
      if (!selected) throw new Error("approved_zero_cost_provider_unavailable");
      return selected.adapter.invoke(taskType, payload);
    },
  });
}
