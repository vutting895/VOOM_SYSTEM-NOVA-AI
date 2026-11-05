import { open, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createVideoJob, transitionVideoJob } from "./job-lifecycle.mjs";

const DEFAULT_MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
const SENSITIVE_KEY = /(authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|private[_-]?key)/i;

function clone(value) { return structuredClone(value); }

function assertSafeRequest(value, depth = 0) {
  if (depth > 12) throw new TypeError("video_job_request_too_deep");
  if (Array.isArray(value)) {
    for (const item of value) assertSafeRequest(item, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new TypeError("sensitive_job_field_not_allowed");
    assertSafeRequest(item, depth + 1);
  }
}

function applyJournalEvent(event, jobs, idempotency) {
  if (!event || typeof event !== "object") throw new Error("video_job_journal_event_invalid");
  if (event.type === "job_created") {
    const job = event.job;
    if (!job || job.state !== "queued" || job.version !== 0) throw new Error("video_job_journal_create_invalid");
    const rebuilt = createVideoJob({ id: job.id, tenantId: job.tenantId, projectId: job.projectId, idempotencyKey: job.idempotencyKey, request: job.request }, job.createdAt);
    if (JSON.stringify(rebuilt) !== JSON.stringify(job)) throw new Error("video_job_journal_create_tampered");
    const key = job.tenantId + ":" + job.idempotencyKey;
    if (jobs.has(job.id) || idempotency.has(key)) throw new Error("video_job_journal_duplicate_create");
    jobs.set(job.id, clone(job));
    idempotency.set(key, job.id);
    return;
  }
  if (event.type === "job_transition") {
    const current = jobs.get(event.jobId);
    if (!current || current.tenantId !== event.tenantId || current.version + 1 !== event.version) throw new Error("video_job_journal_version_conflict");
    const next = transitionVideoJob(current, event.nextState, { actorTenantId: event.tenantId, at: event.at, event: event.eventName ?? undefined });
    if (JSON.stringify(next) !== JSON.stringify(event.job)) throw new Error("video_job_journal_transition_tampered");
    jobs.set(next.id, clone(next));
    return;
  }
  throw new Error("video_job_journal_event_unknown");
}

export async function createFileVideoJobStore(options = {}) {
  if (typeof options.journalPath !== "string" || !options.journalPath.trim()) throw new TypeError("video_job_journal_path_required");
  const journalPath = path.resolve(options.journalPath);
  const lockPath = journalPath + ".lock";
  const maxJournalBytes = options.maxJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES;
  if (!Number.isSafeInteger(maxJournalBytes) || maxJournalBytes < 1024) throw new RangeError("invalid_video_job_journal_limit");
  await mkdir(path.dirname(journalPath), { recursive: true, mode: 0o700 });
  let lockHandle;
  let journalHandle;
  try {
    lockHandle = await open(lockPath, "wx", 0o600);
    await lockHandle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }) + "\n");
    await lockHandle.sync();
    journalHandle = await open(journalPath, "a+", 0o600);
  } catch (error) {
    if (journalHandle) await journalHandle.close().catch(() => {});
    if (lockHandle) { await lockHandle.close().catch(() => {}); await unlink(lockPath).catch(() => {}); }
    if (error?.code === "EEXIST") throw new Error("video_job_store_locked_single_writer_required");
    throw error;
  }

  const jobs = new Map();
  const idempotency = new Map();
  let closed = false;
  let tail = Promise.resolve();
  const serialize = (operation) => {
    const result = tail.then(() => { if (closed) throw new Error("video_job_store_closed"); return operation(); });
    tail = result.catch(() => {});
    return result;
  };

  try {
    const journal = await journalHandle.readFile({ encoding: "utf8" });
    if (journal.length && !journal.endsWith("\n")) throw new Error("video_job_journal_incomplete_tail");
    for (const line of journal.split("\n").filter(Boolean)) {
      let event;
      try { event = JSON.parse(line); } catch { throw new Error("video_job_journal_corrupt_json"); }
      applyJournalEvent(event, jobs, idempotency);
    }
    const info = await journalHandle.stat();
    if (info.size > maxJournalBytes) throw new Error("video_job_journal_capacity_reached");
  } catch (error) {
    await journalHandle.close().catch(() => {});
    await lockHandle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
    throw error;
  }

  async function append(event) {
    const line = JSON.stringify(event) + "\n";
    const info = await journalHandle.stat();
    if (info.size + Buffer.byteLength(line) > maxJournalBytes) throw new Error("video_job_journal_capacity_reached");
    await journalHandle.write(line);
    await journalHandle.sync();
  }

  return Object.freeze({
    async create(input, now) {
      return serialize(async () => {
        assertSafeRequest(input?.request);
        const requestBytes = Buffer.byteLength(JSON.stringify(input.request));
        if (requestBytes > 64 * 1024) throw new RangeError("video_job_request_too_large");
        const candidate = createVideoJob(input, now);
        const key = candidate.tenantId + ":" + candidate.idempotencyKey;
        const existingId = idempotency.get(key);
        if (existingId) return { created: false, job: clone(jobs.get(existingId)) };
        if (jobs.has(candidate.id)) throw new Error("video_job_id_conflict");
        await append({ type: "job_created", job: candidate });
        jobs.set(candidate.id, clone(candidate));
        idempotency.set(key, candidate.id);
        return { created: true, job: clone(candidate) };
      });
    },
    get(jobId, actorTenantId) {
      if (closed) throw new Error("video_job_store_closed");
      const job = jobs.get(jobId);
      return job && job.tenantId === actorTenantId ? clone(job) : null;
    },
    list(actorTenantId) {
      if (closed) throw new Error("video_job_store_closed");
      return [...jobs.values()].filter((job) => job.tenantId === actorTenantId).map(clone);
    },
    async transition(jobId, nextState, options = {}) {
      return serialize(async () => {
        const current = jobs.get(jobId);
        if (!current) throw new Error("video_job_not_found");
        const next = transitionVideoJob(current, nextState, options);
        const event = {
          type: "job_transition", jobId, tenantId: current.tenantId, nextState,
          at: next.updatedAt, eventName: options.event ?? null, version: next.version, job: next,
        };
        await append(event);
        jobs.set(jobId, clone(next));
        return clone(next);
      });
    },
    async close() {
      await serialize(async () => {
        await journalHandle.sync();
        closed = true;
        await journalHandle.close();
        await lockHandle.close();
        await unlink(lockPath);
      });
    },
    diagnostics() {
      if (closed) throw new Error("video_job_store_closed");
      return Object.freeze({ mode: "local_append_only_journal", durability: "fsync_per_event", singleWriter: true, encryptedAtRest: false, jobs: jobs.size, journalPath });
    },
  });
}
