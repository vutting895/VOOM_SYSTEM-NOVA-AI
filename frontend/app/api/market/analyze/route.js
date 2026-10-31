import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const workerBase = (process.env.NOVA_AI_API_URL || 'https://voom-system-nova-ai.suwapat787.workers.dev').replace(/\/$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL = /^[A-Za-z0-9._-]{1,40}$/;
const TIMEFRAMES = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']);

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
  // Verify the signed-in owner before parsing any user-controlled identifiers or payloads.
  const auth = await authenticate(request);
  if (!auth.ok) return json({ error: auth.error, executionEnabled: false, liveTradingEnabled: false }, auth.status);

  let raw;
  try { raw = await request.text(); } catch { return json({ error: 'invalid_request_body' }, 400); }
  if (new TextEncoder().encode(raw).byteLength > 2048) return json({ error: 'request_too_large' }, 413);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_market_analysis_input' }, 400);
  const allowed = new Set(['connectionId', 'symbol', 'timeframe', 'count']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return json({ error: 'unknown_market_analysis_field' }, 400);

  const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  const timeframe = typeof body.timeframe === 'string' ? body.timeframe.toUpperCase() : 'M5';
  const count = body.count === undefined ? 200 : body.count;
  if (!UUID.test(connectionId)) return json({ error: 'valid_connection_id_required' }, 400);
  if (!SYMBOL.test(symbol)) return json({ error: 'valid_mt5_symbol_required' }, 400);
  if (!TIMEFRAMES.has(timeframe)) return json({ error: 'unsupported_mt5_timeframe' }, 400);
  if (!Number.isInteger(count) || count < 61 || count > 500) return json({ error: 'count_must_be_between_61_and_500' }, 400);

  let workerUrl;
  try {
    workerUrl = new URL('/api/market/analyze', workerBase);
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
      body: JSON.stringify({ connectionId, symbol, timeframe, count }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = [400, 401, 404, 409, 413, 429, 503].includes(response.status) ? response.status : 502;
      const error = typeof payload.error === 'string' && /^[a-z0-9_-]{2,64}$/.test(payload.error)
        ? payload.error
        : 'market_analysis_unavailable';
      return json({ error, executionEnabled: false, ordersEnabled: false, liveTradingEnabled: false }, status);
    }
    if (
      payload?.source?.provider !== 'exness_mt5' ||
      payload?.source?.dataVerified !== true ||
      !['demo', 'live'].includes(payload?.source?.environment) ||
      payload?.source?.symbol !== symbol ||
      payload?.source?.timeframe !== timeframe ||
      !['bullish_watch', 'bearish_watch', 'neutral'].includes(payload?.analysis?.signal) ||
      typeof payload?.analysis?.rationale !== 'string' ||
      payload.analysis.rationale.length > 2000 ||
      payload?.analysis?.riskStatus !== 'not_evaluated' ||
      payload?.analysis?.currentBarExcluded !== true ||
      payload?.analysis?.smc?.ok !== true ||
      payload?.analysis?.smc?.ordersSubmitted !== false ||
      payload?.analysis?.smc?.liveTradingEnabled !== false ||
      payload.executionEnabled !== false ||
      payload.ordersEnabled !== false ||
      payload.liveTradingEnabled !== false
    ) {
      return json({ error: 'invalid_market_analysis_response', executionEnabled: false, ordersEnabled: false, liveTradingEnabled: false }, 502);
    }
    return json(payload);
  } catch {
    return json({ error: 'market_analysis_unavailable', executionEnabled: false, ordersEnabled: false, liveTradingEnabled: false }, 502);
  }
}
