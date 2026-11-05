const STYLE_PRESETS = Object.freeze({
  cinematic: "cinematic composition, deliberate camera movement, natural lighting",
  documentary: "observational framing, realistic detail, available-light look",
  product: "clean product framing, controlled highlights, precise detail",
  social: "high-clarity framing, energetic pacing, strong visual hook",
  educational: "clear instructional framing, readable visual hierarchy",
});

const SCENE_ROLES = Object.freeze([
  { key: "hook", title: "Opening hook", purpose: "Establish the subject and earn attention." },
  { key: "context", title: "Context", purpose: "Show the setting, problem, or audience need." },
  { key: "value", title: "Core value", purpose: "Make the main benefit or idea visible." },
  { key: "proof", title: "Proof detail", purpose: "Support the message with a concrete visual." },
  { key: "close", title: "Closing frame", purpose: "End with a clear, memorable visual." },
]);

const SHOT_TYPES = Object.freeze([
  { key: "establishing", framing: "wide establishing shot", movement: "slow controlled push-in" },
  { key: "detail", framing: "medium-to-close detail shot", movement: "subtle lateral camera move" },
  { key: "payoff", framing: "hero composition", movement: "steady locked-off finish" },
]);

function cleanText(value, field, maxLength, minLength = 1) {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    throw new RangeError(`${field} must contain ${minLength}-${maxLength} characters`);
  }
  return cleaned;
}

function splitDuration(totalSeconds, parts) {
  const base = Math.floor(totalSeconds / parts);
  const remainder = totalSeconds % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Deterministic, NOVA-owned brief-to-shot planner.
 * User text is treated only as creative content; it is never evaluated as code or instructions.
 * This function does not call a model, generate media, or dispatch a job.
 */
export function createVideoDirection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }

  const brief = cleanText(input.brief, "brief", 2000, 12);
  const durationSeconds = input.durationSeconds ?? 30;
  if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 180) {
    throw new RangeError("durationSeconds must be an integer from 5 to 180");
  }

  const sceneCount = input.sceneCount ?? 3;
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || sceneCount > 12 || sceneCount > durationSeconds) {
    throw new RangeError("sceneCount must be an integer from 1 to min(12, durationSeconds)");
  }

  const aspectRatio = input.aspectRatio ?? "16:9";
  if (!["16:9", "9:16", "1:1"].includes(aspectRatio)) {
    throw new RangeError("aspectRatio must be 16:9, 9:16, or 1:1");
  }

  const style = input.style ?? "cinematic";
  if (!Object.hasOwn(STYLE_PRESETS, style)) {
    throw new RangeError("style is not an approved NOVA preset");
  }

  const sceneDurations = splitDuration(durationSeconds, sceneCount);
  const scenes = sceneDurations.map((sceneDuration, index) => {
    const role = SCENE_ROLES[index % SCENE_ROLES.length];
    const shotCount = sceneDuration >= 9 ? 3 : 2;
    const shotDurations = splitDuration(sceneDuration, shotCount);
    let cursor = sceneDurations.slice(0, index).reduce((sum, value) => sum + value, 0);

    const shots = shotDurations.map((shotDuration, shotIndex) => {
      const shotType = SHOT_TYPES[Math.min(shotIndex, SHOT_TYPES.length - 1)];
      const shot = {
        id: `scene-${index + 1}-shot-${shotIndex + 1}`,
        type: shotType.key,
        framing: shotType.framing,
        cameraMovement: shotType.movement,
        startSeconds: cursor,
        durationSeconds: shotDuration,
        visualPrompt: `${STYLE_PRESETS[style]}; ${shotType.framing}; ${brief}`,
        aspectRatio,
      };
      cursor += shotDuration;
      return shot;
    });

    return {
      id: `scene-${index + 1}`,
      role: role.key,
      title: role.title,
      purpose: role.purpose,
      startSeconds: shots[0].startSeconds,
      durationSeconds: sceneDuration,
      shots,
    };
  });

  return {
    engine: "NOVA Video Director",
    engineVersion: "0.1.0",
    planningMode: "deterministic",
    brief,
    style,
    aspectRatio,
    durationSeconds,
    sceneCount,
    scenes,
    executionEnabled: false,
    estimatedCost: 0,
    status: "planned",
  };
}
