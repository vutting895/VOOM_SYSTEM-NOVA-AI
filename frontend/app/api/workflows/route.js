import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { readBoundedRequestBody } from './bounded-body.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const aiWorkerBase = (process.env.NOVA_AI_API_URL || 'https://voom-system-nova-ai.suwapat787.workers.dev').replace(/\/$/, '');

function buildWorkerUrl(path) {
  try {
    const base = new URL(aiWorkerBase);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
      return null;
    }
    return new URL(path, base.origin);
  } catch {
    return null;
  }
}

async function authenticateRequest(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return { ok: false, status: 401, error: 'authentication_required' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 503, error: 'authentication_not_configured' };

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return { ok: false, status: 401, error: 'invalid_or_expired_session' };
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: 'authentication_provider_unavailable' };
  }
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export async function POST(request) {
  // Verify the caller before reading or parsing an untrusted body.
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const boundedBody = await readBoundedRequestBody(request);
  if (!boundedBody.ok) {
    return NextResponse.json({ error: boundedBody.error }, {
      status: boundedBody.status,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const raw = boundedBody.raw;

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid_request_shape' }, { status: 400 });
  }

  let path;
  let payload;
  if (body.operation === 'draft') {
    if (!exactKeys(body, ['operation', 'prompt']) || typeof body.prompt !== 'string'
      || !body.prompt.trim() || body.prompt.trim().length > 1200) {
      return NextResponse.json({ error: 'invalid_workflow_prompt' }, { status: 400 });
    }
    path = '/api/workflows/draft';
    payload = { prompt: body.prompt.trim() };
  } else if (body.operation === 'simulate') {
    if (!exactKeys(body, ['operation', 'draft', 'sampleData'])
      || !body.draft || typeof body.draft !== 'object' || Array.isArray(body.draft)
      || !body.sampleData || typeof body.sampleData !== 'object' || Array.isArray(body.sampleData)) {
      return NextResponse.json({ error: 'invalid_workflow_simulation' }, { status: 400 });
    }
    path = '/api/workflows/simulate';
    payload = { draft: body.draft, sampleData: body.sampleData };
  } else {
    return NextResponse.json({ error: 'unsupported_workflow_operation' }, { status: 400 });
  }

  const workerUrl = buildWorkerUrl(path);
  if (!workerUrl) {
    return NextResponse.json({ error: 'workflow_worker_unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: request.headers.get('authorization') || '',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => null);
    if (!result || typeof result !== 'object') {
      return NextResponse.json({ error: 'workflow_worker_invalid_response' }, {
        status: 502,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    return NextResponse.json(result, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return NextResponse.json({ error: 'workflow_worker_unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
}
