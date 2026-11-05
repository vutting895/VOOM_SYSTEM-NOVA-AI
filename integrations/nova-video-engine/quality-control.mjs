const ALLOWED_ASSETS = new Set(["video/mp4"]);

function safeAssetPath(value) {
  if (typeof value !== "string" || !value.trim() || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "." || !part)) return false;
  return true;
}

export function validateDirectorTimeline(plan) {
  const issues = [];
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length < 1 || plan.scenes.length > 12) return { valid: false, issues: ["invalid_scene_count"] };
  if (plan.frameRate !== 24) issues.push("unsupported_frame_rate");
  let cursor = 0;
  for (const [index, scene] of plan.scenes.entries()) {
    if (scene.order !== index + 1) issues.push("scene_order_mismatch:" + scene.sceneId);
    if (scene.startFrame !== cursor) issues.push("timeline_gap_or_overlap:" + scene.sceneId);
    if (!Number.isInteger(scene.frameCount) || scene.frameCount < 24 || scene.frameCount > 121) issues.push("invalid_frame_count:" + scene.sceneId);
    if (scene.endFrameExclusive !== scene.startFrame + scene.frameCount) issues.push("scene_frame_range_mismatch:" + scene.sceneId);
    if (!scene.visualPrompt || typeof scene.visualPrompt !== "string" || scene.visualPrompt.length > 4000) issues.push("invalid_visual_prompt:" + scene.sceneId);
    if (!scene.continuityGroup) issues.push("missing_continuity_group:" + scene.sceneId);
    cursor = scene.endFrameExclusive;
  }
  if (cursor !== plan.totalFrames) issues.push("total_frame_count_mismatch");
  if (Math.abs(cursor / plan.frameRate - plan.durationSeconds) > 0.001) issues.push("timeline_duration_mismatch");
  return { valid: issues.length === 0, issues, totalFrames: cursor, durationSeconds: cursor / (plan.frameRate || 1) };
}

export function validateGeneratedAssets(plan, assets) {
  const issues = [];
  if (!plan || !Array.isArray(plan.scenes) || !Array.isArray(assets)) return { valid: false, issues: ["invalid_asset_validation_input"] };
  const expected = new Map(plan.scenes.map((scene) => [scene.sceneId, scene]));
  const seen = new Set();
  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || !expected.has(asset.sceneId)) { issues.push("unexpected_scene_asset"); continue; }
    if (seen.has(asset.sceneId)) issues.push("duplicate_scene_asset:" + asset.sceneId);
    seen.add(asset.sceneId);
    const scene = expected.get(asset.sceneId);
    if (!ALLOWED_ASSETS.has(asset.contentType)) issues.push("unsupported_asset_content_type:" + asset.sceneId);
    if (!safeAssetPath(asset.assetPath)) issues.push("unsafe_asset_path:" + asset.sceneId);
    if (Number(asset.width) <= 0 || Number(asset.height) <= 0) issues.push("invalid_dimensions:" + asset.sceneId);
    if (Number(asset.frameRate) !== plan.frameRate) issues.push("frame_rate_mismatch:" + asset.sceneId);
    if (!Number.isFinite(Number(asset.durationSeconds)) || Math.abs(Number(asset.durationSeconds) - scene.durationSeconds) > 0.1) issues.push("clip_duration_mismatch:" + asset.sceneId);
    if (asset.continuityGroup !== scene.continuityGroup) issues.push("continuity_group_mismatch:" + asset.sceneId);
  }
  for (const sceneId of expected.keys()) if (!seen.has(sceneId)) issues.push("missing_scene_asset:" + sceneId);
  return { valid: issues.length === 0, issues, expectedAssets: expected.size, receivedAssets: assets.length };
}

export function createQualityReport(plan, assets = null) {
  const timeline = validateDirectorTimeline(plan);
  const media = assets === null ? { valid: false, issues: ["media_assets_not_supplied"] } : validateGeneratedAssets(plan, assets);
  const issues = [...timeline.issues, ...media.issues];
  return Object.freeze({
    schemaVersion: "nova.video-qc.v1",
    status: issues.length === 0 ? "passed" : "blocked",
    verificationLevel: assets === null ? "timeline_only" : "metadata_only",
    issues: Object.freeze(issues),
    timeline: Object.freeze(timeline),
    media: Object.freeze(media),
    executionEnabled: false, estimatedCost: 0,
  });
}
