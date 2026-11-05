function validHttps(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function validHash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value); }
function validDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function text(value, field, maxLength = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new TypeError("invalid_" + field);
  return value.trim();
}

export function validateNOVAAdaptationDataset(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { eligible: false, issues: ["dataset_manifest_required"], assetCount: 0 };
  if (manifest.schemaVersion !== "nova.video-training-dataset.v1") issues.push("unsupported_dataset_schema");
  if (!manifest.datasetId || typeof manifest.datasetId !== "string") issues.push("dataset_id_required");
  if (!manifest.ownerId || typeof manifest.ownerId !== "string") issues.push("dataset_owner_required");
  if (!validDate(manifest.reviewedAt)) issues.push("dataset_review_timestamp_required");
  if (!manifest.provenance || !validHttps(manifest.provenance.evidenceUrl)) issues.push("dataset_provenance_evidence_required");
  if (manifest.rightsReview?.approved !== true || !validHttps(manifest.rightsReview.evidenceUrl) || !manifest.rightsReview.reviewer) issues.push("dataset_rights_review_required");
  if (manifest.privacyReview?.approved !== true || !validHttps(manifest.privacyReview.evidenceUrl) || !manifest.privacyReview.reviewer) issues.push("dataset_privacy_review_required");
  if (!Array.isArray(manifest.assets) || manifest.assets.length < 1 || manifest.assets.length > 10000) return { eligible: false, issues: [...issues, "dataset_assets_required"], assetCount: 0 };
  const seen = new Set();
  for (const [index, asset] of manifest.assets.entries()) {
    const prefix = "asset_" + (index + 1) + "_";
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) { issues.push(prefix + "invalid"); continue; }
    if (typeof asset.assetId !== "string" || !asset.assetId.trim() || seen.has(asset.assetId)) issues.push(prefix + "invalid_or_duplicate_id");
    else seen.add(asset.assetId);
    if (!validHash(asset.sha256)) issues.push(prefix + "sha256_required");
    if (!validHttps(asset.sourceEvidenceUrl)) issues.push(prefix + "source_evidence_required");
    if (asset.contentType !== "video/mp4" && asset.contentType !== "image/png" && asset.contentType !== "image/jpeg" && asset.contentType !== "image/webp") issues.push(prefix + "unsupported_media_type");
    if (asset.rights?.allowsModelTraining !== true || asset.rights?.allowsCommercialUse !== true || !validHttps(asset.rights.evidenceUrl)) issues.push(prefix + "training_and_commercial_rights_required");
    if (asset.privacy?.reviewed !== true) issues.push(prefix + "privacy_review_required");
    if (asset.privacy?.containsIdentifiablePeople === true) {
      const consent = asset.privacy.consent;
      const requiredScopes = ["model_training", "commercial_use", "retention"];
      if (!consent || consent.granted !== true || consent.revoked === true || !validHttps(consent.evidenceUrl) || requiredScopes.some((scope) => !Array.isArray(consent.scopes) || !consent.scopes.includes(scope))) {
        issues.push(prefix + "explicit_person_consent_required");
      }
    }
  }
  return Object.freeze({ eligible: issues.length === 0, issues: Object.freeze(issues), assetCount: manifest.assets.length });
}

export function createNOVAStyleAdaptationPlan({ datasetManifest, model, compute, review } = {}) {
  const dataset = validateNOVAAdaptationDataset(datasetManifest);
  const blockers = [...dataset.issues];
  if (!model || model.parameterEfficientFineTuning !== true) blockers.push("model_finetuning_support_not_verified");
  if (model?.licenseAllowsDerivatives !== true) blockers.push("model_derivative_license_not_verified");
  if (!compute || compute.zeroCostVerified !== true || compute.hardwareVerified !== true) blockers.push("zero_cost_training_compute_not_verified");
  if (!review || review.independentReviewApproved !== true || review.securityReviewApproved !== true) blockers.push("independent_and_security_reviews_required");
  return Object.freeze({
    schemaVersion: "nova.video-adaptation-plan.v1",
    status: blockers.length === 0 ? "ready_for_manual_approval" : "blocked",
    modelId: model?.modelId ?? null,
    datasetId: datasetManifest?.datasetId ?? null,
    datasetAssetCount: dataset.assetCount,
    blockers: Object.freeze(blockers),
    stages: Object.freeze(["dataset_rights_validation", "model_capability_review", "compute_verification", "adapter_training_design", "benchmark_and_regression", "manual_release_approval"]),
    executionEnabled: false, estimatedCost: 0,
  });
}
