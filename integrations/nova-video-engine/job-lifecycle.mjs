const STATES = new Set(["queued", "planning", "approval_required", "generating", "assembling", "quality_check", "completed", "failed", "cancelled"]);
const TERMINAL = new Set(["completed", "cancelled"]);
const TRANSITIONS = Object.freeze({
  queued: ["planning", "cancelled"],
  planning: ["approval_required", "failed", "cancelled"],
  approval_required: ["generating", "failed", "cancelled"],
  generating: ["assembling", "failed", "cancelled"],
  assembling: ["quality_check", "failed"],
  quality_check: ["completed", "failed"],
  failed: ["queued", "cancelled"],
  completed: [],
  cancelled: [],
});
const MAX_RETRIES = 3;

function requiredText(value, field, maxLength = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new TypeError("invalid_" + field);
  return value.trim();
}

function copy(value) { return structuredClone(value); }

export function createVideoJob(input, now = new Date().toISOString()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("video_job_required");
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError("invalid_job_timestamp");
  const tenantId = requiredText(input.tenantId, "tenant_id");
  const id = requiredText(input.id, "job_id");
  const projectId = requiredText(input.projectId, "project_id");
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotency_key", 100);
  const request = input.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("invalid_job_request");
  return Object.freeze({
    id, tenantId, projectId, idempotencyKey, state: "queued",
    version: 0, retryCount: 0, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString(),
    request: copy(request), audit: Object.freeze([{ state: "queued", at: timestamp.toISOString(), event: "job_created" }]),
  });
}

export function transitionVideoJob(job, nextState, options = {}) {
  if (!job || !STATES.has(job.state) || !STATES.has(nextState)) throw new TypeError("invalid_job_state");
  if (options.actorTenantId !== job.tenantId) throw new Error("video_job_tenant_access_denied");
  if (TERMINAL.has(job.state)) throw new Error("video_job_terminal_state");
  if (!TRANSITIONS[job.state].includes(nextState)) throw new Error("video_job_transition_not_allowed");
  const at = options.at ?? new Date().toISOString();
  if (!Number.isFinite(new Date(at).getTime())) throw new TypeError("invalid_job_timestamp");
  let retryCount = job.retryCount;
  if (job.state === "failed" && nextState === "queued") {
    if (retryCount >= MAX_RETRIES) throw new Error("video_job_retry_limit_reached");
    retryCount += 1;
  }
  const event = options.event === "approval_granted" && job.state === "approval_required" && nextState === "generating"
    ? "approval_granted"
    : "state_transition";
  const auditEntry = Object.freeze({ state: nextState, at: new Date(at).toISOString(), event, retryCount });
  return Object.freeze({ ...job, state: nextState, version: (Number.isInteger(job.version) ? job.version : 0) + 1, retryCount, updatedAt: auditEntry.at, audit: Object.freeze([...job.audit, auditEntry]) });
}

export function createInMemoryVideoJobStore() {
  const jobs = new Map();
  const idempotency = new Map();
  return Object.freeze({
    create(input, now) {
      const candidate = createVideoJob(input, now);
      const key = candidate.tenantId + ":" + candidate.idempotencyKey;
      const existingId = idempotency.get(key);
      if (existingId) return { created: false, job: copy(jobs.get(existingId)) };
      if (jobs.has(candidate.id)) throw new Error("video_job_id_conflict");
      jobs.set(candidate.id, copy(candidate));
      idempotency.set(key, candidate.id);
      return { created: true, job: copy(candidate) };
    },
    get(jobId, actorTenantId) {
      const job = jobs.get(jobId);
      if (!job || job.tenantId !== actorTenantId) return null;
      return copy(job);
    },
    transition(jobId, nextState, options = {}) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("video_job_not_found");
      const next = transitionVideoJob(job, nextState, options);
      jobs.set(jobId, copy(next));
      return copy(next);
    },
    list(actorTenantId) {
      return [...jobs.values()].filter((job) => job.tenantId === actorTenantId).map(copy);
    },
  });
}

export const VIDEO_JOB_STATES = Object.freeze([...STATES]);
