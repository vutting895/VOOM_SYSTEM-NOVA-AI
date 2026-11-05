import { createDirectorPlan } from "./director-intelligence.mjs";
import { createGenerativeVideoTask } from "./generative-video.mjs";
import { createQualityReport } from "./quality-control.mjs";

export function createNOVAProductionPlan(input, options = {}) {
  const directorPlan = createDirectorPlan(input, options);
  const generationTasks = directorPlan.scenes.map((scene) => {
    const task = createGenerativeVideoTask({
      prompt: scene.visualPrompt, negativePrompt: scene.negativePrompt,
      aspectRatio: directorPlan.aspectRatio, durationSeconds: scene.durationSeconds,
      imagePath: scene.sourceImagePath,
    });
    return Object.freeze({ taskId: "generate-" + scene.sceneId, sceneId: scene.sceneId, task });
  });
  const stages = [
    { id: "creative_brief", status: "planned", dependsOn: [] },
    { id: "director_plan", status: "planned", dependsOn: ["creative_brief"] },
    { id: "human_approval", status: "required", dependsOn: ["director_plan"] },
    ...generationTasks.map((task) => ({ id: task.taskId, status: "blocked_execution_disabled", dependsOn: ["human_approval"] })),
    { id: "assembly", status: "blocked_waiting_for_clips", dependsOn: generationTasks.map((task) => task.taskId) },
    { id: "quality_control", status: "blocked_waiting_for_assembly", dependsOn: ["assembly"] },
    { id: "delivery", status: "blocked_waiting_for_quality_control", dependsOn: ["quality_control"] },
  ].map((stage) => Object.freeze(stage));
  return Object.freeze({
    schemaVersion: "nova.video-production-plan.v1",
    projectTitle: directorPlan.title, directorPlan,
    generationTasks: Object.freeze(generationTasks), stages: Object.freeze(stages),
    qualityPreview: createQualityReport(directorPlan),
    executionEnabled: false, estimatedCost: 0,
    requiresHumanApproval: true,
  });
}
