import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const aiWorkerBase = (process.env.NOVA_AI_API_URL || 'https://voom-system-nova-ai.suwapat787.workers.dev').replace(/\/$/, '');
const allowedWorkers = new Set([
  'EMATrendWorker',
  'RSIWorker',
  'ATRVolatilityFilter',
  'BollingerBandWorker',
  'VolumeSpikeWorker',
  'DonchianBreakoutWorker',
]);

const templates = {
  trend: {
    name: 'NOVA Trend Following',
    entryWorkers: ['EMATrendWorker', 'RSIWorker', 'ATRVolatilityFilter'],
    exit: { takeProfitPct: 2, stopLossPct: 1 },
    rationale: 'ใช้แนวโน้ม EMA ร่วมกับ RSI และกรองความผันผวน',
  },
  mean: {
    name: 'NOVA Mean Reversion',
    entryWorkers: ['RSIWorker', 'BollingerBandWorker'],
    exit: { takeProfitPct: 1.2, stopLossPct: 0.8 },
    rationale: 'ค้นหาการเบี่ยงเบนจากค่าเฉลี่ย; อาจทำงานไม่ดีในแนวโน้มแรง',
  },
  breakout: {
    name: 'NOVA Breakout',
    entryWorkers: ['VolumeSpikeWorker', 'DonchianBreakoutWorker'],
    exit: { takeProfitPct: 2.5, stopLossPct: 1.2 },
    rationale: 'ต้องยืนยันการทะลุกรอบด้วย volume และระวัง false breakout',
  },
  conservative: {
    name: 'NOVA Conservative Hybrid',
    entryWorkers: ['EMATrendWorker', 'RSIWorker', 'ATRVolatilityFilter'],
    exit: { takeProfitPct: 1.5, stopLossPct: 0.7 },
    rationale: 'รวมตัวกรองแนวโน้ม โมเมนตัม และความผันผวน',
  },
};

function fallbackDraft({ prompt, market, timeframe, risk }) {
  const p = prompt.toLowerCase();
  const key = risk === 'low'
    ? 'conservative'
    : /breakout|ทะลุ|เบรก/.test(p)
      ? 'breakout'
      : /mean reversion|กลับค่าเฉลี่ย|oversold|overbought|scalp|สั้น/.test(p)
        ? 'mean'
        : 'trend';
  return {
    ...templates[key],
    market,
    timeframe,
    riskProfile: risk,
    userGoal: prompt,
    source: 'rule-based-fallback',
    modelUsed: null,
  };
}

function validateDraft(raw, input, llm) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid strategy response');
  const requestedWorkers = Array.isArray(raw.entryWorkers) ? raw.entryWorkers : [];
  const entryWorkers = [...new Set(
    requestedWorkers.filter((worker) => typeof worker === 'string' && allowedWorkers.has(worker)),
  )].slice(0, 6);
  if (!entryWorkers.length) throw new Error('No allowed entry workers');

  const takeProfitPct = Number(raw.exit?.takeProfitPct);
  const stopLossPct = Number(raw.exit?.stopLossPct);
  if (!Number.isFinite(takeProfitPct) || !Number.isFinite(stopLossPct)
      || takeProfitPct <= 0 || takeProfitPct > 20 || stopLossPct <= 0 || stopLossPct > 10) {
    throw new Error('Invalid risk bounds');
  }

  const usedModel = llm?.provider === 'cloudflare-workers-ai' && llm?.available === true;
  return {
    id: `draft-${Date.now().toString(36)}`,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 100) : 'NOVA AI Draft',
    market: input.market,
    timeframe: input.timeframe,
    riskProfile: input.risk,
    entryWorkers,
    exit: { takeProfitPct, stopLossPct },
    rationale: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 1200) : 'โมเดลไม่ได้ให้เหตุผล',
    userGoal: input.prompt,
    source: usedModel ? 'cloudflare-workers-ai' : 'rule-based-fallback',
    modelUsed: usedModel && typeof (llm.model || raw.modelUsed) === 'string' ? (llm.model || raw.modelUsed) : null,
    status: 'draft',
    createdAt: new Date().toISOString(),
    executionEnabled: false,
    backtestStatus: 'not_run',
    warning: usedModel
      ? 'สร้างด้วย Cloudflare Workers AI และตรวจ schema แล้ว แต่ยังไม่ผ่าน Backtest/Risk Engine และห้ามใช้เป็นคำสั่งซื้อขาย'
      : 'ผลนี้เป็น rule-based fallback ไม่ใช่ผลจาก LLM และยังไม่ผ่าน Backtest/Risk Engine',
  };
}

async function authenticateRequest(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return { ok: false, status: 401, error: 'กรุณาเข้าสู่ระบบก่อนใช้ AI Analysis' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { ok: false, status: 503, error: 'ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแลระบบ' };
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return { ok: false, status: 401, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: 'ตรวจสอบเซสชันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }
}

export async function POST(request) {
  // Authenticate before parsing or validating the request body so every unauthenticated
  // AI API request fails closed with 401, regardless of the payload shape.
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1200) : '';
  const market = typeof body.market === 'string' ? body.market.trim().slice(0, 30) : 'BTC/USDT';
  const timeframe = typeof body.timeframe === 'string' ? body.timeframe : '1h';
  const risk = typeof body.risk === 'string' ? body.risk : 'medium';
  if (!prompt) return NextResponse.json({ error: 'กรุณาระบุเป้าหมายกลยุทธ์' }, { status: 400 });
  if (!['5m', '15m', '1h', '4h', '1d'].includes(timeframe)) {
    return NextResponse.json({ error: 'Timeframe ไม่รองรับ' }, { status: 400 });
  }
  if (!['low', 'medium', 'high'].includes(risk)) {
    return NextResponse.json({ error: 'Risk profile ไม่ถูกต้อง' }, { status: 400 });
  }

  const input = { prompt, market, timeframe, risk };
  let strategy;
  let llm;
  let llmError = null;

  try {
    const response = await fetch(`${aiWorkerBase}/api/gen-ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: request.headers.get('authorization') || '',
      },
      body: JSON.stringify(input),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.strategy) throw new Error('NOVA AI Worker unavailable');
    llm = payload.llm && typeof payload.llm === 'object'
      ? {
          provider: payload.llm.provider === 'cloudflare-workers-ai' && payload.llm.available === true
            ? 'cloudflare-workers-ai'
            : 'fallback',
          available: payload.llm.provider === 'cloudflare-workers-ai' && payload.llm.available === true,
          model: typeof payload.llm.model === 'string' ? payload.llm.model : null,
        }
      : { provider: 'fallback', available: false, model: null };
    strategy = validateDraft(payload.strategy, input, llm);
  } catch {
    llmError = 'NOVA AI Worker ติดต่อไม่ได้ จึงใช้ร่างกฎพื้นฐานแทน';
    strategy = fallbackDraft(input);
    llm = { provider: 'fallback', available: false, model: null, error: 'AI Worker unavailable' };
    strategy.warning = 'Cloudflare Workers AI ไม่พร้อม จึงแสดง rule-based fallback เท่านั้น ไม่ใช่ผลจาก LLM; ยังไม่ผ่าน Backtest/Risk Engine';
  }

  strategy.executionEnabled = false;
  strategy.backtestStatus = 'not_run';
  return NextResponse.json(
    { strategy, llm, ...(llmError ? { notice: llmError } : {}) },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}
