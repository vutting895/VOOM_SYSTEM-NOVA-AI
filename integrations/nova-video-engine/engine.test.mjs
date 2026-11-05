import test from "node:test";
import assert from "node:assert/strict";
import { createNovaVideoEngine, createStoryboard, ENGINE_STATES } from "./engine.mjs";
import { buildFfmpegArgs, resolveWithinRoot } from "./ffmpeg-renderer.mjs";

const brief = {
  title: "NOVA product story", aspectRatio: "9:16", durationSeconds: 10,
  scenes: [
    { description: "Opening product shot", imagePath: "assets/scene-1.png" },
    { description: "Close-up detail", imagePath: "assets/scene-2.jpg" },
  ],
};

test("creates a deterministic, duration-bounded storyboard", () => {
  const first = createStoryboard(brief);
  assert.deepEqual(first, createStoryboard(brief));
  assert.equal(first.scenes.length, 2);
  assert.equal(first.scenes[0].startSeconds, 0);
  assert.equal(first.scenes[1].endSeconds, 10);
  assert.equal(first.executionEnabled, false);
  assert.equal(first.estimatedCost, 0);
});

test("rejects malformed briefs and excessive scenes", () => {
  assert.throws(() => createStoryboard({ ...brief, durationSeconds: 0 }), /invalid_duration_seconds/);
  assert.throws(() => createStoryboard({ ...brief, scenes: [] }), /invalid_scene_count/);
  assert.throws(() => createStoryboard({ ...brief, scenes: Array(13).fill({ description: "x" }) }), /invalid_scene_count/);
});

test("keeps rendering blocked by default even when a renderer is supplied", async () => {
  let calls = 0;
  const engine = createNovaVideoEngine({ renderer: { render: async () => { calls += 1; } } });
  const result = await engine.render(brief);
  assert.equal(result.state, ENGINE_STATES.BLOCKED);
  assert.equal(result.reason, "execution_disabled");
  assert.equal(calls, 0);
});

test("does not pretend to render when no renderer is configured", async () => {
  const result = await createNovaVideoEngine({ executionEnabled: true }).render(brief);
  assert.equal(result.state, ENGINE_STATES.BLOCKED);
  assert.equal(result.reason, "renderer_unavailable");
});

test("rejects media path traversal and absolute paths", () => {
  assert.throws(() => resolveWithinRoot("/workspace", "../secret.png"), /media_path_outside_workspace/);
  assert.throws(() => resolveWithinRoot("/workspace", "/tmp/secret.png"), /relative_media_path_required/);
});

test("builds an FFmpeg command without shell interpolation", () => {
  const { args, outputPath } = buildFfmpegArgs(createStoryboard(brief), "/workspace");
  assert.equal(args.includes("-filter_complex"), true);
  assert.equal(args.includes("-an"), true);
  assert.equal(args.includes("/workspace/assets/scene-1.png"), true);
  assert.equal(outputPath, "/workspace/renders/video.mp4");
  assert.equal(args.some((arg) => arg.includes("&&") || arg.includes("; rm")), false);
});

test("requires each scene to have a supported still-image input", () => {
  const noImage = createStoryboard({ ...brief, scenes: [{ description: "No image supplied" }] });
  assert.throws(() => buildFfmpegArgs(noImage, "/workspace"), /scene_image_required_1/);
  assert.throws(() => buildFfmpegArgs({
    ...noImage, scenes: [{ ...noImage.scenes[0], imagePath: "assets/clip.mp4" }],
  }, "/workspace"), /unsupported_scene_image_type/);
});

import { createProviderRegistry } from "./provider-registry.mjs";

test("provider registry fails closed until license and zero-cost evidence are approved", async () => {
  const registry = createProviderRegistry();
  let calls = 0;
  registry.register({
    id: "candidate-provider", version: "0.0.1", taskTypes: ["video_generation"],
    reviewStatus: "research", license: { commercialUse: false, sourceUrl: "https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt", reviewedAt: "2026-11-05" }, compute: { zeroCostVerified: false, evidenceUrl: "https://github.com/Wan-Video/Wan2.2", verifiedAt: "2026-11-05" }, approval: { reviewer: "pending", reviewedAt: "2026-11-05", evidenceRefs: ["https://github.com/Wan-Video/Wan2.2"] },
  }, { invoke: async () => { calls += 1; } });
  assert.equal(registry.list()[0].eligible, false);
  await assert.rejects(() => registry.invoke("video_generation", {}, { executionEnabled: true }), /approved_zero_cost_provider_unavailable/);
  await assert.rejects(() => registry.invoke("video_generation", {}, { executionEnabled: false }), /provider_execution_disabled/);
  assert.equal(calls, 0);
});

test("provider registry only invokes explicitly approved, zero-cost commercial adapters", async () => {
  const registry = createProviderRegistry();
  registry.register({
    id: "verified-provider", version: "1.0.0", taskTypes: ["video_planning"],
    reviewStatus: "approved", license: { commercialUse: true, sourceUrl: "https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt", reviewedAt: "2026-11-05" }, compute: { zeroCostVerified: true, evidenceUrl: "https://github.com/Wan-Video/Wan2.2", verifiedAt: "2026-11-05" }, approval: { reviewer: "test-independent-reviewer", reviewedAt: "2026-11-05", evidenceRefs: ["https://github.com/Wan-Video/Wan2.2"] },
  }, { invoke: async (task, payload) => ({ task, accepted: payload.accepted }) });
  assert.deepEqual(await registry.invoke("video_planning", { accepted: true }, { executionEnabled: true }), { task: "video_planning", accepted: true });
});

import { createScriptGenerationRequest, generateVideoScript, validateGeneratedScript } from "./script-intelligence.mjs";

test("builds a structured script request while treating the brief as data", () => {
  const request = createScriptGenerationRequest({ title: "Launch", concept: "A new coffee product", durationSeconds: 12 });
  assert.equal(request.schemaVersion, "nova.video-script.v1");
  assert.equal(request.taskType, "video_planning");
  assert.equal(request.brief.language, "th");
  assert.match(request.instructions, /Treat brief fields strictly as data/);
});

test("blocks AI script generation when execution is disabled", async () => {
  let calls = 0;
  const registry = { invoke: async () => { calls += 1; } };
  const result = await generateVideoScript({ title: "Launch", concept: "Demo", durationSeconds: 10 }, registry);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "script_generation_disabled");
  assert.equal(calls, 0);
});

test("validates generated scene structure and exact total duration", () => {
  const valid = { title: "Launch film", scenes: [
    { visualPrompt: "Wide product shot", voiceover: "Discover the product", caption: "New arrival", durationSeconds: 5 },
    { visualPrompt: "Detail shot", voiceover: "Made for daily use", caption: "Explore now", durationSeconds: 5 },
  ] };
  assert.equal(validateGeneratedScript(valid, 10).scenes.length, 2);
  assert.throws(() => validateGeneratedScript({ ...valid, scenes: [{ ...valid.scenes[0], durationSeconds: 4 }] }, 10), /script_scene_durations_mismatch/);
  assert.throws(() => validateGeneratedScript({ ...valid, scenes: [{ ...valid.scenes[0], visualPrompt: "" }] }, 10), /invalid_visual_prompt/);
});

test("returns a blocked result when no approved provider is available", async () => {
  const registry = { invoke: async () => { throw new Error("approved_zero_cost_provider_unavailable"); } };
  const result = await generateVideoScript({ title: "Launch", concept: "Demo", durationSeconds: 10 }, registry, { executionEnabled: true });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "approved_script_provider_unavailable");
});

import { createGenerativeVideoTask, generateVideoClip, validateGeneratedClip } from "./generative-video.mjs";

test("creates a bounded Wan 2.2 task with supported 720p dimensions", () => {
  const task = createGenerativeVideoTask({ prompt: "A cinematic product reveal" });
  assert.equal(task.modelId, "Wan-AI/Wan2.2-TI2V-5B");
  assert.equal(task.width, 704);
  assert.equal(task.height, 1280);
  assert.equal(task.frameRate, 24);
  assert.equal(task.executionEnabled, false);
});

test("rejects unsupported Wan aspect ratios and clip durations", () => {
  assert.throws(() => createGenerativeVideoTask({ prompt: "test", aspectRatio: "1:1" }), /wan22_unsupported_aspect_ratio/);
  assert.throws(() => createGenerativeVideoTask({ prompt: "test", durationSeconds: 20 }), /wan22_clip_duration_out_of_range/);
});

test("keeps generative inference disabled without invoking a provider", async () => {
  let calls = 0;
  const result = await generateVideoClip({ prompt: "A sunrise over a city" }, { invoke: async () => { calls += 1; } });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "video_generation_disabled");
  assert.equal(calls, 0);
});

test("validates generated MP4 metadata and rejects unsafe asset paths", () => {
  const task = createGenerativeVideoTask({ prompt: "A product reveal", durationSeconds: 5 });
  const valid = { assetPath: "jobs/job-1/output.mp4", contentType: "video/mp4", width: 704, height: 1280, frameRate: 24, durationSeconds: 5 };
  assert.equal(validateGeneratedClip(valid, task).assetPath, "jobs/job-1/output.mp4");
  assert.throws(() => validateGeneratedClip({ ...valid, assetPath: "../private.mp4" }, task), /invalid_generated_asset_path/);
  assert.throws(() => validateGeneratedClip({ ...valid, width: 1920 }, task), /generated_clip_dimensions_mismatch/);
});

test("does not claim generated output when no approved provider is available", async () => {
  const result = await generateVideoClip({ prompt: "A product reveal" }, { invoke: async () => { throw new Error("approved_zero_cost_provider_unavailable"); } }, { executionEnabled: true });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "approved_zero_cost_video_provider_unavailable");
});

test("rejects unsafe or unsupported source images for image-to-video", () => {
  assert.throws(() => createGenerativeVideoTask({ prompt: "Animate this", imagePath: "../private.png" }), /invalid_input_image_path/);
  assert.throws(() => createGenerativeVideoTask({ prompt: "Animate this", imagePath: "/tmp/source.png" }), /invalid_input_image_path/);
  assert.throws(() => createGenerativeVideoTask({ prompt: "Animate this", imagePath: "assets/source.mp4" }), /unsupported_input_image_type/);
});

import { createDirectorPlan } from "./director-intelligence.mjs";
import { createNOVAProductionPlan } from "./pipeline-orchestrator.mjs";
import { createInMemoryVideoJobStore } from "./job-lifecycle.mjs";
import { createQualityReport, validateGeneratedAssets, validateDirectorTimeline } from "./quality-control.mjs";

const creativeBrief = { title: "NOVA launch film", concept: "Introduce a new handcrafted coffee cup", durationSeconds: 15, aspectRatio: "9:16", goal: "product_ad", verifiedFacts: ["Handcrafted ceramic cup"] };

test("NOVA Director creates a deterministic multi-shot plan with frame-accurate continuity", () => {
  const first = createDirectorPlan(creativeBrief);
  const second = createDirectorPlan(creativeBrief);
  assert.deepEqual(first, second);
  assert.equal(first.engine, "NOVA Director Intelligence");
  assert.equal(first.scenes.length, 3);
  assert.equal(first.totalFrames, 360);
  assert.equal(first.scenes[0].startFrame, 0);
  assert.equal(first.scenes[2].endFrameExclusive, 360);
  assert.equal(first.scenes.every((scene) => scene.durationSeconds <= 5.05), true);
  assert.equal(first.scenes.every((scene) => scene.continuityGroup === "subject-lock-01"), true);
  assert.equal(first.executionEnabled, false);
});

test("Director never invents unsupported claims and applies user exclusions", () => {
  const plan = createDirectorPlan({ ...creativeBrief, verifiedFacts: [], mustAvoid: ["medical claims"] });
  assert.match(plan.scenes[0].visualPrompt, /Do not invent specifications/);
  assert.match(plan.scenes[0].negativePrompt, /medical claims/);
});

test("Director rejects overlong plans and script shots that exceed the model clip limit", () => {
  assert.throws(() => createDirectorPlan({ ...creativeBrief, durationSeconds: 90 }), /director_plan_max_duration_60_seconds/);
  const script = { title: "Too long", scenes: [{ visualPrompt: "A long shot", voiceover: "", caption: "", durationSeconds: 15 }] };
  assert.throws(() => createDirectorPlan(creativeBrief, { script }), /script_scene_exceeds_model_clip_limit/);
});

test("production planner creates a staged workflow but keeps every generation task disabled", () => {
  const plan = createNOVAProductionPlan(creativeBrief);
  assert.equal(plan.generationTasks.length, 3);
  assert.equal(plan.generationTasks.every((item) => item.task.executionEnabled === false), true);
  assert.equal(plan.requiresHumanApproval, true);
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.stages.find((stage) => stage.id === "human_approval").status, "required");
  assert.equal(plan.stages.find((stage) => stage.id === "assembly").status, "blocked_waiting_for_clips");
});

test("quality control validates complete generated clips and catches missing or incorrect artifacts", () => {
  const plan = createDirectorPlan(creativeBrief);
  assert.equal(validateDirectorTimeline(plan).valid, true);
  const assets = plan.scenes.map((scene) => ({
    sceneId: scene.sceneId, assetPath: "jobs/job-1/" + scene.sceneId + ".mp4", contentType: "video/mp4",
    width: 704, height: 1280, frameRate: 24, durationSeconds: scene.durationSeconds, continuityGroup: scene.continuityGroup,
  }));
  assert.equal(createQualityReport(plan, assets).status, "passed");
  assert.equal(validateGeneratedAssets(plan, assets.slice(1)).valid, false);
  const bad = assets.map((asset, index) => index === 0 ? { ...asset, width: 1920, assetPath: "../leak.mp4" } : asset);
  const report = createQualityReport(plan, bad);
  assert.equal(report.status, "blocked");
  assert.equal(report.issues.some((issue) => issue.startsWith("resolution_mismatch")), true);
  assert.equal(report.issues.some((issue) => issue.startsWith("unsafe_asset_path")), true);
});

test("video job store enforces tenant scope and idempotent creation", () => {
  const store = createInMemoryVideoJobStore();
  const input = { id: "job-1", tenantId: "tenant-a", projectId: "project-a", idempotencyKey: "request-001", request: { title: "Test" } };
  assert.equal(store.create(input, "2026-11-05T10:00:00.000Z").created, true);
  const duplicate = store.create({ ...input, id: "job-duplicate" }, "2026-11-05T10:01:00.000Z");
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.id, "job-1");
  assert.equal(store.get("job-1", "tenant-b"), null);
  assert.equal(store.list("tenant-b").length, 0);
});

test("video job cannot bypass approval and requires tenant ownership for transitions", () => {
  const store = createInMemoryVideoJobStore();
  store.create({ id: "job-2", tenantId: "tenant-a", projectId: "project-a", idempotencyKey: "request-002", request: {} });
  assert.throws(() => store.transition("job-2", "planning", { actorTenantId: "tenant-b" }), /video_job_tenant_access_denied/);
  store.transition("job-2", "planning", { actorTenantId: "tenant-a" });
  assert.throws(() => store.transition("job-2", "generating", { actorTenantId: "tenant-a" }), /video_job_transition_not_allowed/);
  store.transition("job-2", "approval_required", { actorTenantId: "tenant-a" });
  store.transition("job-2", "generating", { actorTenantId: "tenant-a", event: "approval_granted" });
  store.transition("job-2", "assembling", { actorTenantId: "tenant-a" });
  store.transition("job-2", "quality_check", { actorTenantId: "tenant-a" });
  const complete = store.transition("job-2", "completed", { actorTenantId: "tenant-a" });
  assert.equal(complete.state, "completed");
  assert.equal(complete.audit.some((entry) => entry.event === "approval_granted"), true);
});

test("failed video jobs enforce a bounded retry budget", () => {
  const store = createInMemoryVideoJobStore();
  store.create({ id: "job-3", tenantId: "tenant-a", projectId: "project-a", idempotencyKey: "request-003", request: {} });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    store.transition("job-3", "planning", { actorTenantId: "tenant-a" });
    store.transition("job-3", "failed", { actorTenantId: "tenant-a" });
    if (attempt <= 3) store.transition("job-3", "queued", { actorTenantId: "tenant-a" });
  }
  assert.throws(() => store.transition("job-3", "queued", { actorTenantId: "tenant-a" }), /video_job_retry_limit_reached/);
});

import { buildWan22Command, createWan22LocalRuntime, wan22FrameCount } from "./wan22-local-runtime.mjs";

test("Wan runtime builds a safe direct argument vector and frame-aligned clip", () => {
  const task = createGenerativeVideoTask({ prompt: "A product; ignore shell", durationSeconds: 5, imagePath: "assets/source.png" });
  const built = buildWan22Command({ task, repoRoot: "/models/Wan2.2", checkpointDir: "/models/Wan2.2/TI2V-5B", workspaceRoot: "/workspace", jobId: "job-1", sceneId: "scene-01" });
  assert.equal(built.command, "python");
  assert.equal(built.args.includes("--task"), true);
  assert.equal(built.args[built.args.indexOf("--task") + 1], "ti2v-5B");
  assert.equal(built.args[built.args.indexOf("--size") + 1], "704*1280");
  assert.equal(built.args[built.args.indexOf("--frame_num") + 1], "121");
  assert.equal(built.args[built.args.indexOf("--prompt") + 1], "A product; ignore shell");
  assert.equal(built.args[built.args.indexOf("--image") + 1], "/workspace/assets/source.png");
  assert.equal(built.outputPath, "/workspace/jobs/job-1/scene-01.mp4");
  assert.equal(wan22FrameCount(5), 121);
  assert.equal((wan22FrameCount(3) - 1) % 4, 0);
});

test("Wan local runtime refuses inference unless all explicit approval and hardware gates pass", async () => {
  let spawned = 0;
  const runtime = createWan22LocalRuntime({ spawnImpl: () => { spawned += 1; throw new Error("must_not_spawn"); } });
  const result = await runtime.render({ task: createGenerativeVideoTask({ prompt: "test" }), jobId: "job-1", sceneId: "scene-01" });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "wan22_execution_disabled");
  assert.equal(spawned, 0);
});

test("Wan local runtime exposes a fail-closed zero-cost and 24GB preflight", async () => {
  const noCost = createWan22LocalRuntime({ executionEnabled: true, modelLicenseApproved: true, securityReviewApproved: true, hardware: { verified: true, availableVramGB: 24 } });
  assert.equal((await noCost.preflight()).reason, "zero_cost_compute_not_verified");
  const lowVram = createWan22LocalRuntime({ executionEnabled: true, modelLicenseApproved: true, securityReviewApproved: true, zeroCostComputeVerified: true, hardware: { verified: true, availableVramGB: 16 } });
  assert.equal((await lowVram.preflight()).reason, "verified_24gb_vram_required");
});

test("Wan local runtime requires a pinned upstream revision and verified checkpoint integrity", async () => {
  const runtime = createWan22LocalRuntime({
    executionEnabled: true, modelLicenseApproved: true, securityReviewApproved: true,
    zeroCostComputeVerified: true, hardware: { verified: true, availableVramGB: 24 },
  });
  assert.equal((await runtime.preflight()).reason, "wan22_upstream_revision_not_pinned");
});

import { validateNOVAAdaptationDataset, createNOVAStyleAdaptationPlan } from "./dataset-governance.mjs";

const trainingDataset = {
  schemaVersion: "nova.video-training-dataset.v1", datasetId: "nova-style-v1", ownerId: "owner-a", reviewedAt: "2026-11-05T10:00:00Z",
  provenance: { evidenceUrl: "https://example.com/dataset-provenance" },
  rightsReview: { approved: true, reviewer: "independent-rights-reviewer", evidenceUrl: "https://example.com/rights-review" },
  privacyReview: { approved: true, reviewer: "privacy-reviewer", evidenceUrl: "https://example.com/privacy-review" },
  assets: [{
    assetId: "asset-001", sha256: "a".repeat(64), sourceEvidenceUrl: "https://example.com/source/asset-001",
    contentType: "video/mp4", rights: { allowsModelTraining: true, allowsCommercialUse: true, evidenceUrl: "https://example.com/license/asset-001" },
    privacy: { reviewed: true, containsIdentifiablePeople: true, consent: { granted: true, revoked: false, scopes: ["model_training", "commercial_use", "retention"], evidenceUrl: "https://example.com/consent/asset-001" } },
  }],
};

test("dataset governance accepts only assets with training/commercial rights and scoped consent", () => {
  assert.equal(validateNOVAAdaptationDataset(trainingDataset).eligible, true);
  const missingConsent = structuredClone(trainingDataset);
  missingConsent.assets[0].privacy.consent.scopes = ["model_training"];
  const result = validateNOVAAdaptationDataset(missingConsent);
  assert.equal(result.eligible, false);
  assert.equal(result.issues.includes("asset_1_explicit_person_consent_required"), true);
});

test("dataset governance blocks unlicensed training and missing independent reviews", () => {
  const unlicensed = structuredClone(trainingDataset);
  unlicensed.assets[0].rights.allowsModelTraining = false;
  unlicensed.privacyReview.approved = false;
  const result = validateNOVAAdaptationDataset(unlicensed);
  assert.equal(result.eligible, false);
  assert.equal(result.issues.includes("asset_1_training_and_commercial_rights_required"), true);
  assert.equal(result.issues.includes("dataset_privacy_review_required"), true);
});

test("NOVA style adaptation plan remains blocked until data, model, compute and reviews pass", () => {
  const blocked = createNOVAStyleAdaptationPlan({ datasetManifest: trainingDataset, model: { modelId: "candidate", parameterEfficientFineTuning: false, licenseAllowsDerivatives: true }, compute: { zeroCostVerified: false, hardwareVerified: false }, review: { independentReviewApproved: false, securityReviewApproved: false } });
  assert.equal(blocked.status, "blocked");
  const ready = createNOVAStyleAdaptationPlan({ datasetManifest: trainingDataset, model: { modelId: "candidate", parameterEfficientFineTuning: true, licenseAllowsDerivatives: true }, compute: { zeroCostVerified: true, hardwareVerified: true }, review: { independentReviewApproved: true, securityReviewApproved: true } });
  assert.equal(ready.status, "ready_for_manual_approval");
  assert.equal(ready.executionEnabled, false);
});

import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFileVideoJobStore } from "./file-job-store.mjs";

test("file job store persists lifecycle transitions and recovers idempotency after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nova-video-jobs-"));
  const journalPath = path.join(root, "jobs.jsonl");
  try {
    const store = await createFileVideoJobStore({ journalPath });
    const input = { id: "durable-1", tenantId: "tenant-a", projectId: "project-a", idempotencyKey: "same-request", request: { title: "Persist me" } };
    assert.equal((await store.create(input, "2026-11-05T12:00:00.000Z")).created, true);
    await store.transition("durable-1", "planning", { actorTenantId: "tenant-a", at: "2026-11-05T12:00:01.000Z" });
    await store.transition("durable-1", "approval_required", { actorTenantId: "tenant-a", at: "2026-11-05T12:00:02.000Z" });
    await store.transition("durable-1", "generating", { actorTenantId: "tenant-a", event: "approval_granted", at: "2026-11-05T12:00:03.000Z" });
    assert.equal(store.get("durable-1", "tenant-b"), null);
    assert.equal(store.diagnostics().durability, "fsync_per_event");
    await store.close();
    const restored = await createFileVideoJobStore({ journalPath });
    const job = restored.get("durable-1", "tenant-a");
    assert.equal(job.state, "generating");
    assert.equal(job.version, 3);
    assert.equal(job.audit.some((entry) => entry.event === "approval_granted"), true);
    const duplicate = await restored.create({ ...input, id: "other-id" }, "2026-11-05T12:00:05.000Z");
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.job.id, "durable-1");
    assert.equal(restored.list("tenant-b").length, 0);
    await restored.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("file job store enforces a single writer and closes cleanly", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nova-video-lock-"));
  const journalPath = path.join(root, "jobs.jsonl");
  try {
    const first = await createFileVideoJobStore({ journalPath });
    await assert.rejects(() => createFileVideoJobStore({ journalPath }), /video_job_store_locked_single_writer_required/);
    await first.close();
    const second = await createFileVideoJobStore({ journalPath });
    await second.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("file job store rejects sensitive request fields and corrupt journals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nova-video-journal-"));
  const journalPath = path.join(root, "jobs.jsonl");
  try {
    const store = await createFileVideoJobStore({ journalPath });
    await assert.rejects(() => store.create({ id: "bad-1", tenantId: "tenant-a", projectId: "project-a", idempotencyKey: "bad", request: { api_key: "must-not-persist" } }), /sensitive_job_field_not_allowed/);
    await store.close();
    await appendFile(journalPath, "{partial");
    await assert.rejects(() => createFileVideoJobStore({ journalPath }), /video_job_journal_incomplete_tail/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { buildNOVAAssemblyCommand, buildSrtSubtitles, createNOVAMediaAssembler } from "./media-assembler.mjs";

test("NOVA media assembler builds multi-scene video with voice, music and soft subtitles", () => {
  const plan = createDirectorPlan(creativeBrief);
  const assets = plan.scenes.map((scene) => ({
    sceneId: scene.sceneId, assetPath: "jobs/job-1/" + scene.sceneId + ".mp4", contentType: "video/mp4",
    width: 704, height: 1280, frameRate: 24, durationSeconds: scene.durationSeconds, continuityGroup: scene.continuityGroup,
  }));
  const command = buildNOVAAssemblyCommand({
    plan, assets, workspaceRoot: "/workspace", jobId: "job-1",
    voiceoverPath: "audio/voice.wav", musicPath: "audio/music.mp3",
    subtitlePath: "jobs/job-1/subtitles.srt",
  });
  assert.equal(command.command, "ffmpeg");
  assert.equal(command.audioIncluded, true);
  assert.equal(command.subtitlesIncluded, true);
  assert.equal(command.width, 704);
  assert.equal(command.height, 1280);
  assert.equal(command.args.includes("-filter_complex"), true);
  assert.equal(command.args.join(";").includes("amix=inputs=2:duration=longest:dropout_transition=2"), true);
  assert.equal(command.args.includes("mov_text"), true);
  assert.equal(command.args.includes("-n"), true);
  assert.equal(command.args.includes("-y"), false);
  assert.equal(command.outputPath, "/workspace/jobs/job-1/final.mp4");
  assert.equal(command.args.some((arg) => arg.includes("; rm -rf")), false);
});

test("SRT generation validates time bounds, cue overlap and strips markup", () => {
  const srt = buildSrtSubtitles([{ startSeconds: 0, endSeconds: 2, text: "<b>Hello</b> world" }], 3);
  assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
  assert.match(srt, /Hello world/);
  assert.throws(() => buildSrtSubtitles([{ startSeconds: 0, endSeconds: 2, text: "one" }, { startSeconds: 1, endSeconds: 3, text: "two" }], 3), /overlapping_subtitle_cues/);
  assert.throws(() => buildSrtSubtitles([{ startSeconds: 0, endSeconds: 4, text: "outside" }], 3), /invalid_subtitle_timing/);
});

test("NOVA media assembler remains blocked without execution and human approval", async () => {
  let spawned = 0;
  const disabled = createNOVAMediaAssembler({ spawnImpl: () => { spawned += 1; } });
  assert.equal((await disabled.assemble({})).reason, "media_assembly_disabled");
  const unapproved = createNOVAMediaAssembler({ executionEnabled: true, spawnImpl: () => { spawned += 1; } });
  assert.equal((await unapproved.assemble({})).reason, "human_approval_required");
  assert.equal(spawned, 0);
});

test("NOVA media assembler rejects unsafe or incomplete source clips", () => {
  const plan = createDirectorPlan(creativeBrief);
  const assets = plan.scenes.map((scene) => ({
    sceneId: scene.sceneId, assetPath: "jobs/job-1/" + scene.sceneId + ".mp4", contentType: "video/mp4",
    width: 704, height: 1280, frameRate: 24, durationSeconds: scene.durationSeconds, continuityGroup: scene.continuityGroup,
  }));
  assert.throws(() => buildNOVAAssemblyCommand({ plan, assets: assets.slice(1), workspaceRoot: "/workspace", jobId: "job-1" }), /assembly_assets_invalid/);
  assert.throws(() => buildNOVAAssemblyCommand({ plan, assets: assets.map((asset, index) => index === 0 ? { ...asset, assetPath: "../escape.mp4" } : asset), workspaceRoot: "/workspace", jobId: "job-1" }), /assembly_assets_invalid/);
  assert.throws(() => buildNOVAAssemblyCommand({ plan, assets, workspaceRoot: "/workspace", jobId: "job-1", voiceoverPath: "../secret.wav" }), /invalid_voiceover/);
});
