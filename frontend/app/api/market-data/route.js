import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_HUB = 'https://voom-system-hub.suwapat787.workers.dev';
const TIMEFRAMES = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']);
const SYMBOL = /^[A-Za-z0-9._-]{1,40}$/;

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

async function hubGet(base, path, token) {
  const url = new URL(path, base);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function validBar(bar) {
  if (!bar || typeof bar !== 'object' || typeof bar.time !== 'string') return false;
  const time = Date.parse(bar.time);
  const values = ['open', 'high', 'low', 'close'].map((key) => Number(bar[key]));
  const volume = Number(bar.tick_volume ?? bar.real_volume ?? 0);
  if (!Number.isFinite(time) || values.some((value) => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(volume) || volume < 0) return false;
  const [open, high, low, close] = values;
  return high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
}

export async function GET(request) {
  const url = new URL(request.url);
  const symbol = String(url.searchParams.get('symbol') || 'XAUUSDm').trim();
  const timeframe = String(url.searchParams.get('timeframe') || 'M5').toUpperCase();
  const count = url.searchParams.has('count') ? Number(url.searchParams.get('count')) : 120;
  if (!SYMBOL.test(symbol)) return json({ error: 'valid_symbol_required' }, 400);
  if (!TIMEFRAMES.has(timeframe)) return json({ error: 'unsupported_timeframe' }, 400);
  if (!Number.isInteger(count) || count < 3 || count > 120) return json({ error: 'count_must_be_between_3_and_120' }, 400);

  const auth = await authenticate(request);
  if (!auth.ok) return json({ error: auth.error, ordersEnabled: false, liveTradingEnabled: false }, auth.status);

  const hubBase = String(process.env.SYSTEM_HUB_URL || process.env.NEXT_PUBLIC_SYSTEM_HUB_URL || DEFAULT_HUB).replace(/\/+$/, '');
  let parsedHub;
  try {
    parsedHub = new URL(hubBase);
    if (parsedHub.protocol !== 'https:' || parsedHub.username || parsedHub.password) throw new Error('invalid_hub_url');
  } catch {
    return json({ error: 'market_data_provider_not_configured' }, 503);
  }

  try {
    const connectionResult = await hubGet(parsedHub, '/v1/connections', auth.token);
    if (!connectionResult.response.ok || !Array.isArray(connectionResult.payload.connections)) {
      return json({ error: 'connection_registry_unavailable', ordersEnabled: false, liveTradingEnabled: false }, 502);
    }
    const eligible = connectionResult.payload.connections.filter((item) =>
      item?.provider === 'exness_mt5'
      && item?.environment === 'demo'
      && item?.recordStatus === 'connected'
      && item?.bridgeAllocated === true
    );
    if (eligible.length === 0) {
      return json({ error: 'exness_demo_bridge_not_ready', state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false }, 409);
    }
    if (eligible.length !== 1 || typeof eligible[0].connectionId !== 'string') {
      return json({ error: 'ambiguous_demo_connection', state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false }, 409);
    }

    const connectionId = eligible[0].connectionId;
    const quotePath = '/v1/connections/' + encodeURIComponent(connectionId)
      + '/quotes?symbol=' + encodeURIComponent(symbol)
      + '&timeframe=' + encodeURIComponent(timeframe)
      + '&count=' + encodeURIComponent(String(count));
    const quoteResult = await hubGet(parsedHub, quotePath, auth.token);
    if (!quoteResult.response.ok || quoteResult.payload?.state !== 'data_verified'
      || !quoteResult.payload?.quote || !Array.isArray(quoteResult.payload.quote.bars)) {
      const status = [401, 403, 404, 409].includes(quoteResult.response.status) ? quoteResult.response.status : 502;
      return json({
        error: typeof quoteResult.payload?.state === 'string' ? quoteResult.payload.state : 'market_data_unavailable',
        state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false,
      }, status);
    }

    const quote = quoteResult.payload.quote;
    if (quote.symbol !== symbol || quote.timeframe !== timeframe || quote.bars.length < 3
      || !quote.bars.every(validBar)) {
      return json({ error: 'invalid_market_data_payload', state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false }, 502);
    }
    const orderedBars = [...quote.bars].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    for (let index = 1; index < orderedBars.length; index += 1) {
      if (Date.parse(orderedBars[index].time) <= Date.parse(orderedBars[index - 1].time)) {
        return json({ error: 'non_chronological_market_data', state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false }, 502);
      }
    }

    const tickTime = quote.tick?.time ? Date.parse(quote.tick.time) : NaN;
    const tickAgeMs = Number.isFinite(tickTime) ? Math.max(0, Date.now() - tickTime) : null;
    const tick = quote.tick && [quote.tick.bid, quote.tick.ask].every((value) => Number.isFinite(Number(value)))
      ? { bid: Number(quote.tick.bid), ask: Number(quote.tick.ask), last: Number(quote.tick.last), time: quote.tick.time }
      : null;
    if (tick && (tick.bid <= 0 || tick.ask <= 0 || tick.ask < tick.bid)) {
      return json({ error: 'invalid_market_tick', state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false }, 502);
    }

    return json({
      state: 'data_verified',
      source: 'exness_mt5_demo_via_nova_system_hub',
      mode: 'read-only',
      symbol,
      timeframe,
      tick,
      tickAgeMs,
      freshness: tickAgeMs === null ? 'unknown' : tickAgeMs <= 60000 ? 'fresh' : 'stale',
      bars: orderedBars.map((bar) => ({
        timestamp: bar.time,
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: Number(bar.tick_volume ?? bar.real_volume ?? 0),
      })),
      count: orderedBars.length,
      receivedAt: new Date().toISOString(),
      asOf: typeof quote.as_of === 'string' ? quote.as_of : null,
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false,
    });
  } catch {
    return json({ error: 'market_data_provider_unavailable', state: 'unavailable', ordersEnabled: false, liveTradingEnabled: false }, 502);
  }
}
