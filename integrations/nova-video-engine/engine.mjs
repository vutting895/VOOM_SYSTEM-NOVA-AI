export const ENGINE_ID = "nova-owned-video-engine";
export const ENGINE_VERSION = "0.1.0";
export const ENGINE_STATES = Object.freeze({ PLANNED: "planned", BLOCKED: "blocked", RENDERED: "rendered", FAILED: "failed" });
const MAX_SCENES = 12;
const MAX_DURATION_SECONDS = 120;
const ASPECT_RATIOS = new Set(["9:16", "16:9", "1:1"]);

function asText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new TypeError("invalid_" + field);
  return value.trim();
}

export function normalizeVideoBrief(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("video_brief_required");
  const title = asText(input.title, "title", 120);
  const aspectRatio = input.aspectRatio ?? "9:16";
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new TypeError("invalid_aspect_ratio");
  const durationSeconds = Number(input.durationSeconds ?? 15);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > MAX_DURATION_SECONDS) throw new RangeError("invalid_duration_seconds");
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > MAX_SCENES) throw new TypeError("invalid_scene_count");
  const scenes = input.scenes.map((scene, index) => {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) throw new TypeError("invalid_scene_" + (index + 1));
    const description = asText(scene.description, "scene_" + (index + 1) + "_description", 500);
    const visualPrompt = scene.visualPrompt === undefined ? description : asText(scene.visualPrompt, "scene_" + (index + 1) + "_visual_prompt", 1000);
    const requestedDuration = scene.durationSeconds === undefined ? null : Number(scene.durationSeconds);
    if (requestedDuration !== null && (!Number.isFinite(requestedDuration) || requestedDuration <= 0 || Math.round(requestedDuration * 1000) < 1)) {
      throw new RangeError("invalid_scene_" + (index + 1) + "_duration");
    }
    const imagePath = scene.imagePath === undefined ? null : asText(scene.imagePath, "scene_" + (index + 1) + "_image_path", 240);
    return { index, description, visualPrompt, requestedDuration, imagePath };
  });

  // Allocate timing at millisecond precision so the timeline always covers the brief.
  const totalMs = Math.round(durationSeconds * 1000);
  const requestedScenes = scenes.filter((scene) => scene.requestedDuration !== null);
  const requestedTotalMs = requestedScenes.reduce((sum, scene) => sum + Math.round(scene.requestedDuration * 1000), 0);
  const unspecifiedCount = scenes.length - requestedScenes.length;
  if (unspecifiedCount > 0 && requestedTotalMs > totalMs) {
    throw new RangeError("scene_durations_exceed_video_duration");
  }
  if (unspecifiedCount === 0 && Math.abs(requestedTotalMs - totalMs) > 10) {
    throw new RangeError("scene_durations_must_match_video_duration");
  }
  if (unspecifiedCount > 0 && totalMs - requestedTotalMs < unspecifiedCount) {
    throw new RangeError("scene_duration_remainder_too_small");
  }
  return Object.freeze({ title, aspectRatio, durationSeconds, scenes });
}

// NOVA-owned deterministic CPU planning; no external model is invoked here.
export function createStoryboard(briefInput) {
  const brief = normalizeVideoBrief(briefInput);
  const totalMs = Math.round(brief.durationSeconds * 1000);
  const durationsMs = brief.scenes.map((scene) => scene.requestedDuration === null
    ? null
    : Math.round(scene.requestedDuration * 1000));
  const unspecifiedIndexes = durationsMs.flatMap((duration, index) => duration === null ? [index] : []);
  const requestedTotalMs = durationsMs.reduce((sum, duration) => sum + (duration ?? 0), 0);

  if (unspecifiedIndexes.length > 0) {
    const remainingMs = totalMs - requestedTotalMs;
    const baseMs = Math.floor(remainingMs / unspecifiedIndexes.length);
    let remainderMs = remainingMs % unspecifiedIndexes.length;
    for (const index of unspecifiedIndexes) {
      durationsMs[index] = baseMs + (remainderMs > 0 ? 1 : 0);
      remainderMs -= remainderMs > 0 ? 1 : 0;
    }
  } else {
    // Preserve user timings within the existing 10 ms validation tolerance,
    // assigning any rounding difference to the final scene.
    durationsMs[durationsMs.length - 1] += totalMs - requestedTotalMs;
  }

  if (durationsMs.some((duration) => !Number.isInteger(duration) || duration <= 0)) {
    throw new RangeError("scene_duration_allocation_invalid");
  }

  let cursorMs = 0;
  const scenes = brief.scenes.map((scene, index) => {
    const durationMs = durationsMs[index];
    const startSeconds = cursorMs / 1000;
    cursorMs += durationMs;
    return Object.freeze({
      sceneId: "scene-" + String(scene.index + 1).padStart(2, "0"),
      order: scene.index + 1,
      startSeconds,
      durationSeconds: durationMs / 1000,
      endSeconds: cursorMs / 1000,
      description: scene.description,
      visualPrompt: scene.visualPrompt,
      imagePath: scene.imagePath,
    });
  });
  return Object.freeze({
    engineId: ENGINE_ID,
    engineVersion: ENGINE_VERSION,
    title: brief.title,
    aspectRatio: brief.aspectRatio,
    durationSeconds: totalMs / 1000,
    frameRate: 24,
    scenes: Object.freeze(scenes),
    generatedBy: "nova-deterministic-planner",
    executionEnabled: false,
    estimatedCost: 0,
  });
}

export function createNovaVideoEngine(options = {}) {
  const executionEnabled = options.executionEnabled === true;
  const renderer = options.renderer ?? null;
  return Object.freeze({
    id: ENGINE_ID, version: ENGINE_VERSION,
    plan(brief) { return createStoryboard(brief); },
    async render(brief) {
      const storyboard = createStoryboard(brief);
      if (!executionEnabled) return { state: ENGINE_STATES.BLOCKED, reason: "execution_disabled", storyboard, executionEnabled: false, estimatedCost: 0 };
      if (!renderer || typeof renderer.render !== "function") return { state: ENGINE_STATES.BLOCKED, reason: "renderer_unavailable", storyboard, executionEnabled: false, estimatedCost: 0 };
      try {
        const output = await renderer.render(storyboard);
        return { state: ENGINE_STATES.RENDERED, storyboard, output, executionEnabled: true, estimatedCost: 0 };
      } catch (error) {
        return { state: ENGINE_STATES.FAILED, reason: "renderer_failed", error: error instanceof Error ? error.message : "unknown_renderer_error", storyboard, executionEnabled: true, estimatedCost: 0 };
      }
    },
  });
}
