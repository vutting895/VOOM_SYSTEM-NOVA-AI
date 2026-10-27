import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cloudAiBase = (process.env.VOOM_AI_WORKER_URL || 'https://voom-system-nova-ai.suwapat787.workers.dev').replace(/\/$/, '');
const allowedTimeframes = new Set(['5m', '15m', '1h', '4h', '1d']);
const allowedRisk = new Set(['low', 'medium', 'high']);

export async function POST(request) {
  let input;
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1200) : '';
    const market = typeof body.market === 'string' ? body.market.trim().slice(0, 30) : 'BTC/USDT';
    const timeframe = typeof body.timeframe === 'string' ? body.timeframe : '1h';
    const risk = typeof body.risk === 'string' ? body.risk : 'medium';
    if (!prompt) return NextResponse.json({ error: 'กรุณาระบุเป้าหมายกลยุทธ์' }, { status: 400 });
    if (!allowedTimeframes.has(timeframe)) return NextResponse.json({ error: 'Timeframe ไม่รองรับ' }, { status: 400 });
    if (!allowedRisk.has(risk)) return NextResponse.json({ error: 'Risk profile ไม่ถูกต้อง' }, { status: 400 });
    input = { prompt, market, timeframe, risk };
  } catch {
    return NextResponse.json({ error: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const response = await fetch(`${cloudAiBase}/api/gen-ai/generate`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json({ error: 'Cloudflare AI Worker ตอบกลับ HTTP ' + response.status, provider: 'cloudflare-workers-ai', tradingEnabled: false }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!payload || typeof payload !== 'object' || !payload.strategy || typeof payload.strategy !== 'object') {
      return NextResponse.json({ error: 'Cloudflare AI Worker ส่งข้อมูลที่ไม่ผ่านการตรวจสอบ', tradingEnabled: false }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ...payload, provider: 'cloudflare-workers-ai', tradingEnabled: false, ordersSubmitted: false }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'เชื่อมต่อ Cloudflare AI Worker ไม่สำเร็จ ระบบไม่ได้ใช้ local LLM หรือสร้างผลลัพธ์ทดแทน', provider: 'cloudflare-workers-ai', tradingEnabled: false, ordersSubmitted: false }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}