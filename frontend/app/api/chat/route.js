import { createClient } from '@supabase/supabase-js';
import { validateIntentEnvelope } from '../../../../integrations/nova-ai-worker/intent-contract.js';
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
  const accessToken = match?.[1];
  if (!accessToken) return { ok: false, status: 401, error: 'authentication_required' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 503, error: 'authentication_not_configured' };

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
      return { ok: false, status: 401, error: 'invalid_or_expired_session' };
    }
    return { ok: true, accessToken };
  } catch {
    return { ok: false, status: 503, error: 'authentication_provider_unavailable' };
  }
}

export async function POST(request) {
  // Authenticate before reading or validating request payloads, keeping the
  // private chat API's failure behavior consistent for malformed and valid bodies.
  const auth = await authenticate(request);
  if (!auth.ok) {
    return json({
      error: auth.error,
      executionEnabled: false,
      liveTradingEnabled: false,
    }, auth.status);
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: 'invalid_request_body' }, 400);
  }
  if (new TextEncoder().encode(raw).byteLength > 12000) {
    return json({ error: 'request_too_large' }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.messages)) {
    return json({ error: 'invalid_messages' }, 400);
  }

  const messages = body.messages.slice(-8);
  if (!messages.length || messages.length !== body.messages.length) {
    return json({ error: 'invalid_messages' }, 400);
  }
  let total = 0;
  for (const item of messages) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
      return json({ error: 'invalid_messages' }, 400);
    }
    const content = item.content.trim();
    if (!content || content.length > 1200) return json({ error: 'invalid_message_length' }, 400);
    total += content.length;
    if (total > 8000) return json({ error: 'conversation_too_large' }, 413);
  }
  if (messages[messages.length - 1].role !== 'user' || !messages.some((item) => item.role === 'user')) {
    return json({ error: 'invalid_conversation_order' }, 400);
  }

  let workerUrl;
  try {
    workerUrl = new URL('/api/chat', workerBase);
    if (workerUrl.protocol !== 'https:') throw new Error('invalid_worker_url');
  } catch {
    return json({ error: 'ai_provider_unavailable' }, 503);
  }

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + auth.accessToken,
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(35000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = [400, 401, 413, 429, 503].includes(response.status) ? response.status : 502;
      const error = typeof payload.error === 'string' && /^[a-z_]{2,64}$/.test(payload.error)
        ? payload.error
        : 'ai_provider_unavailable';
      return json({ error, executionEnabled: false, liveTradingEnabled: false }, status);
    }
    if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 10000) {
      return json({ error: 'ai_provider_unavailable', executionEnabled: false, liveTradingEnabled: false }, 502);
    }

    // Treat UI metadata as untrusted data even when it comes from our AI Worker.
    // Only a strict, fixed-catalog intent envelope may cross into the browser.
    let intent = null;
    if (payload.intent !== undefined && payload.intent !== null) {
      const checked = validateIntentEnvelope(payload.intent);
      if (!checked.ok) {
        return json({ error: 'invalid_intent_response', executionEnabled: false, liveTradingEnabled: false }, 502);
      }
      intent = checked.value;
    }
    return json({
      message: payload.message.trim(),
      provider: payload.provider === 'cloudflare-workers-ai' ? payload.provider : 'unknown',
      model: typeof payload.model === 'string' ? payload.model : null,
      intent,
      executionEnabled: false,
      liveTradingEnabled: false,
    });
  } catch {
    return json({ error: 'ai_provider_unavailable', executionEnabled: false, liveTradingEnabled: false }, 502);
  }
}
