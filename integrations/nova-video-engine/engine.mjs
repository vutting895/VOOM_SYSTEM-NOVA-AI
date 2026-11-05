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
    if (requestedDuration !== null && (!Number.isFinite(requestedDuration) || requestedDuration <= 0)) throw new RangeError("invalid_scene_" + (index + 1) + "_duration");
    const imagePath = scene.imagePath === undefined ? null : asText(scene.imagePath, "scene_" + (index + 1) + "_image_path", 240);
    return { index, description, visualPrompt, requestedDuration, imagePath };
  });
  const requestedTotal = scenes.reduce((sum, scene) => sum + (scene.requestedDuration ?? 0), 0);
  if (scenes.every((scene) => scene.requestedDuration !== null) && Math.abs(requestedTotal - durationSeconds) > 0.01) throw new RangeError("scene_durations_must_match_video_duration");
  return Object.freeze({ title, aspectRatio, durationSeconds, scenes });
}

// NOVA-owned deterministic CPU planning; no external model is invoked here.
export function createStoryboard(briefInput) {
  const brief = normalizeVideoBrief(briefInput);
  const defaultSceneDuration = brief.durationSeconds / brief.scenes.length;
  let cursor = 0;
  const scenes = brief.scenes.map((scene) => {
    const durationSeconds = scene.requestedDuration ?? defaultSceneDuration;
    const startSeconds = Number(cursor.toFixed(3));
    cursor += durationSeconds;
    return Object.freeze({
      sceneId: "scene-" + String(scene.index + 1).padStart(2, "0"),
      order: scene.index + 1, startSeconds,
      durationSeconds: Number(durationSeconds.toFixed(3)),
      endSeconds: Number(cursor.toFixed(3)),
      description: scene.description, visualPrompt: scene.visualPrompt, imagePath: scene.imagePath,
    });
  });
  return Object.freeze({
    engineId: ENGINE_ID, engineVersion: ENGINE_VERSION, title: brief.title,
    aspectRatio: brief.aspectRatio, durationSeconds: brief.durationSeconds, frameRate: 24,
    scenes: Object.freeze(scenes), generatedBy: "nova-deterministic-planner",
    executionEnabled: false, estimatedCost: 0,
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
