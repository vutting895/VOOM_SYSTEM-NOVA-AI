import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const workerBase = (process.env.NOVA_AI_API_URL || 'https://voom-system-nova-ai.suwapat787.workers.dev').replace(/\/$/, '');

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function authenticate(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  const token = match?.[1];
  if (!token) return { ok: false, status: 401, error: 'authentication_required' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 503, error: 'authentication_not_configured' };
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, status: 401, error: 'invalid_or_expired_session' };
    return { ok: true, token };
  } catch {
    return { ok: false, status: 503, error: 'authentication_provider_unavailable' };
  }
}

export async function POST(request) {
  let raw;
  try { raw = await request.text(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (new TextEncoder().encode(raw).byteLength > 12000) return json({ error: 'request_too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.candles)) {
    return json({ error: 'invalid_candle_data' }, 400);
  }
  if (body.candles.length < 3 || body.candles.length > 120) {
    return json({ error: 'candle_count_out_of_range' }, 400);
  }
  for (const candle of body.candles) {
    if (!candle || typeof candle !== 'object'
      || !['open', 'high', 'low', 'close'].every((key) => Number.isFinite(Number(candle[key])))) {
      return json({ error: 'invalid_candle_data' }, 400);
    }
  }

  const auth = await authenticate(request);
  if (!auth.ok) return json({ error: auth.error, executionEnabled: false, liveTradingEnabled: false }, auth.status);

  let workerUrl;
  try {
    workerUrl = new URL('/api/backtest', workerBase);
    if (workerUrl.protocol !== 'https:') throw new Error('invalid_worker_url');
  } catch {
    return json({ error: 'ai_provider_unavailable', executionEnabled: false, liveTradingEnabled: false }, 503);
  }
  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + auth.token,
      },
      body: JSON.stringify({ candles: body.candles }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = [400, 401, 413, 503].includes(response.status) ? response.status : 502;
      const error = typeof payload.error === 'string' && /^[a-z0-9_-]{2,64}$/.test(payload.error)
        ? payload.error
        : 'backtest_unavailable';
      return json({ error, executionEnabled: false, liveTradingEnabled: false }, status);
    }
    return json({ ...payload, executionEnabled: false, liveTradingEnabled: false });
  } catch {
    return json({ error: 'backtest_unavailable', executionEnabled: false, liveTradingEnabled: false }, 502);
  }
}
