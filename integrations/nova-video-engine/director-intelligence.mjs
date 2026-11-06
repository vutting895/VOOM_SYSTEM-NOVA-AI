import { normalizeCreativeBrief, validateGeneratedScript } from "./script-intelligence.mjs";

const MAX_CLIP_SECONDS = 5.05;
const FRAMES_PER_SECOND = 24;
const GOAL_BEATS = Object.freeze({
  product_ad: ["hook", "context", "hero", "detail", "call_to_action"],
  explainer: ["hook", "context", "explanation", "example", "recap", "call_to_action"],
  story: ["hook", "setup", "turning_point", "resolution", "call_to_action"],
  brand_film: ["hook", "world", "craft", "hero", "brand_mood", "call_to_action"],
});
const SHOT_LIBRARY = Object.freeze({
  hook: { framing: "close_up", camera: "slow_push_in", lighting: "directional_key", transition: "cut" },
  context: { framing: "wide_establishing", camera: "slow_dolly_in", lighting: "natural_soft", transition: "match_cut" },
  setup: { framing: "medium_wide", camera: "gentle_tracking", lighting: "motivated_practical", transition: "cut" },
  turning_point: { framing: "medium_close_up", camera: "controlled_orbit", lighting: "contrast_rim", transition: "match_cut" },
  resolution: { framing: "hero_wide", camera: "slow_pull_back", lighting: "soft_hero", transition: "dissolve" },
  world: { framing: "wide_establishing", camera: "lateral_tracking", lighting: "atmospheric_soft", transition: "cut" },
  craft: { framing: "macro_detail", camera: "precision_slider", lighting: "softbox_detail", transition: "match_cut" },
  hero: { framing: "hero_product", camera: "slow_orbit", lighting: "three_point_hero", transition: "cut" },
  detail: { framing: "macro_insert", camera: "lateral_slider", lighting: "softbox_detail", transition: "match_cut" },
  explanation: { framing: "medium", camera: "locked_off", lighting: "clean_even", transition: "cut" },
  example: { framing: "over_the_shoulder", camera: "gentle_tracking", lighting: "natural_soft", transition: "match_cut" },
  recap: { framing: "medium_close_up", camera: "slow_push_in", lighting: "clean_even", transition: "cut" },
  brand_mood: { framing: "cinematic_wide", camera: "crane_reveal", lighting: "atmospheric_rim", transition: "dissolve" },
  call_to_action: { framing: "centered_hero", camera: "slow_push_in", lighting: "clean_hero", transition: "fade_out" },
});

function safeList(value, field, maxItems, maxLength) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new TypeError("invalid_" + field);
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.trim().length > maxLength) throw new TypeError("invalid_" + field + "_item");
    return item.trim();
  });
}

function chooseBeats(count, goal) {
  const template = GOAL_BEATS[goal] ?? GOAL_BEATS.product_ad;
  if (count <= template.length) {
    // Keep the final call-to-action beat even when a short video has fewer scenes than the template.
    return [...template.slice(0, count - 1), template.at(-1)];
  }
  const result = [...template];
  while (result.length < count) result.splice(result.length - 1, 0, "detail");
  return result;
}

function allocateFrames(totalFrames, count) {
  const base = Math.floor(totalFrames / count);
  const remainder = totalFrames % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function createDirectorPlan(input, options = {}) {
  const brief = normalizeCreativeBrief(input);
  if (brief.durationSeconds > 60) throw new RangeError("director_plan_max_duration_60_seconds");
  const goal = ["product_ad", "explainer", "story", "brand_film"].includes(input.goal) ? input.goal : "product_ad";
  const verifiedFacts = safeList(input.verifiedFacts, "verified_facts", 12, 240);
  const mustAvoid = safeList(input.mustAvoid, "must_avoid", 20, 160);
  const requestedScript = options.script ?? input.script ?? null;
  let script = null;
  if (requestedScript) {
    script = validateGeneratedScript(requestedScript, brief.durationSeconds);
    if (script.scenes.some((scene) => scene.durationSeconds > MAX_CLIP_SECONDS)) throw new RangeError("script_scene_exceeds_model_clip_limit");
  }
  const totalFrames = Math.round(brief.durationSeconds * FRAMES_PER_SECOND);
  const sceneCount = script ? script.scenes.length : Math.max(1, Math.ceil(brief.durationSeconds / MAX_CLIP_SECONDS));
  if (sceneCount > 12) throw new RangeError("director_scene_limit_exceeded");
  const frameCounts = script
    ? script.scenes.map((scene) => Math.round(scene.durationSeconds * FRAMES_PER_SECOND))
    : allocateFrames(totalFrames, sceneCount);
  if (frameCounts.some((count) => count < 24 || count > 121)) throw new RangeError("director_clip_frame_count_out_of_range");
  const beats = chooseBeats(sceneCount, goal);
  let cursor = 0;
  const scenes = frameCounts.map((frameCount, index) => {
    const beat = beats[index];
    const shot = SHOT_LIBRARY[beat] ?? SHOT_LIBRARY.detail;
    const sceneScript = script?.scenes[index] ?? null;
    const durationSeconds = frameCount / FRAMES_PER_SECOND;
    const startFrame = cursor;
    cursor += frameCount;
    const sourceDescription = sceneScript?.visualPrompt ?? brief.concept;
    const factGuard = verifiedFacts.length ? "Use only these supplied facts when a factual claim is needed: " + verifiedFacts.join("; ") + "." : "Do not invent specifications, performance claims, prices, testimonials or guarantees.";
    const callToActionInstruction = beat === "call_to_action" && brief.callToAction
      ? "End with this supplied call to action: " + brief.callToAction + "."
      : "";
    const visualPrompt = [
      brief.style + " visual direction.",
      "Scene purpose: " + beat + ".",
      "Subject and concept: " + brief.concept + ".",
      "Shot description: " + sourceDescription + ".",
      "Framing: " + shot.framing + "; camera: " + shot.camera + "; lighting: " + shot.lighting + ".",
      callToActionInstruction,
      "Maintain identical subject identity, product geometry, wardrobe, palette and environment continuity across all scenes.",
      factGuard,
      "Do not render text, logos, watermarks or extra objects unless explicitly supplied as approved assets.",
    ].join(" ");
    return Object.freeze({
      sceneId: "scene-" + String(index + 1).padStart(2, "0"),
      order: index + 1, beat,
      startFrame, frameCount, endFrameExclusive: cursor,
      startSeconds: Number((startFrame / FRAMES_PER_SECOND).toFixed(3)),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      visualPrompt, negativePrompt: [...mustAvoid, "text artifacts", "watermarks", "subject drift", "product deformation"].join(", "),
      framing: shot.framing, cameraMovement: shot.camera, lighting: shot.lighting, transition: shot.transition,
      voiceover: sceneScript?.voiceover ?? "", caption: sceneScript?.caption ?? "",
      continuityGroup: "subject-lock-01",
      sourceImagePath: input.referenceImagePath ?? null,
    });
  });
  if (cursor !== totalFrames) throw new Error("director_timeline_frame_mismatch");
  return Object.freeze({
    schemaVersion: "nova.director-plan.v1",
    engine: "NOVA Director Intelligence",
    plannerVersion: "1.0.0",
    generatedBy: "nova-owned-director-rules",
    title: brief.title, goal, language: brief.language, audience: brief.audience, platform: brief.platform,
    aspectRatio: brief.aspectRatio, frameRate: FRAMES_PER_SECOND,
    durationSeconds: totalFrames / FRAMES_PER_SECOND, totalFrames,
    subjectContinuity: Object.freeze({ continuityGroup: "subject-lock-01", preserveIdentity: true, preserveWardrobe: true, preserveProductGeometry: true }),
    scenes: Object.freeze(scenes),
    executionEnabled: false, estimatedCost: 0,
  });
}
