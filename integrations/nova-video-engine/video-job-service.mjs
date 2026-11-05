import { randomUUID } from "node:crypto";
import { createNOVAProductionPlan } from "./pipeline-orchestrator.mjs";
import { validateDirectorTimeline, createQualityReport } from "./quality-control.mjs";

function requiredText(value, field, maxLength = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new TypeError("invalid_" + field);
  return value.trim();
}

function ownerId(principal) {
  if (!principal || typeof principal !== "object") throw new Error("video_authentication_required");
  return requiredText(principal.id ?? principal.userId, "authenticated_user_id", 160);
}

function buildPlan(brief) {
  const pipeline = createNOVAProductionPlan(brief);
  const timeline = validateDirectorTimeline(pipeline.directorPlan);
  if (!timeline.valid) throw new Error("video_director_plan_invalid: " + timeline.issues.join(","));
  return {
    schemaVersion: "nova.video-job-request.v1",
    brief: structuredClone(brief),
    directorPlan: pipeline.directorPlan,
    timelineQuality: createQualityReport(pipeline.directorPlan),
  };
}

export function createNOVAEngineService({ jobStore } = {}) {
  if (!jobStore || typeof jobStore.create !== "function" || typeof jobStore.get !== "function" || typeof jobStore.list !== "function" || typeof jobStore.transition !== "function") {
    throw new TypeError("nova_video_job_store_required");
  }

  return Object.freeze({
    plan(brief) {
      const plan = createNOVAProductionPlan(brief);
      return Object.freeze({ plan, executionEnabled: false, estimatedCost: 0 });
    },
    async createJob({ principal, projectId, idempotencyKey, brief, jobId = randomUUID(), now } = {}) {
      const tenantId = ownerId(principal);
      const ownerProjectId = requiredText(projectId, "project_id", 160);
      const key = requiredText(idempotencyKey, "idempotency_key", 100);
      if (!/^[A-Za-z0-9_-]{12,100}$/.test(key)) throw new TypeError("video_idempotency_key_invalid");
      const request = buildPlan(brief);
      const result = await jobStore.create({ id: requiredText(jobId, "job_id", 160), tenantId, projectId: ownerProjectId, idempotencyKey: key, request }, now);
      return Object.freeze({
        job: result.job, idempotentReplay: !result.created,
        plan: createNOVAProductionPlan(brief),
        state: result.job.state, executionEnabled: false, estimatedCost: 0,
        explanation: "Job and director plan recorded in the configured job store. No AI model or worker was invoked.",
      });
    },
    getJob({ principal, jobId } = {}) {
      const tenantId = ownerId(principal);
      const id = requiredText(jobId, "job_id", 160);
      return jobStore.get(id, tenantId);
    },
    listJobs({ principal } = {}) {
      const tenantId = ownerId(principal);
      return jobStore.list(tenantId);
    },
    async prepareForApproval({ principal, jobId, at } = {}) {
      const tenantId = ownerId(principal);
      const id = requiredText(jobId, "job_id", 160);
      const current = jobStore.get(id, tenantId);
      if (!current) return null;
      if (current.state !== "queued") throw new Error("video_job_not_queued");
      const timeline = validateDirectorTimeline(current.request?.directorPlan);
      if (!timeline.valid) throw new Error("video_director_plan_invalid: " + timeline.issues.join(","));
      const planning = await jobStore.transition(id, "planning", { actorTenantId: tenantId, at });
      const approval = await jobStore.transition(id, "approval_required", { actorTenantId: tenantId, at });
      return Object.freeze({ job: approval, previousVersion: planning.version, timeline, executionEnabled: false, estimatedCost: 0 });
    },
    async cancelJob({ principal, jobId, at } = {}) {
      const tenantId = ownerId(principal);
      const id = requiredText(jobId, "job_id", 160);
      const current = jobStore.get(id, tenantId);
      if (!current) return null;
      if (current.state === "cancelled") return current;
      if (!["queued", "planning", "approval_required"].includes(current.state)) throw new Error("video_job_cancellation_not_allowed");
      return jobStore.transition(id, "cancelled", { actorTenantId: tenantId, at });
    },
    async execute() {
      return { state: "blocked", reason: "video_model_execution_not_enabled", executionEnabled: false, estimatedCost: 0 }
    },
  });
}
