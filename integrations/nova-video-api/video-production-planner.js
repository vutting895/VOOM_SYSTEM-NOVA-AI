import { createGenerativeVideoTask } from "../nova-video-engine/generative-video.mjs";

const MAX_SCENES = 12;
const MAX_CLIP_SECONDS = 5.05;

function requiredText(value, field, maxLength = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError("production_plan_invalid_" + field);
  }
  return value.trim();
}

// Worker-safe adapter over the Engine's canonical generation-task validator.
// This module only projects contracts; it never invokes a provider, queue, filesystem, GPU or model.
export function createVideoProductionPlan(directorPlan) {
  if (!directorPlan || typeof directorPlan !== "object" || Array.isArray(directorPlan)) {
    throw new TypeError("production_plan_director_plan_required");
  }
  if (directorPlan.schemaVersion !== "nova.director-plan.v1" ||
      directorPlan.frameRate !== 24 ||
      !Number.isInteger(directorPlan.totalFrames) ||
      directorPlan.totalFrames < 72 ||
      !Array.isArray(directorPlan.scenes) ||
      directorPlan.scenes.length < 1 ||
      directorPlan.scenes.length > MAX_SCENES) {
    throw new TypeError("production_plan_director_plan_invalid");
  }

  let cursor = 0;
  const generationTasks = directorPlan.scenes.map((scene, index) => {
    if (!scene || scene.order !== index + 1 || scene.startFrame !== cursor ||
        !Number.isInteger(scene.frameCount) || scene.frameCount < 24 || scene.frameCount > 121 ||
        scene.endFrameExclusive !== cursor + scene.frameCount) {
      throw new TypeError("production_plan_scene_timeline_invalid");
    }

    const durationSeconds = scene.frameCount / 24;
    if (durationSeconds > MAX_CLIP_SECONDS) throw new RangeError("production_plan_clip_duration_exceeded");
    const taskId = "generate-" + requiredText(scene.sceneId, "scene_id", 80);
    const engineTask = createGenerativeVideoTask({
      prompt: requiredText(scene.visualPrompt, "scene_prompt", 2000),
      negativePrompt: typeof scene.negativePrompt === "string" ? scene.negativePrompt.slice(0, 1000) : "",
      aspectRatio: directorPlan.aspectRatio,
      durationSeconds,
      imagePath: scene.sourceImagePath ?? null,
    });
    cursor = scene.endFrameExclusive;
    return Object.freeze({
      taskId,
      sceneId: scene.sceneId,
      order: scene.order,
      task: Object.freeze({
        schemaVersion: "nova.video-generation-task.v1",
        modelCandidate: engineTask.modelId,
        mode: engineTask.mode,
        prompt: engineTask.prompt,
        negativePrompt: engineTask.negativePrompt,
        aspectRatio: engineTask.aspectRatio,
        width: engineTask.width,
        height: engineTask.height,
        frameRate: engineTask.frameRate,
        durationSeconds: engineTask.durationSeconds,
        frameCount: scene.frameCount,
        sourceImagePath: engineTask.imagePath,
        executionEnabled: false,
        estimatedCost: 0,
      }),
      state: "blocked_no_free_gpu",
    });
  });

  if (cursor !== directorPlan.totalFrames) throw new TypeError("production_plan_timeline_total_mismatch");
  const taskIds = generationTasks.map((task) => task.taskId);
  const stages = [
    Object.freeze({ id: "director_plan", status: "planned", dependsOn: [] }),
    Object.freeze({ id: "human_approval", status: "required", dependsOn: ["director_plan"] }),
    ...generationTasks.map((task) => Object.freeze({
      id: task.taskId,
      status: "blocked_no_free_gpu",
      dependsOn: ["human_approval"],
    })),
    Object.freeze({ id: "assembly", status: "blocked_waiting_for_clips", dependsOn: taskIds }),
    Object.freeze({ id: "quality_control", status: "blocked_waiting_for_assembly", dependsOn: ["assembly"] }),
    Object.freeze({ id: "delivery", status: "blocked_waiting_for_quality_control", dependsOn: ["quality_control"] }),
  ];

  return Object.freeze({
    schemaVersion: "nova.video-production-plan.v1",
    projectTitle: requiredText(directorPlan.title, "title", 160),
    directorPlan,
    generationTasks: Object.freeze(generationTasks),
    stages: Object.freeze(stages),
    executionEnabled: false,
    estimatedCost: 0,
    requiresHumanApproval: true,
    status: "blocked_no_free_gpu",
  });
}
