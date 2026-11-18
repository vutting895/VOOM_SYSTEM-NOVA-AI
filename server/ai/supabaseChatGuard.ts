import type { NextFunction, Request, Response } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SupabaseChatAuthOptions {
  supabaseUrl?: string;
  publicApiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type SupabaseChatAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 503; error: "authentication_required" | "invalid_or_expired_session" | "authentication_not_configured" | "authentication_provider_unavailable" };

export async function verifySupabaseChatSession(
  authorization: string | undefined,
  options: SupabaseChatAuthOptions = {},
): Promise<SupabaseChatAuthResult> {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization || "");
  if (!match || match[1].length > 16_384) {
    return { ok: false, status: 401, error: "authentication_required" };
  }

  const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const publicApiKey = (
    options.publicApiKey ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  ).trim();

  if (!supabaseUrl || !publicApiKey) {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }

  let authUrl: URL;
  try {
    authUrl = new URL("/auth/v1/user", supabaseUrl);
    const localHttp = authUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(authUrl.hostname);
    if ((!localHttp && authUrl.protocol !== "https:") || authUrl.username || authUrl.password) {
      return { ok: false, status: 503, error: "authentication_not_configured" };
    }
  } catch {
    return { ok: false, status: 503, error: "authentication_not_configured" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestInit: RequestInit = {
    method: "GET",
    headers: {
      apikey: publicApiKey,
      Authorization: "Bearer " + match[1],
      Accept: "application/json",
    },
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
  };

  try {
    let response = await fetchImpl(authUrl, requestInit);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      let redirectedUrl: URL;
      try {
        redirectedUrl = new URL(location, authUrl);
      } catch {
        return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      }
      if (redirectedUrl.origin !== authUrl.origin || redirectedUrl.protocol !== authUrl.protocol) {
        return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      }
      response = await fetchImpl(redirectedUrl, requestInit);
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, status: 503, error: "authentication_provider_unavailable" };
      }
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    if (!response.ok) {
      return { ok: false, status: 503, error: "authentication_provider_unavailable" };
    }

    const user = await response.json() as { id?: unknown; is_anonymous?: unknown };
    if (typeof user?.id !== "string" || !UUID_PATTERN.test(user.id) || user.is_anonymous === true) {
      return { ok: false, status: 401, error: "invalid_or_expired_session" };
    }
    return { ok: true, userId: user.id.toLowerCase() };
  } catch {
    return { ok: false, status: 503, error: "authentication_provider_unavailable" };
  }
}

export interface InMemoryUserLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  maxConcurrent?: number;
  now?: () => number;
}

export function createInMemoryUserLimiter(options: InMemoryUserLimiterOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 10;
  const maxConcurrent = options.maxConcurrent ?? 2;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { windowStart: number; requests: number; active: number }>();

  return {
    acquire(userId: string):
      | { allowed: true; release: () => void }
      | { allowed: false; retryAfterSeconds: number } {
      const currentTime = now();
      if (entries.size > 1_000) {
        for (const [key, entry] of entries) {
          if (entry.active === 0 && currentTime - entry.windowStart >= windowMs) entries.delete(key);
        }
      }

      let entry = entries.get(userId);
      if (!entry || currentTime - entry.windowStart >= windowMs) {
        entry = { windowStart: currentTime, requests: 0, active: 0 };
        entries.set(userId, entry);
      }

      if (entry.active >= maxConcurrent) {
        return { allowed: false, retryAfterSeconds: 1 };
      }
      if (entry.requests >= maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (currentTime - entry.windowStart)) / 1_000)),
        };
      }

      entry.requests += 1;
      entry.active += 1;
      let released = false;
      return {
        allowed: true,
        release: () => {
          if (released) return;
          released = true;
          entry!.active = Math.max(0, entry!.active - 1);
        },
      };
    },
  };
}

export function createSupabaseChatGuard(
  options: {
    auth?: SupabaseChatAuthOptions;
    limiter?: ReturnType<typeof createInMemoryUserLimiter>;
  } = {},
) {
  const limiter = options.limiter ?? createInMemoryUserLimiter();

  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await verifySupabaseChatSession(req.header("authorization"), options.auth);
    res.setHeader("Cache-Control", "no-store");
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error, code: auth.error.toUpperCase() });
    }

    const lease = limiter.acquire(auth.userId);
    if (!lease.allowed) {
      res.setHeader("Retry-After", String(lease.retryAfterSeconds));
      return res.status(429).json({ error: "rate_limit_exceeded", code: "AI_CHAT_RATE_LIMITED" });
    }

    res.once("finish", lease.release);
    res.once("close", lease.release);
    return next();
  };
}
