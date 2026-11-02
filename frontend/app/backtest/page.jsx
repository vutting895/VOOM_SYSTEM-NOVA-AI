'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import './backtest.css';

export default function BacktestPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState('checking');
  const [symbol, setSymbol] = useState('XAUUSDm');
  const [timeframe, setTimeframe] = useState('M5');
  const [strategy, setStrategy] = useState('wave3-smc');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [datasetSaveBusy, setDatasetSaveBusy] = useState(false);
  const [savedDataset, setSavedDataset] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const marketBusyRef = useRef(false);
  const [clockNow, setClockNow] = useState(0);
  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const timer = setInterval(updateClock, 5000);
    return () => clearInterval(timer);
  }, []);
  const marketFresh = Boolean(marketFresh && marketData?.tick?.time
    && clockNow > 0 && Number.isFinite(Date.parse(marketData.tick.time))
    && Math.max(0, clockNow - Date.parse(marketData.tick.time)) <= 60000);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAuthState('misconfigured'); return; }
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setAuthState('error');
      else if (data.session?.access_token) setAuthState('ready');
      else router.replace('/login');
    }).catch(() => { if (active) setAuthState('error'); });
    return () => { active = false; };
  }, [router]);


  const refreshMarketData = useCallback(async (quiet = false) => {
    if (marketBusyRef.current) return;
    marketBusyRef.current = true;
    setMarketBusy(true);
    if (!quiet) setMarketError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        router.replace('/login');
        return;
      }
      const params = new URLSearchParams({ symbol, timeframe, count: '120' });
      const response = await fetch('/api/market-data?' + params.toString(), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + data.session.access_token, Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.state !== 'data_verified') {
        throw new Error(payload.error || 'market_data_unavailable');
      }
      setMarketData(payload);
      setMarketError('');
      if (!quiet) {
        // MT5 position zero is the currently forming candle. Keep it out of
        // historical backtest input; the independent tick remains live.
        const closedBars = payload.bars.slice(0, -1);
        if (closedBars.length < 3) throw new Error('not_enough_closed_candles');
        const baselineCandles = closedBars.map(({ open, high, low, close }) => ({ open, high, low, close }));
        setRaw(JSON.stringify(baselineCandles, null, 2));
      }
    } catch (err) {
      setMarketError(err?.message || 'ไม่สามารถดึงข้อมูลตลาดได้');
      setMarketData(current => current ? { ...current, freshness: 'stale' } : current);
    } finally {
      marketBusyRef.current = false;
      setMarketBusy(false);
    }
  }, [symbol, timeframe, router]);

  useEffect(() => {
    if (!autoRefresh || authState !== 'ready') return undefined;
    void refreshMarketData(true);
    const timer = setInterval(() => { void refreshMarketData(true); }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, authState, refreshMarketData]);

  async function saveMarketDataset() {
    if (!marketData?.bars?.length || datasetSaveBusy) return;
    const candles = marketData.bars.slice(0, -1);
    if (candles.length < 3) { setMarketError('ต้องมีแท่งเทียนที่ปิดแล้วอย่างน้อย 3 แท่ง'); return; }
    setDatasetSaveBusy(true);
    setMarketError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) { router.replace('/login'); return; }
      const response = await fetch('/api/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + data.session.access_token,
        },
        body: JSON.stringify({ symbol: marketData.symbol, timeframe: marketData.timeframe, provider: 'exness_mt5_demo', candles }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'dataset_save_unavailable');
      setSavedDataset({ ...payload, url: window.location.origin + payload.resolver_path });
    } catch (err) {
      setMarketError(err?.message || 'ไม่สามารถบันทึก Dataset ได้');
    } finally {
      setDatasetSaveBusy(false);
    }
  }

  async function runBaseline(event) {
    event.preventDefault(); setError(''); setResult(null);
    let candles;
    try { candles = JSON.parse(raw); } catch { setError('ข้อมูล OHLC ต้องเป็น JSON array ที่ถูกต้อง'); return; }
    if (!Array.isArray(candles) || candles.length < 3 || candles.length > 120) {
      setError('Baseline รับข้อมูล 3–120 แท่งเท่านั้น'); return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) { router.replace('/login'); return; }
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ candles }), cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Baseline service unavailable');
      setResult(payload);
    } catch (err) { setError(err?.message || 'ไม่สามารถเรียก Baseline API ได้'); }
    finally { setBusy(false); }
  }

  const fmt = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 }) + '%' : '—';

  return (
    <main className="nova-backtest-lab">
      <header className="nova-bt-top">
        <div><div className="nova-bt-kicker">NOVA INTELLIGENCE / RESEARCH WORKSPACE</div><h1>Backtest <span>& Strategy Lab</span></h1><p>ออกแบบการทดลอง ตรวจสอบความเสี่ยง และประเมินกลยุทธ์จากข้อมูลย้อนหลัง</p></div>
        <div className="nova-bt-safety"><i /> READ-ONLY · LIVE TRADING OFF</div>
      </header>

      <div className="nova-bt-alert" role="note"><strong>สถานะ Engine: Strategy Backtest ยังไม่เปิดใช้งาน</strong> — บริการปัจจุบันคำนวณได้เฉพาะ Buy-and-hold baseline จาก OHLC 3–120 แท่งเท่านั้น ยังไม่มีการจำลองคำสั่งเข้า/ออก, position sizing, spread, commission, swap หรือ slippage จึงห้ามตีความเป็นผลกลยุทธ์จริง</div>
      {authState === 'checking' && <div className="nova-bt-alert" role="status">กำลังตรวจสอบ Login…</div>}
      {authState === 'misconfigured' && <div className="nova-bt-alert" role="alert">Supabase ยังไม่ได้ตั้งค่า</div>}
      {authState === 'error' && <div className="nova-bt-alert" role="alert">ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่</div>}

      <div className="nova-bt-grid">

        <section className="nova-bt-panel nova-bt-wide">
          <div className="nova-bt-panel-head"><div><small>LIVE / EXNESS MT5 DEMO · READ ONLY</small><h2>ข้อมูลตลาดเรียลไทม์</h2></div><span className="nova-bt-tag">{marketFresh ? 'LIVE FEED' : marketData ? 'STALE / DELAYED' : 'NOT CONNECTED'}</span></div>
          <div className="nova-bt-actions">
            <span>ดึง Tick ล่าสุดและแท่ง OHLCV ผ่าน NOVA System Hub<br/>ใช้เฉพาะ Exness Demo connection ของบัญชีที่ Login อยู่</span>
            <div className="nova-bt-actions-buttons"><button className="nova-bt-run" type="button" onClick={() => refreshMarketData(false)} disabled={marketBusy || authState !== 'ready'}>{marketBusy ? 'กำลังดึงข้อมูล…' : 'ดึงข้อมูลตลาดล่าสุด'}</button>{marketData && <button className="nova-bt-run" type="button" onClick={saveMarketDataset} disabled={datasetSaveBusy || authState !== 'ready'}>{datasetSaveBusy ? 'กำลังบันทึก…' : 'บันทึก Dataset'}</button>}</div>
          </div>
          <label className="nova-bt-live-toggle"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} disabled={authState !== 'ready'} /> อัปเดตอัตโนมัติทุก 5 วินาที</label>
          {marketError && <div className="nova-bt-error" role="alert">{marketError}</div>}
          {marketData?.tick && <div className="nova-bt-live-grid" aria-live="polite">
            <div className="nova-bt-metric"><small>{marketData.symbol} · BID</small><strong>{marketData.tick.bid}</strong><em>{marketData.timeframe}</em></div>
            <div className="nova-bt-metric"><small>ASK</small><strong>{marketData.tick.ask}</strong><em>Spread {marketData.tick.spread || '—'}</em></div>
            <div className="nova-bt-metric"><small>LAST / MID</small><strong>{marketData.tick.last || '—'}</strong><em>{marketFresh ? 'ข้อมูลสด ≤ 60 วินาที' : 'ข้อมูลอาจล่าช้า / ตลาดปิด'}</em></div>
            <div className="nova-bt-metric"><small>HISTORICAL BARS</small><strong>{marketData.count}</strong><em>แท่งล่าสุดแยกออกจาก Backtest input</em></div>
          </div>}
          {marketData?.tick?.time && <p className="nova-bt-foot">เวลาของ Tick: {new Date(marketData.tick.time).toLocaleString()} · รับข้อมูลจาก Hub: {new Date(marketData.receivedAt).toLocaleString()} · Source: {marketData.source}</p>}
          {!marketData && <p className="nova-bt-foot">ยังไม่มีข้อมูลจริงในหน้านี้ กดปุ่มดึงข้อมูลเพื่อตรวจสอบการเชื่อมต่อ Exness Demo</p>}
          {savedDataset && <div className="nova-bt-alert" role="status"><strong>บันทึก Dataset แล้ว</strong> · SHA-256: {savedDataset.sha256}<br/><div className="nova-bt-qr"><QRCodeSVG value={savedDataset.url} size={192} level="M" includeMargin /></div>QR Resolver: <a href={savedDataset.url}>{savedDataset.url}</a><br/><button type="button" onClick={() => navigator.clipboard.writeText(savedDataset.url)}>คัดลอกลิงก์ QR</button><small>QR นี้เก็บเฉพาะ URL อ้างอิง ไม่บรรจุราคา, Token หรือข้อมูลบัญชี ต้อง Login และเป็นเจ้าของ Dataset จึงเปิดดูได้</small></div>}
          <p className="nova-bt-foot">การอัปเดตเป็น polling ทุก 5 วินาทีผ่าน endpoint แบบ authenticated ไม่ใช่ WebSocket streaming; ถ้า Bridge/Hub ยังไม่พร้อมจะแสดง error แทนข้อมูลจำลอง</p>
        </section>

        <section className="nova-bt-panel">
          <div className="nova-bt-panel-head"><div><small>01 / EXPERIMENT CONFIGURATION</small><h2>กำหนดการทดสอบกลยุทธ์</h2></div><span className="nova-bt-tag">CONFIG PREVIEW</span></div>
          <div className="nova-bt-fields">
            <div className="nova-bt-field"><label htmlFor="bt-symbol">Instrument</label><select id="bt-symbol" value={symbol} onChange={e=>setSymbol(e.target.value)}><option value="XAUUSDm">XAUUSDm · Exness Demo</option><option value="BTCUSDT" disabled>BTCUSDT · Binance (ยังไม่เชื่อม)</option><option value="EURUSDm" disabled>EURUSDm · รอตรวจสอบ Symbol</option></select></div>
            <div className="nova-bt-field"><label htmlFor="bt-timeframe">Timeframe</label><select id="bt-timeframe" value={timeframe} onChange={e=>setTimeframe(e.target.value)}>{['M5','M15','M30','H1','H4','D1'].map(x=><option key={x}>{x}</option>)}</select></div>
            <div className="nova-bt-field"><label htmlFor="bt-strategy">Strategy Profile</label><select id="bt-strategy" value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="wave3-smc">Wave3 + SMC + Fibonacci</option><option value="neural-hybrid">Neural Network + XGBoost</option><option value="smc-only">SMC v6.2.6.3</option><option value="baseline">Buy-and-hold baseline</option></select></div>
            <div className="nova-bt-field"><label htmlFor="bt-capital">Starting Capital (USD)</label><input id="bt-capital" type="number" min="100" step="100" defaultValue="10000" /></div>
            <div className="nova-bt-field"><label htmlFor="bt-start">Start Date</label><input id="bt-start" type="date" defaultValue="2024-01-01" /></div>
            <div className="nova-bt-field"><label htmlFor="bt-end">End Date</label><input id="bt-end" type="date" defaultValue="2026-10-31" /></div>
            <div className="nova-bt-field"><label htmlFor="bt-risk">Risk per Trade (%)</label><input id="bt-risk" type="number" min="0.1" max="2" step="0.1" defaultValue="1" /></div>
            <div className="nova-bt-field"><label htmlFor="bt-evaluation">Evaluation Mode</label><input id="bt-evaluation" value="Purged Walk-forward + Final OOS" readOnly /></div>
          </div>
          <div className="nova-bt-models"><span className="nova-bt-model active">Wave3</span><span className="nova-bt-model active">SMC / Fibonacci</span><span className="nova-bt-model active">PyTorch LSTM</span><span className="nova-bt-model active">XGBoost Comparator</span></div>
          <div className="nova-bt-engine-note"><span>⚠</span><div><strong>ยังไม่ส่งคำสั่ง Backtest</strong> ค่าที่เลือกเป็น configuration preview ในหน้าเว็บเท่านั้น ยังไม่มี Strategy Simulation API และไม่มีการบันทึกค่าลงระบบ</div></div>
          <button className="nova-bt-disabled" type="button" disabled>Strategy Backtest · Waiting for Engine & Evaluation API</button>
        </section>

        <aside className="nova-bt-side">
          <section className="nova-bt-panel"><div className="nova-bt-panel-head"><div><small>02 / ACCEPTANCE GATES</small><h2>เกณฑ์ผ่านการประเมิน</h2></div></div>
            <div className="nova-bt-checks">
              <div className="nova-bt-check"><span>Final OOS trades</span><b>≥ 30 closed trades</b></div>
              <div className="nova-bt-check"><span>Net profit after costs</span><b>Positive</b></div>
              <div className="nova-bt-check"><span>Profit Factor</span><b>&gt; 1.0</b></div>
              <div className="nova-bt-check"><span>Walk-forward folds</span><b>≥ 5</b></div>
              <div className="nova-bt-check"><span>Model calibration</span><b>Brier / ECE</b></div>
              <div className="nova-bt-check"><span>Final OOS leakage</span><b>Must be zero</b></div>
            </div>
          </section>
          <section className="nova-bt-panel"><div className="nova-bt-panel-head"><div><small>03 / CURRENT ENGINE</small><h2>Baseline Service</h2></div><span className="nova-bt-tag">LIMITED</span></div>
            <div className="nova-bt-metrics">
              <div className="nova-bt-metric"><small>INPUT BARS</small><strong>{result?.candleCount ?? '—'}</strong><em>3–120 OHLC bars</em></div>
              <div className="nova-bt-metric"><small>RETURN</small><strong>{result ? fmt(result.totalReturnPct) : '—'}</strong><em>Buy-and-hold only</em></div>
              <div className="nova-bt-metric"><small>MAX DRAWDOWN</small><strong>{result ? fmt(result.maxDrawdownPct) : '—'}</strong><em>Baseline calculation</em></div>
              <div className="nova-bt-metric"><small>VOLATILITY</small><strong>{result ? fmt(result.volatilityPct) : '—'}</strong><em>Baseline estimate</em></div>
            </div>
          </section>
        </aside>

        <section className="nova-bt-panel nova-bt-wide">
          <div className="nova-bt-panel-head"><div><small>04 / VERIFIED BASELINE TOOL</small><h2>ทดสอบข้อมูล OHLC ที่มีอยู่</h2></div><span className="nova-bt-tag">NOT A STRATEGY TEST</span></div>
          <form onSubmit={runBaseline}>
            <div className="nova-bt-field"><label htmlFor="bt-ohlc">OHLC JSON array · ใส่ข้อมูลจริง 3–120 แท่ง</label><textarea id="bt-ohlc" value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'[\n  {"open": 2000, "high": 2005, "low": 1998, "close": 2003},\n  ...\n]'} spellCheck="false" disabled={busy || authState !== 'ready'} /></div>
            <div className="nova-bt-actions"><span>ส่งข้อมูลไปยัง authenticated baseline API เท่านั้น<br/>ไม่ได้ดึงราคาตลาดอัตโนมัติ</span><button className="nova-bt-run" type="submit" disabled={busy || authState !== 'ready' || !raw.trim()}>{busy ? 'กำลังคำนวณ…' : 'Run Baseline Check'}</button></div>
          </form>
          {error && <div className="nova-bt-error" role="alert">{error}</div>}
          {result && <div className="nova-bt-result" aria-live="polite"><h3>Baseline response received</h3><p>{result.note || 'Baseline calculation completed. This is not strategy performance or evidence of profitability.'}</p></div>}
        </section>
      </div>
      <p className="nova-bt-foot">Research safety: read-only market data; ordersEnabled=false; executionEnabled=false; liveTradingEnabled=false. No broker writes. Configuration fields are local UI state only until a reviewed Strategy Simulation API is implemented.</p>
    </main>
  );
}
