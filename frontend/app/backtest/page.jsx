'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';

const sampleCandles = [
  { open: 100, high: 103, low: 99, close: 102 },
  { open: 102, high: 104, low: 101, close: 103 },
  { open: 103, high: 104, low: 98, close: 99 },
  { open: 99, high: 101, low: 97, close: 100 },
  { open: 100, high: 106, low: 99, close: 105 },
];

export default function BacktestPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState('checking');
  const [raw, setRaw] = useState(JSON.stringify(sampleCandles, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthState('misconfigured');
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setAuthState('error');
        setError('ตรวจสอบเซสชันไม่สำเร็จ');
      } else if (data.session?.access_token) {
        setAuthState('ready');
      } else {
        router.replace('/login');
      }
    });
    return () => { active = false; };
  }, [router]);

  async function runBaseline(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    let candles;
    try {
      candles = JSON.parse(raw);
    } catch {
      setError('รูปแบบ JSON ไม่ถูกต้อง');
      return;
    }
    if (!Array.isArray(candles) || candles.length < 3 || candles.length > 120) {
      setError('ต้องใส่แท่ง OHLC จำนวน 3–120 แท่ง');
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        router.replace('/login');
        return;
      }
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + data.session.access_token,
        },
        body: JSON.stringify({ candles }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'คำนวณ baseline ไม่สำเร็จ');
      setResult(payload);
    } catch (err) {
      setError(err?.message || 'ไม่สามารถเรียกบริการ Backtest ได้');
    } finally {
      setBusy(false);
    }
  }

  const percent = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('th-TH', { maximumFractionDigits: 4 }) + '%' : '—';

  return (
    <main className="nova-backtest-page">
      <header className="nova-backtest-heading">
        <div><div className="nova-chat-kicker"><span /> NOVA INTELLIGENCE / SIMULATION</div><h1>Backtest <em>Baseline</em></h1><p>ทดสอบการคำนวณกับข้อมูล OHLC ที่ส่งเข้าเองอย่างโปร่งใส</p></div>
        <div className="nova-chat-safety"><span /> READ-ONLY <b>·</b> LIVE TRADING OFF</div>
      </header>

      <div className="nova-backtest-warning">
        <strong>สำคัญ: นี่ไม่ใช่ Strategy Backtest</strong>
        <p>Engine ปัจจุบันคำนวณ buy-and-hold baseline จากราคาปิดที่ให้มาเท่านั้น ไม่จำลอง EMA/RSI, ไม่ใช่การคาดการณ์ และไม่รวมค่าธรรมเนียม spread, slippage, funding หรือ latency ตัวอย่างด้านล่างเป็นข้อมูลสมมติ ไม่ใช่ราคาตลาด</p>
      </div>

      {authState === 'checking' && <div className="nova-chat-info" role="status">กำลังตรวจสอบสถานะ Login…</div>}
      {authState === 'misconfigured' && <div className="nova-chat-alert" role="alert">ยังไม่ได้ตั้งค่า Supabase จึงเรียก Backtest API ไม่ได้</div>}
      {authState === 'error' && <div className="nova-chat-alert" role="alert">{error}</div>}

      <form className="nova-backtest-form" onSubmit={runBaseline}>
        <label htmlFor="nova-candles">OHLC candles — JSON array</label>
        <textarea id="nova-candles" rows={14} value={raw} onChange={(event) => setRaw(event.target.value)} spellCheck="false" disabled={busy || authState !== 'ready'} />
        <div className="nova-backtest-actions">
          <span>3–120 แท่ง · ต้องมี open, high, low, close เป็นตัวเลข</span>
          <button type="submit" disabled={busy || authState !== 'ready'}>{busy ? 'กำลังคำนวณ…' : 'คำนวณ Baseline'}</button>
        </div>
      </form>

      {error && <div className="nova-chat-alert" role="alert">{error}</div>}
      {result && !result.error && (
        <section className="nova-backtest-results" aria-live="polite">
          <div className="nova-backtest-result-head"><div><span>RESULT TYPE</span><h2>{result.mode === 'buy-and-hold-baseline' ? 'Buy-and-hold baseline' : 'Baseline output'}</h2></div><span className="nova-backtest-tag">NOT STRATEGY TEST</span></div>
          <div className="nova-backtest-metrics">
            <article><small>INPUT CANDLES</small><strong>{result.candleCount ?? '—'}</strong></article>
            <article><small>BASELINE RETURN</small><strong>{percent(result.totalReturnPct)}</strong></article>
            <article><small>MAX DRAWDOWN</small><strong>{percent(result.maxDrawdownPct)}</strong></article>
            <article><small>VOLATILITY ESTIMATE</small><strong>{percent(result.volatilityPct)}</strong></article>
          </div>
          <p>{result.note || 'Baseline only; not predictive.'}</p>
        </section>
      )}

      <div className="nova-backtest-links"><Link href="/gen-ai">AI Analysis →</Link><Link href="/markets">Markets →</Link></div>
    </main>
  );
}
