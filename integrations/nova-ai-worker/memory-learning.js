const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETENTION_DAYS = new Set([30, 90, 365]);
const FACT_CATEGORIES = new Set(["preference", "project", "workflow"]);
const FEEDBACK_CATEGORIES = new Set(["accuracy", "helpfulness", "relevance", "safety"]);
const PROVIDERS = new Set(["cloudflare-workers-ai", "gemini", "openai", "anthropic", "ollama", "unknown"]);
const MAX_BODY_BYTES = 8 * 1024;

export class MemoryServiceError extends Error {
  constructor(code, status = 503) { super(code); this.name = "MemoryServiceError"; this.code = code; this.status = status; }
}

function bearer(request) {
  return /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "")?.[1] || null;
}

function databaseUrl(env, path) {
  let base;
  try { base = new URL(env.SUPABASE_URL); } catch { throw new MemoryServiceError("memory_not_configured", 503); }
  if (base.protocol !== "https:" || !env.SUPABASE_PUBLISHABLE_KEY) throw new MemoryServiceError("memory_not_configured", 503);
  return new URL(path, base);
}

async function dbRequest(request, env, auth, path, options = {}) {
  const token = bearer(request);
  if (!token || !auth?.userId) throw new MemoryServiceError("authentication_required", 401);
  let response;
  try {
    response = await fetch(databaseUrl(env, path), {
      method: options.method || "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token, Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
  } catch { throw new MemoryServiceError("memory_provider_unavailable", 503); }
  const raw = await response.text().catch(() => "");
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { if (response.ok) throw new MemoryServiceError("memory_provider_invalid_response", 503); } }
  if (!response.ok) {
    if (response.status === 401) throw new MemoryServiceError("invalid_or_expired_session", 401);
    if (response.status === 403) throw new MemoryServiceError("memory_access_denied", 403);
    if (response.status === 404) throw new MemoryServiceError("memory_not_found", 404);
    if (response.status === 409) throw new MemoryServiceError("memory_conflict", 409);
    throw new MemoryServiceError("memory_provider_unavailable", 503);
  }
  return data;
}

async function parseJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    throw new MemoryServiceError("content_type_must_be_application_json", 415);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new MemoryServiceError("request_too_large", 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value;
  } catch { throw new MemoryServiceError("invalid_json_object", 400); }
}

export function validateMemorySettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.memoryEnabled !== "boolean" || typeof value.feedbackEnabled !== "boolean") {
    throw new MemoryServiceError("invalid_memory_settings", 400);
  }
  const retentionDays = value.retentionDays ?? 90;
  if (!Number.isInteger(retentionDays) || !RETENTION_DAYS.has(retentionDays)) throw new MemoryServiceError("invalid_retention_days", 400);
  return { memory_enabled: value.memoryEnabled, feedback_enabled: value.feedbackEnabled, retention_days: retentionDays };
}

export function validateMemoryFact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !FACT_CATEGORIES.has(value.category)
    || typeof value.content !== "string" || !value.content.trim() || value.content.trim().length > 500) {
    throw new MemoryServiceError("invalid_memory_fact", 400);
  }
  return { category: value.category, content: value.content.trim() };
}

export function validateLearningFeedback(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.responseId !== "string" || !UUID.test(value.responseId)
    || !Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5
    || !FEEDBACK_CATEGORIES.has(value.category)) throw new MemoryServiceError("invalid_learning_feedback", 400);
  if (value.threadId != null && (typeof value.threadId !== "string" || !UUID.test(value.threadId))) {
    throw new MemoryServiceError("invalid_learning_feedback", 400);
  }
  const provider = PROVIDERS.has(value.provider) ? value.provider : "unknown";
  const model = typeof value.model === "string" && /^[A-Za-z0-9@._:/-]{1,120}$/.test(value.model) ? value.model : null;
  return { response_id: value.responseId, rating: value.rating, category: value.category, thread_id: value.threadId || null, provider, model };
}

export async function readMemorySettings(request, env, auth) {
  const rows = await dbRequest(request, env, auth,
    "/rest/v1/nova_ai_memory_settings?select=memory_enabled,feedback_enabled,retention_days&user_id=eq."
    + encodeURIComponent(auth.userId) + "&limit=1");
  const row = Array.isArray(rows) ? rows[0] : null;
  return { memoryEnabled: row?.memory_enabled === true, feedbackEnabled: row?.feedback_enabled === true,
    retentionDays: RETENTION_DAYS.has(row?.retention_days) ? row.retention_days : 90 };
}

export async function loadMemoryContext(request, env, auth, threadId) {
  if (typeof threadId !== "string" || !UUID.test(threadId)) throw new MemoryServiceError("invalid_memory_thread", 400);
  const settings = await readMemorySettings(request, env, auth);
  if (!settings.memoryEnabled) throw new MemoryServiceError("memory_disabled", 409);
  await dbRequest(request, env, auth, "/rest/v1/rpc/nova_ai_purge_expired_memory",
    { method: "POST", body: {}, prefer: "return=minimal" });
  const threads = await dbRequest(request, env, auth,
    "/rest/v1/nova_ai_memory_threads?select=id&user_id=eq." + encodeURIComponent(auth.userId)
    + "&id=eq." + encodeURIComponent(threadId) + "&limit=1");
  if (!Array.isArray(threads) || !threads.length) throw new MemoryServiceError("memory_thread_not_found", 404);
  const messages = await dbRequest(request, env, auth,
    "/rest/v1/nova_ai_memory_messages?select=role,content,created_at&user_id=eq." + encodeURIComponent(auth.userId)
    + "&thread_id=eq." + encodeURIComponent(threadId) + "&order=created_at.desc&limit=12");
  const facts = await dbRequest(request, env, auth,
    "/rest/v1/nova_ai_memory_facts?select=category,content&user_id=eq." + encodeURIComponent(auth.userId)
    + "&order=created_at.desc&limit=20");
  return { settings, messages: Array.isArray(messages) ? messages.reverse().map(({ role, content }) => ({ role, content })) : [],
    facts: Array.isArray(facts) ? facts.map(({ category, content }) => ({ category, content: String(content || "").slice(0, 500) })) : [] };
}

export async function persistChatExchange(request, env, auth, threadId, userContent, assistantContent) {
  if (typeof threadId !== "string" || !UUID.test(threadId)) throw new MemoryServiceError("invalid_memory_thread", 400);
  if (typeof userContent !== "string" || !userContent.trim() || typeof assistantContent !== "string" || !assistantContent.trim()) {
    throw new MemoryServiceError("invalid_memory_exchange", 400);
  }
  await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_messages", {
    method: "POST", prefer: "return=minimal",
    body: [
      { user_id: auth.userId, thread_id: threadId, role: "user", content: userContent.trim() },
      { user_id: auth.userId, thread_id: threadId, role: "assistant", content: assistantContent.trim() },
    ],
  });
  await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_threads?id=eq." + encodeURIComponent(threadId)
    + "&user_id=eq." + encodeURIComponent(auth.userId), {
    method: "PATCH", prefer: "return=minimal", body: { updated_at: new Date().toISOString() },
  });
}

async function handleSettings(request, env, auth, json) {
  if (request.method === "GET") return json({ settings: await readMemorySettings(request, env, auth) });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const value = validateMemorySettings(await parseJson(request));
  const current = await readMemorySettings(request, env, auth);
  if (current.memoryEnabled && !value.memory_enabled) {
    await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_threads?user_id=eq." + encodeURIComponent(auth.userId),
      { method: "DELETE", prefer: "return=minimal" });
    await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_facts?user_id=eq." + encodeURIComponent(auth.userId),
      { method: "DELETE", prefer: "return=minimal" });
  }
  if (current.feedbackEnabled && !value.feedback_enabled) {
    await dbRequest(request, env, auth, "/rest/v1/nova_ai_learning_feedback?user_id=eq." + encodeURIComponent(auth.userId),
      { method: "DELETE", prefer: "return=minimal" });
  }
  const rows = await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_settings?on_conflict=user_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation",
    body: { user_id: auth.userId, ...value },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return json({ settings: { memoryEnabled: row?.memory_enabled === true, feedbackEnabled: row?.feedback_enabled === true,
    retentionDays: row?.retention_days ?? value.retention_days } });
}

async function handleThreads(request, env, auth, json, url) {
  const settings = await readMemorySettings(request, env, auth);
  if (!settings.memoryEnabled) return json({ error: "memory_disabled" }, 409);
  if (request.method === "GET" && url.pathname === "/api/memory/threads") {
    const rows = await dbRequest(request, env, auth,
      "/rest/v1/nova_ai_memory_threads?select=id,title,created_at,updated_at&user_id=eq."
      + encodeURIComponent(auth.userId) + "&order=updated_at.desc&limit=20");
    return json({ threads: Array.isArray(rows) ? rows : [] });
  }
  if (request.method === "POST" && url.pathname === "/api/memory/threads") {
    const body = await parseJson(request);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "NOVA conversation";
    const rows = await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_threads", {
      method: "POST", prefer: "return=representation", body: { user_id: auth.userId, title: title || "NOVA conversation" },
    });
    if (!Array.isArray(rows) || !rows[0]?.id) throw new MemoryServiceError("memory_provider_invalid_response", 503);
    return json({ thread: rows[0] }, 201);
  }
  const messagesMatch = /^\/api\/memory\/threads\/([0-9a-f-]{36})\/messages$/i.exec(url.pathname);
  if (messagesMatch && request.method === "GET") {
    if (!UUID.test(messagesMatch[1])) throw new MemoryServiceError("invalid_memory_thread", 400);
    const threads = await dbRequest(request, env, auth,
      "/rest/v1/nova_ai_memory_threads?select=id&user_id=eq." + encodeURIComponent(auth.userId)
      + "&id=eq." + encodeURIComponent(messagesMatch[1]) + "&limit=1");
    if (!Array.isArray(threads) || !threads.length) throw new MemoryServiceError("memory_thread_not_found", 404);
    const rows = await dbRequest(request, env, auth,
      "/rest/v1/nova_ai_memory_messages?select=id,role,content,created_at&user_id=eq." + encodeURIComponent(auth.userId)
      + "&thread_id=eq." + encodeURIComponent(messagesMatch[1]) + "&order=created_at.asc&limit=100");
    return json({ messages: Array.isArray(rows) ? rows : [] });
  }
  const threadMatch = /^\/api\/memory\/threads\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (threadMatch && request.method === "DELETE") {
    if (!UUID.test(threadMatch[1])) throw new MemoryServiceError("invalid_memory_thread", 400);
    await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_threads?user_id=eq." + encodeURIComponent(auth.userId)
      + "&id=eq." + encodeURIComponent(threadMatch[1]), { method: "DELETE", prefer: "return=minimal" });
    return json({ deleted: true });
  }
  return json({ error: "not_found" }, 404);
}

async function handleFacts(request, env, auth, json, url) {
  const settings = await readMemorySettings(request, env, auth);
  if (!settings.memoryEnabled) return json({ error: "memory_disabled" }, 409);
  if (request.method === "GET" && url.pathname === "/api/memory/facts") {
    const rows = await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_facts?select=id,category,content,created_at&user_id=eq."
      + encodeURIComponent(auth.userId) + "&order=created_at.desc&limit=20");
    return json({ facts: Array.isArray(rows) ? rows : [] });
  }
  if (request.method === "POST" && url.pathname === "/api/memory/facts") {
    const value = validateMemoryFact(await parseJson(request));
    const rows = await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_facts", {
      method: "POST", prefer: "return=representation", body: { user_id: auth.userId, ...value },
    });
    return json({ fact: Array.isArray(rows) ? rows[0] : null }, 201);
  }
  const match = /^\/api\/memory\/facts\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (match && request.method === "DELETE") {
    if (!UUID.test(match[1])) throw new MemoryServiceError("invalid_memory_fact", 400);
    await dbRequest(request, env, auth, "/rest/v1/nova_ai_memory_facts?user_id=eq." + encodeURIComponent(auth.userId)
      + "&id=eq." + encodeURIComponent(match[1]), { method: "DELETE", prefer: "return=minimal" });
    return json({ deleted: true });
  }
  return json({ error: "not_found" }, 404);
}

async function handleFeedback(request, env, auth, json) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const settings = await readMemorySettings(request, env, auth);
  if (!settings.feedbackEnabled) return json({ error: "feedback_disabled" }, 409);
  const value = validateLearningFeedback(await parseJson(request));
  const rows = await dbRequest(request, env, auth, "/rest/v1/nova_ai_learning_feedback?on_conflict=user_id,response_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation",
    body: { user_id: auth.userId, ...value },
  });
  return json({ accepted: true, feedbackId: Array.isArray(rows) ? rows[0]?.id ?? null : null });
}

export async function handleMemoryLearningRequest(request, env, auth, json) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/memory/settings") return await handleSettings(request, env, auth, json);
    if (url.pathname === "/api/memory/threads" || url.pathname.startsWith("/api/memory/threads/")) {
      return await handleThreads(request, env, auth, json, url);
    }
    if (url.pathname === "/api/memory/facts" || url.pathname.startsWith("/api/memory/facts/")) {
      return await handleFacts(request, env, auth, json, url);
    }
    if (url.pathname === "/api/learning/feedback") return await handleFeedback(request, env, auth, json);
    return null;
  } catch (error) {
    if (error instanceof MemoryServiceError) return json({ error: error.code }, error.status);
    return json({ error: "memory_provider_unavailable" }, 503);
  }
}

export function evaluateFeedbackRows(rows, minimumSample = 30) {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row && Number.isInteger(row.rating)
    && row.rating >= 1 && row.rating <= 5 && FEEDBACK_CATEGORIES.has(row.category)) : [];
  const count = safeRows.length;
  const average = count ? safeRows.reduce((sum, row) => sum + row.rating, 0) / count : null;
  const safetyRows = safeRows.filter((row) => row.category === "safety");
  const safetyAverage = safetyRows.length ? safetyRows.reduce((sum, row) => sum + row.rating, 0) / safetyRows.length : null;
  return { sampleCount: count, averageRating: average == null ? null : Number(average.toFixed(3)),
    safetySampleCount: safetyRows.length, safetyAverageRating: safetyAverage == null ? null : Number(safetyAverage.toFixed(3)),
    evidenceStatus: count >= minimumSample ? "feedback_sample_available" : "insufficient_feedback",
    promotionEligible: false,
    note: "User feedback is evaluation evidence only. It does not train, fine-tune, approve, or promote a model." };
}
