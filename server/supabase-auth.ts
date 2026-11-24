import type { RequestHandler } from 'express';

function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const entry of (value || '').split(',')) {
    const candidate = entry.trim();
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' && parsed.origin === candidate &&
          !parsed.username && !parsed.password && parsed.pathname === '/' &&
          !parsed.search && !parsed.hash) origins.add(parsed.origin);
    } catch {
      // Invalid allowlist entries are ignored; an empty set fails closed.
    }
  }
  return origins;
}

function resolveSupabaseAuthUrl(env: Record<string, string | undefined>): string | null {
  const configured = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const allowedOrigins = parseAllowedOrigins(env.NOVA_SUPABASE_ALLOWED_ORIGINS);
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash ||
        !allowedOrigins.has(parsed.origin)) return null;
    return parsed.origin + '/auth/v1/user';
  } catch {
    return null;
  }
}

export function createSupabaseAuthMiddleware(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): RequestHandler {
  return async (_req, res, next) => {
    const authorization = _req.headers.authorization || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      res.status(401).json({ ok: false, error: 'authentication_required' });
      return;
    }
    const authUrl = resolveSupabaseAuthUrl(env);
    const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!authUrl || !publishableKey) {
      res.status(503).json({ ok: false, error: 'authentication_service_not_configured' });
      return;
    }
    try {
      const response = await fetcher(authUrl, {
        method: 'GET', headers: { apikey: publishableKey, Authorization: authorization, Accept: 'application/json' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (response.status === 401 || response.status === 403) {
        res.status(401).json({ ok: false, error: 'invalid_or_expired_session' }); return;
      }
      if (!response.ok) { res.status(503).json({ ok: false, error: 'authentication_service_unavailable' }); return; }
      const user = await response.json() as { id?: unknown };
      if (typeof user?.id !== 'string' || !user.id) { res.status(401).json({ ok: false, error: 'invalid_or_expired_session' }); return; }
      res.locals.novaUserId = user.id;
      next();
    } catch {
      res.status(503).json({ ok: false, error: 'authentication_service_unavailable' });
    }
  };
}

export function scopedThreadId(userId: string, threadId: string): string {
  return \`\${userId}:\${threadId}\`;
}
