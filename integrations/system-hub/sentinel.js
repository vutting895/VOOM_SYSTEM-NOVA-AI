export const SENTINEL_POLICY_VERSION = "2026-10-31.1";
export const SENTINEL_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 256;

const EVENT_TYPES = new Set([
  "invalid_or_expired_session",
  "origin_rejected",
  "resource_not_found",
  "invalid_resource_id"
]);

const EVENT_WEIGHTS = Object.freeze({
  invalid_or_expired_session: 2,
  origin_rejected: 3,
  resource_not_found: 3,
  invalid_resource_id: 4
});

const RULES = Object.freeze([
  { event: "invalid_or_expired_session", actorType: "ip", windowMs: 5 * 60_000, threshold: 15, cooldownMs: 60_000, pattern: "credential_spray" },
  { event: "origin_rejected", actorType: "ip", windowMs: 2 * 60_000, threshold: 8, cooldownMs: 120_000, pattern: "origin_probing" },
  { event: "resource_not_found", actorType: "user", windowMs: 5 * 60_000, threshold: 10, cooldownMs: 180_000, pattern: "resource_enumeration" },
  { event: "invalid_resource_id", actorType: "user", windowMs: 5 * 60_000, threshold: 8, cooldownMs: 180_000, pattern: "malformed_resource_probing" }
]);

export function assessSentinelThreat(events, actorType, now = Date.now()) {
  const recent = (Array.isArray(events) ? events : [])
    .filter((item) =>
      item && item.actorType === actorType &&
      EVENT_TYPES.has(item.event) &&
      Number.isFinite(item.at) &&
      item.at <= now &&
      now - item.at <= 5 * 60_000
    );

  for (const rule of RULES) {
    if (rule.actorType !== actorType) continue;
    const count = recent.filter((item) => item.event === rule.event && now - item.at <= rule.windowMs).length;
    if (count >= rule.threshold) {
      return {
        detected: true,
        pattern: rule.pattern,
        score: count * EVENT_WEIGHTS[rule.event],
        cooldownMs: rule.cooldownMs,
        policyVersion: SENTINEL_POLICY_VERSION
      };
    }
  }

  const types = new Set(recent.map((item) => item.event));
  const score = recent.reduce((total, item) => total + EVENT_WEIGHTS[item.event], 0);
  if (types.size >= 2 && score >= 24) {
    return {
      detected: true,
      pattern: "mixed_reconnaissance",
      score,
      cooldownMs: 180_000,
      policyVersion: SENTINEL_POLICY_VERSION
    };
  }

  return {
    detected: false,
    pattern: null,
    score,
    cooldownMs: 0,
    policyVersion: SENTINEL_POLICY_VERSION
  };
}

function safeState(value, now) {
  const source = value && typeof value === "object" ? value : {};
  const events = Array.isArray(source.events) ? source.events : [];
  return {
    events: events.filter((item) =>
      item && typeof item === "object" &&
      EVENT_TYPES.has(item.event) &&
      ["ip", "user"].includes(item.actorType) &&
      Number.isFinite(item.at) &&
      item.at <= now &&
      now - item.at <= SENTINEL_RETENTION_MS
    ).slice(-MAX_EVENTS),
    blockedUntil: Number.isFinite(source.blockedUntil) ? source.blockedUntil : 0,
    pattern: typeof source.pattern === "string" ? source.pattern.slice(0, 64) : null,
    policyVersion: SENTINEL_POLICY_VERSION
  };
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export class SentinelState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname !== "/check" && url.pathname !== "/record") {
      return response({ error: "not_found" }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return response({ error: "invalid_json" }, 400);
    }
    const actorType = body?.actorType;
    if (!["ip", "user"].includes(actorType)) return response({ error: "invalid_actor_type" }, 400);
    if (url.pathname === "/record" && !EVENT_TYPES.has(body?.event)) {
      return response({ error: "invalid_event" }, 400);
    }

    const now = Date.now();
    let result;
    await this.ctx.storage.transaction(async (txn) => {
      const state = safeState(await txn.get("state"), now);
      if (url.pathname === "/record") {
        state.events.push({ event: body.event, actorType, at: now });
        state.events = state.events.slice(-MAX_EVENTS);
        const assessment = assessSentinelThreat(state.events, actorType, now);
        if (assessment.detected) {
          state.blockedUntil = Math.max(state.blockedUntil, now + assessment.cooldownMs);
          state.pattern = assessment.pattern;
        }
        result = {
          recorded: true,
          blocked: state.blockedUntil > now,
          retryAfterSeconds: state.blockedUntil > now ? Math.max(1, Math.ceil((state.blockedUntil - now) / 1000)) : 0,
          pattern: state.pattern,
          policyVersion: SENTINEL_POLICY_VERSION
        };
      } else {
        result = {
          blocked: state.blockedUntil > now,
          retryAfterSeconds: state.blockedUntil > now ? Math.max(1, Math.ceil((state.blockedUntil - now) / 1000)) : 0,
          pattern: state.blockedUntil > now ? state.pattern : null,
          policyVersion: SENTINEL_POLICY_VERSION
        };
      }
      await txn.put("state", state);
    });

    await this.ctx.storage.setAlarm(now + SENTINEL_RETENTION_MS);
    return response(result, 200);
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.ctx.storage.deleteAll();
    });
  }
}

async function hmacActorName(secret, actorType, identity) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = new TextEncoder().encode("nova-sentinel:v1:" + actorType + ":" + identity);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function callSentinel(env, actorType, identity, action, event = null) {
  if (env.SENTINEL_ENABLED !== "true") return { enabled: false, ready: true, blocked: false };
  const secret = typeof env.SENTINEL_HASH_SECRET === "string" ? env.SENTINEL_HASH_SECRET : "";
  if (!env.SENTINEL_STATE || secret.length < 32 || !["ip", "user"].includes(actorType) ||
    typeof identity !== "string" || !identity || !["check", "record"].includes(action)) {
    return { enabled: true, ready: false, blocked: false };
  }
  if (action === "record" && !EVENT_TYPES.has(event)) {
    return { enabled: true, ready: false, blocked: false };
  }

  try {
    const name = await hmacActorName(secret, actorType, identity);
    const id = env.SENTINEL_STATE.idFromName(name);
    const stub = env.SENTINEL_STATE.get(id);
    const payload = action === "record" ? { actorType, event } : { actorType };
    const result = await stub.fetch("https://sentinel.internal/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!result.ok) return { enabled: true, ready: false, blocked: false };
    const data = await result.json();
    if (!data || typeof data.blocked !== "boolean") return { enabled: true, ready: false, blocked: false };
    return {
      enabled: true,
      ready: true,
      blocked: data.blocked,
      retryAfterSeconds: Number.isInteger(data.retryAfterSeconds) ? data.retryAfterSeconds : 0,
      pattern: typeof data.pattern === "string" ? data.pattern : null,
      policyVersion: SENTINEL_POLICY_VERSION
    };
  } catch {
    return { enabled: true, ready: false, blocked: false };
  }
}
