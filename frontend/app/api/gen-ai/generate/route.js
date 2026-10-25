import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const templates = {
  trend: { name: 'NOVA Trend Following', entryWorkers: ['EMATrendWorker', 'RSIWorker', 'ATRVolatilityFilter'], exit: { takeProfitPct: 2, stopLossPct: 1 }, rationale: 'ใช้แนวโน้ม EMA ร่วมกับ RSI และกรองความผันผวน' },
  mean: { name: 'NOVA Mean Reversion', entryWorkers: ['RSIWorker', 'BollingerBandWorker'], exit: { takeProfitPct: 1.2, stopLossPct: 0.8 }, rationale: 'ค้นหาการเบี่ยงเบนจากค่าเฉลี่ย; อาจทำงานไม่ดีในแนวโน้มแรง' },
  breakout: { name: 'NOVA Breakout', entryWorkers: ['VolumeSpikeWorker', 'DonchianBreakoutWorker'], exit: { takeProfitPct: 2.5, stopLossPct: 1.2 }, rationale: 'ต้องยืนยันการทะลุกรอบด้วย volume และระวัง false breakout' },
  conservative: { name: 'NOVA Conservative Hybrid', entryWorkers: ['EMATrendWorker', 'RSIWorker', 'ATRVolatilityFilter'], exit: { takeProfitPct: 1.5, stopLossPct: 0.7 }, rationale: 'รวมตัวกรองแนวโน้ม โมเมนตัม และความผันผวน' }
};
const allowedWorkers = new Set(['EMATrendWorker','RSIWorker','ATRVolatilityFilter','BollingerBandWorker','VolumeSpikeWorker','DonchianBreakoutWorker']);
function fallbackDraft({prompt, market, timeframe, risk}) {
  const p = prompt.toLowerCase();
  const key = risk === 'low' ? 'conservative' : /breakout|ทะลุ|เบรก/.test(p) ? 'breakout' : /mean reversion|กลับค่าเฉลี่ย|oversold|overbought|scalp|สั้น/.test(p) ? 'mean' : 'trend';
  return {...templates[key], market, timeframe, riskProfile:risk, userGoal:prompt, source:'rule-based-fallback', modelUsed:null};
}
function validateModelDraft(raw, request) {
  if (!raw || typeof raw !== 'object') throw new Error('Model response is not an object');
  const name = typeof raw.name === 'string' ? raw.name.slice(0,100) : 'NOVA AI Draft';
  const requestedWorkers = Array.isArray(raw.entryWorkers) ? raw.entryWorkers : [];
  const entryWorkers = [...new Set(requestedWorkers.filter(x => typeof x === 'string' && allowedWorkers.has(x)))].slice(0,6);
  if (!entryWorkers.length) throw new Error('Model returned no allowed workers');
  const tp = Number(raw.exit?.takeProfitPct), sl = Number(raw.exit?.stopLossPct);
  if (!Number.isFinite(tp) || !Number.isFinite(sl) || tp <= 0 || sl <= 0 || tp > 20 || sl > 10) throw new Error('Model returned invalid risk values');
  return {name, market:request.market, timeframe:request.timeframe, riskProfile:request.risk,
    entryWorkers, exit:{takeProfitPct:tp,stopLossPct:sl},
    rationale:typeof raw.rationale === 'string' ? raw.rationale.slice(0,1200) : 'โมเดลไม่ได้ให้เหตุผล',
    userGoal:request.prompt, source:'local-ollama-llm', modelUsed:process.env.NOVA_LLM_MODEL || 'llama3.2:1b'};
}
async function generateWithLocalLLM(input) {
  const base = (process.env.NOVA_LLM_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/,'');
  const model = process.env.NOVA_LLM_MODEL || 'llama3.2:1b';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(base + '/api/generate', {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body:JSON.stringify({model,stream:false,format:'json',options:{temperature:0.2},prompt:
        'You are NOVA, a cautious strategy research assistant. Return only JSON with fields name, entryWorkers, exit:{takeProfitPct,stopLossPct}, rationale. Allowed entryWorkers: EMATrendWorker, RSIWorker, ATRVolatilityFilter, BollingerBandWorker, VolumeSpikeWorker, DonchianBreakoutWorker. Values are research hypotheses, not recommendations. Never claim tested performance. Keep TP 0.1-20 and SL 0.1-10.\n'+
        JSON.stringify({goal:input.prompt,market:input.market,timeframe:input.timeframe,risk:input.risk})})
    });
    if (!response.ok) throw new Error('Local LLM returned HTTP ' + response.status);
    const payload = await response.json();
    const raw = typeof payload.response === 'string' ? JSON.parse(payload.response) : payload.response;
    return validateModelDraft(raw,input);
  } finally { clearTimeout(timer); }
}
export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0,1200) : '';
    const market = typeof body.market === 'string' ? body.market.trim().slice(0,30) : 'BTC/USDT';
    const timeframe = typeof body.timeframe === 'string' ? body.timeframe : '1h';
    const risk = typeof body.risk === 'string' ? body.risk : 'medium';
    if (!prompt) return NextResponse.json({error:'กรุณาระบุเป้าหมายกลยุทธ์'}, {status:400});
    if (!['5m','15m','1h','4h','1d'].includes(timeframe)) return NextResponse.json({error:'Timeframe ไม่รองรับ'}, {status:400});
    if (!['low','medium','high'].includes(risk)) return NextResponse.json({error:'Risk profile ไม่ถูกต้อง'}, {status:400});
    const input = {prompt,market,timeframe,risk};
    let strategy, llmAvailable = false, llmError = null;
    try { strategy = await generateWithLocalLLM(input); llmAvailable = true; }
    catch (e) { llmError = e.name === 'AbortError' ? 'Local LLM timeout' : String(e.message || e).slice(0,180); strategy = {...fallbackDraft(input), llmFallbackReason:llmError}; }
    strategy.id = 'draft-' + Date.now().toString(36);
    strategy.status = 'draft';
    strategy.createdAt = new Date().toISOString();
    strategy.executionEnabled = false;
    strategy.backtestStatus = 'not_run';
    strategy.warning = llmAvailable
      ? 'สร้างด้วย local LLM และตรวจ schema แล้ว แต่ยังไม่ผ่าน Backtest/Risk Engine และห้ามใช้เป็นคำสั่งซื้อขาย'
      : 'Local LLM ยังไม่พร้อม จึงใช้ rule-based fallback แทน ไม่ใช่ผลจาก LLM; ยังไม่ผ่าน Backtest/Risk Engine';
    return NextResponse.json({strategy, llm:{provider:llmAvailable?'ollama':'fallback',available:llmAvailable,model:llmAvailable?strategy.modelUsed:null,error:llmError}}, {headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'ข้อมูลคำขอไม่ถูกต้อง'}, {status:400}); }
}