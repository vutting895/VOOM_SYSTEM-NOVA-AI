const FORMATS = Object.freeze({
  "9:16": { width: 704, height: 1280 },
  "16:9": { width: 1280, height: 704 },
});

function safeText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new TypeError("invalid_" + field);
  return value.trim();
}

function validateInputImagePath(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "." || !part)) throw new TypeError("invalid_input_image_path");
  const extension = value.split(".").pop().toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(extension)) throw new TypeError("unsupported_input_image_type");
  return value;
}

export function createGenerativeVideoTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("generation_request_required");
  const aspectRatio = input.aspectRatio ?? "9:16";
  if (!FORMATS[aspectRatio]) throw new TypeError("wan22_unsupported_aspect_ratio");
  const durationSeconds = Number(input.durationSeconds ?? 5);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 5.05) throw new RangeError("wan22_clip_duration_out_of_range");
  const prompt = safeText(input.prompt, "prompt", 2000);
  const negativePrompt = typeof input.negativePrompt === "string" ? input.negativePrompt.trim().slice(0, 1000) : "";
  const imagePath = validateInputImagePath(input.imagePath);
  const dimensions = FORMATS[aspectRatio];
  return Object.freeze({
    schemaVersion: "nova.video-generation.v1",
    taskType: "video_generation",
    modelId: "Wan-AI/Wan2.2-TI2V-5B",
    mode: input.imagePath ? "image_to_video" : "text_to_video",
    prompt, negativePrompt, aspectRatio, durationSeconds,
    width: dimensions.width, height: dimensions.height, frameRate: 24,
    imagePath,
    executionEnabled: false,
    estimatedCost: 0,
  });
}

function validateRelativeAssetPath(value) {
  if (typeof value !== "string" || !value.trim() || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "." || !part)) throw new TypeError("invalid_generated_asset_path");
  return value;
}

export function validateGeneratedClip(result, task) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new TypeError("invalid_generation_result");
  if (result.contentType !== "video/mp4") throw new TypeError("generated_clip_must_be_mp4");
  const width = Number(result.width);
  const height = Number(result.height);
  const frameRate = Number(result.frameRate);
  const durationSeconds = Number(result.durationSeconds);
  if (width !== task.width || height !== task.height) throw new TypeError("generated_clip_dimensions_mismatch");
  if (frameRate !== 24) throw new TypeError("generated_clip_frame_rate_mismatch");
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - task.durationSeconds) > 0.1) throw new TypeError("generated_clip_duration_mismatch");
  return Object.freeze({
    assetPath: validateRelativeAssetPath(result.assetPath), contentType: result.contentType,
    width, height, frameRate, durationSeconds,
    modelId: task.modelId, generatedBy: "approved-nova-provider-adapter",
  });
}

export async function generateVideoClip(input, providerRegistry, { executionEnabled = false } = {}) {
  const task = createGenerativeVideoTask(input);
  if (!executionEnabled) return { status: "blocked", reason: "video_generation_disabled", task };
  if (!providerRegistry || typeof providerRegistry.invoke !== "function") return { status: "blocked", reason: "provider_registry_unavailable", task };
  try {
    const result = await providerRegistry.invoke("video_generation", task, { executionEnabled: true });
    return { status: "generated", asset: validateGeneratedClip(result, task), task };
  } catch (error) {
    return { status: "blocked", reason: "approved_zero_cost_video_provider_unavailable", detail: error instanceof Error ? error.message : "unknown_provider_error", task };
  }
}
