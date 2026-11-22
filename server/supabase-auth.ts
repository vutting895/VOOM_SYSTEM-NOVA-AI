import type { RequestHandler } from 'express';

export function createSupabaseAuthMiddleware(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): RequestHandler {
  return async (_req, res, next) => {
    const authorization = _req.headers.authorization || '';
    if (!/^Bearer\\s+\\S+$/i.test(authorization)) {
      res.status(401).json({ ok: false, error: 'authentication_required' });
      return;
    }
    const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\\/$/, '');
    const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl.startsWith('https://') || !publishableKey) {
      res.status(503).json({ ok: false, error: 'authentication_service_not_configured' });
      return;
    }
    try {
      const response = await fetcher(supabaseUrl + '/auth/v1/user', {
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
