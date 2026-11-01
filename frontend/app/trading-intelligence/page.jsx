'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { calculatePriceAnalysis, calculateSmcAnalysis, normalizeMarketPayload } from '../../lib/trading-intelligence.mjs';
import './trading-intelligence.css';

const MT5_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const BINANCE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

function formatPrice(value, digits = 2) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTimestamp(value) {
  if (!value) return 'ไม่ระบุเวลา';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'ไม่ระบุเวลา' : date.toLocaleString('th-TH');
}

function CandleChart({ analysis, digits }) {
  const bars = analysis?.candles?.slice(-80) || [];
  if (bars.length < 2) {
    return <div className="ti-chart-empty">ต้องมีแท่งราคาอย่างน้อย 28 แท่งที่ตรวจสอบรูปแบบได้ก่อนแสดงกราฟวิเคราะห์</div>;
  }

  const width = 920;
  const height = 286;
  const paddingX = 18;
  const paddingY = 18;
  const lows = bars.map((bar) => bar.low);
  const highs = bars.map((bar) => bar.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const spread = max - min || Math.max(Math.abs(max) * 0.001, 0.000001);
  const y = (price) => paddingY + ((max - price) / spread) * (height - paddingY * 2);
  const x = (index) => paddingX + ((index + 0.5) / bars.length) * (width - paddingX * 2);
  const candleWidth = Math.max(2, Math.min(9, ((width - paddingX * 2) / bars.length) * 0.62));
  const ema12 = analysis.ema12Series.slice(-bars.length);
  const ema26 = analysis.ema26Series.slice(-bars.length);
  const points = (values) => values.map((value, index) => `${x(index)},${y(value)}`).join(' ');

  return (
    <div className="ti-chart-wrap">
      <svg className="ti-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="กราฟแท่งเทียนจากข้อมูลตลาดที่ดึงจากผู้ให้บริการ">
        {[0, 1, 2, 3, 4].map((step) => {
          const gridY = paddingY + (step / 4) * (height - paddingY * 2);
          return <line key={step} x1={paddingX} x2={width - paddingX} y1={gridY} y2={gridY} className="ti-grid-line" />;
        })}
        {bars.map((bar, index) => {
          const positive = bar.close >= bar.open;
          const bodyTop = y(Math.max(bar.open, bar.close));
          const bodyBottom = y(Math.min(bar.open, bar.close));
          return (
            <g key={bar.time}>
              <line x1={x(index)} x2={x(index)} y1={y(bar.high)} y2={y(bar.low)} className={positive ? 'ti-candle-wick-up' : 'ti-candle-wick-down'} />
              <rect
                x={x(index) - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={Math.max(1.5, bodyBottom - bodyTop)}
                rx="1"
                className={positive ? 'ti-candle-up' : 'ti-candle-down'}
              />
            </g>
          );
        })}
        {ema12.length === bars.length && <polyline points={points(ema12)} className="ti-ema-fast" />}
        {ema26.length === bars.length && <polyline points={points(ema26)} className="ti-ema-slow" />}
      </svg>
      <div className="ti-chart-legend">
        <span><i className="ti-legend-fast" /> EMA 12</span>
        <span><i className="ti-legend-slow" /> EMA 26</span>
        <span className="ti-chart-range">{formatPrice(min, digits)} — {formatPrice(max, digits)}</span>
      </div>
    </div>
  );
}

export default function TradingIntelligencePage() {
  const [source, setSource] = useState('mt5');
  const [symbol, setSymbol] = useState('XAUUSDm');
  const [timeframe, setTimeframe] = useState('M5');
  const [marketData, setMarketData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [smcAnalysis, setSmcAnalysis] = useState(null);
  const [feedState, setFeedState] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState('');

  const timeframes = source === 'mt5' ? MT5_TIMEFRAMES : BINANCE_INTERVALS;

  function changeSource(nextSource) {
    setSource(nextSource);
    setSymbol(nextSource === 'mt5' ? 'XAUUSDm' : 'BTCUSDT');
    setTimeframe(nextSource === 'mt5' ? 'M5' : '1h');
    setMarketData(null);
    setAnalysis(null);
    setSmcAnalysis(null);
    setFeedState('');
    setError('');
    setRetrievedAt('');
  }

  async function loadMarketData(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedState('กำลังตรวจสอบสิทธิ์และอ่านข้อมูลจากผู้ให้บริการ…');
    setMarketData(null);
    setAnalysis(null);
    setSmcAnalysis(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase Auth สำหรับหน้าเว็บนี้');

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        window.location.assign('/login');
        return;
      }

      const response = await fetch('/api/trading-intelligence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'market_data',
          source,
          symbol: symbol.trim(),
          timeframe,
          count: 150,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || body.error || 'ไม่สามารถอ่านข้อมูลตลาดได้');
      }

      const normalized = normalizeMarketPayload(source, body.result);
      if (normalized.status !== 'data_verified') {
        setFeedState(normalized.message || `สถานะข้อมูล: ${normalized.status}`);
        return;
      }

      setMarketData(normalized);
      setAnalysis(calculatePriceAnalysis(normalized.bars));
      setSmcAnalysis(calculateSmcAnalysis(normalized.bars));
      setRetrievedAt(new Date().toISOString());
      setFeedState('รับข้อมูลจากผู้ให้บริการแล้ว · Read-only');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดในการอ่านข้อมูล');
      setFeedState('ไม่สามารถยืนยันข้อมูลตลาดได้');
    } finally {
      setBusy(false);
    }
  }

  const digits = marketData?.digits ?? (source === 'mt5' ? 2 : 4);
  const latestBar = marketData?.bars?.at(-1);
  const tick = marketData?.tick;
  const spread = Number.isFinite(Number(tick?.ask)) && Number.isFinite(Number(tick?.bid))
    ? Number(tick.ask) - Number(tick.bid)
    : null;

  return (
    <main className="nova-shell ti-shell">
      <header className="nova-header ti-header">
        <div>
          <p className="nova-eyebrow">NOVA INTELLIGENCE / QUANTITATIVE RESEARCH</p>
          <h1 className="nova-title">Trading <span className="ti-title-accent">Intelligence</span></h1>
          <p className="nova-subtitle">ศูนย์วิเคราะห์ข้อมูลราคา โครงสร้างตลาด และกลยุทธ์ โดยแยกผลจากกฎเทคนิคออกจากสถานะ Neural Network ที่ผ่านการตรวจสอบแล้ว</p>
        </div>
        <div className="nova-header-actions">
          <span className="ti-status ti-status-off">LIVE TRADING OFF</span>
          <span className="ti-status">READ-ONLY + AI ANALYSIS</span>
        </div>
      </header>

      <section className="ti-safety" aria-label="Trading safety status">
        <strong>RESEARCH MODE · ORDER ROUTING LOCKED</strong>
        <span>ข้อมูลใช้เพื่อวิเคราะห์เท่านั้น หน้านี้ไม่มีคำสั่งซื้อ แก้ไข หรือปิดสถานะ และไม่สามารถเปิด Live Trading ได้</span>
      </section>

      <section className="ti-controls nova-panel">
        <div className="ti-panel-head">
          <div>
            <span className="ti-kicker">01 / MARKET DATA INPUT</span>
            <h2>เลือกแหล่งข้อมูลและสินทรัพย์</h2>
          </div>
          <span className="ti-feed-label">{marketData?.status === 'data_verified' ? 'DATA VERIFIED' : 'FEED NOT VERIFIED'}</span>
        </div>

        <div className="ti-source-switch" role="group" aria-label="แหล่งข้อมูลตลาด">
          <button type="button" className={source === 'mt5' ? 'active' : ''} onClick={() => changeSource('mt5')}>
            Exness MT5 Demo
          </button>
          <button type="button" className={source === 'binance' ? 'active' : ''} onClick={() => changeSource('binance')}>
            Binance Public Crypto
          </button>
        </div>

        <form className="ti-form" onSubmit={loadMarketData}>
          <label className="ti-field">
            <span>Symbol</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              maxLength={40}
              autoComplete="off"
              spellCheck="false"
              required
              aria-label="Market symbol"
            />
          </label>
          <label className="ti-field">
            <span>Timeframe</span>
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
              {timeframes.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <button className="nova-button nova-button-primary ti-load-button" type="submit" disabled={busy || !symbol.trim()}>
            {busy ? 'กำลังอ่านข้อมูล…' : 'โหลดราคาและวิเคราะห์'}
          </button>
        </form>

        <p className="ti-hint">
          {source === 'mt5'
            ? 'Exness MT5 Demo ต้องมี Supabase session, connection ที่เป็นของผู้ใช้ และ dedicated Bridge ที่ provision แล้ว'
            : 'Binance ใช้ข้อมูล OHLCV สาธารณะสำหรับงานวิจัย ไม่ใช่ราคา Exness และไม่ใช่ข้อมูลพอร์ตบัญชี'}
        </p>
        {feedState && <p className="ti-feedback" aria-live="polite">{feedState}</p>}
        {error && <p className="ti-error" role="alert">{error}</p>}
      </section>

      <section className="ti-workspace-grid">
        <section className="nova-panel ti-chart-panel">
          <div className="ti-panel-head">
            <div>
              <span className="ti-kicker">02 / PRICE ANALYSIS</span>
              <h2>{marketData ? `${marketData.symbol} · ${marketData.timeframe}` : 'Price & Candlestick Analysis'}</h2>
            </div>
            <span className={marketData ? 'ti-data-badge verified' : 'ti-data-badge'}>{marketData ? 'VERIFIED SOURCE RESPONSE' : 'WAITING FOR DATA'}</span>
          </div>
          {marketData ? (
            <>
              <div className="ti-quote-row">
                <div><span>Last bar close</span><strong>{formatPrice(latestBar?.close, digits)}</strong></div>
                <div><span>Bid</span><strong>{formatPrice(tick?.bid, digits)}</strong></div>
                <div><span>Ask</span><strong>{formatPrice(tick?.ask, digits)}</strong></div>
                <div><span>Spread</span><strong>{spread === null ? '—' : formatPrice(spread, digits)}</strong></div>
              </div>
              <CandleChart analysis={analysis} digits={digits} />
              <div className="ti-source-meta">
                <span>Source: {marketData.source}</span>
                <span>Bars: {marketData.bars.length}</span>
                <span>Provider timestamp: {formatTimestamp(marketData.providerTimestamp || latestBar?.time)}</span>
                <span>Retrieved: {formatTimestamp(retrievedAt)}</span>
              </div>
            </>
          ) : (
            <div className="ti-chart-empty">
              ยังไม่มีข้อมูลราคาที่ตรวจสอบได้ เลือกแหล่งข้อมูลและกดโหลดราคา ระบบจะไม่แสดงกราฟจำลองหรือค่าราคาตัวอย่าง
            </div>
          )}
        </section>

        <section className="nova-panel ti-analysis-panel">
          <div className="ti-panel-head">
            <div>
              <span className="ti-kicker">03 / TECHNICAL STRATEGY REVIEW</span>
              <h2>Price & Strategy Analysis</h2>
            </div>
            <span className="ti-research-tag">DESCRIPTIVE ONLY</span>
          </div>
          {analysis?.ready ? (
            <>
              <div className="ti-trend-card">
                <span>EMA ALIGNMENT</span>
                <strong className={analysis.trend === 'bullish' ? 'ti-positive' : analysis.trend === 'bearish' ? 'ti-negative' : ''}>
                  {analysis.trend.toUpperCase()}
                </strong>
                <small>{analysis.interpretation}</small>
              </div>
              <div className="ti-metric-grid">
                <div><span>EMA 12</span><strong>{formatPrice(analysis.ema12, digits)}</strong></div>
                <div><span>EMA 26</span><strong>{formatPrice(analysis.ema26, digits)}</strong></div>
                <div><span>RSI 14</span><strong>{formatPrice(analysis.rsi14, 2)}</strong><small>{analysis.momentum === 'high' ? 'High momentum zone' : analysis.momentum === 'low' ? 'Low momentum zone' : 'Neutral zone'}</small></div>
                <div><span>20-bar range low</span><strong>{formatPrice(analysis.rangeLow, digits)}</strong></div>
                <div><span>20-bar range high</span><strong>{formatPrice(analysis.rangeHigh, digits)}</strong></div>
                <div><span>Bars analyzed</span><strong>{analysis.barsUsed}</strong></div>
              </div>
              <p className="ti-analysis-footnote">ใช้ EMA 12/26 และ RSI 14 เป็น baseline เชิงพรรณนา ไม่ใช่สัญญาณเข้าเทรด และยังไม่ใช่ผลจาก Neural Network</p>
            </>
          ) : (
            <div className="ti-chart-empty">{analysis?.reason || 'โหลดข้อมูลตลาดเพื่อเริ่มการวิเคราะห์ราคาและตัวชี้วัด'}</div>
          )}
          <div className="ti-structure-block">
            <div className="ti-structure-heading">
              <strong>SMC · Market Structure</strong>
              <span>CONFIRMED SWINGS ONLY</span>
            </div>
            {smcAnalysis?.ready ? (
              <>
                <div className="ti-structure-summary">
                  <span>Latest structure bias</span>
                  <strong className={smcAnalysis.latestStructureBias === 'bullish' ? 'ti-positive' : smcAnalysis.latestStructureBias === 'bearish' ? 'ti-negative' : ''}>
                    {smcAnalysis.latestStructureBias.toUpperCase()}
                  </strong>
                  <small>{smcAnalysis.barsUsed} completed bars · {smcAnalysis.swingPoints.length} confirmed swing points</small>
                </div>
                <div className="ti-structure-columns">
                  <div>
                    <span className="ti-structure-label">BOS / CHoCH</span>
                    {smcAnalysis.structureEvents.length ? smcAnalysis.structureEvents.slice(-3).reverse().map((event) => (
                      <div className="ti-structure-row" key={event.index + '-' + event.type}>
                        <b>{event.type}</b>
                        <span className={event.direction === 'bullish' ? 'ti-positive' : 'ti-negative'}>{event.direction}</span>
                        <strong>{formatPrice(event.level, digits)}</strong>
                      </div>
                    )) : <p className="ti-structure-empty">ยังไม่พบการ break ของ swing ที่ยืนยันแล้วในช่วงข้อมูลนี้</p>}
                  </div>
                  <div>
                    <span className="ti-structure-label">Fair Value Gaps</span>
                    {smcAnalysis.fairValueGaps.length ? smcAnalysis.fairValueGaps.slice(-3).reverse().map((gap) => (
                      <div className="ti-structure-row" key={gap.index + '-' + gap.direction}>
                        <b>FVG</b>
                        <span className={gap.direction === 'bullish' ? 'ti-positive' : 'ti-negative'}>{gap.direction}</span>
                        <strong>{formatPrice(gap.low, digits)}–{formatPrice(gap.high, digits)}</strong>
                      </div>
                    )) : <p className="ti-structure-empty">ไม่พบ FVG ตามกฎสามแท่งในช่วงข้อมูลนี้</p>}
                  </div>
                </div>
              </>
            ) : (
              <p className="ti-structure-empty">{smcAnalysis?.reason || 'โหลดข้อมูลตลาดเพื่อวิเคราะห์ BOS, CHoCH และ FVG'}</p>
            )}
          </div>
        </section>
      </section>

      <section className="ti-bottom-grid">
        <section className="nova-panel">
          <div className="ti-panel-head">
            <div><span className="ti-kicker">04 / NEURAL NETWORK PROCESSOR</span><h2>Neural Network Engine</h2></div>
            <span className="ti-model-state">INFERENCE NOT VERIFIED</span>
          </div>
          <p className="ti-section-copy">Neural Network เป็นหน่วยประมวลผลเป้าหมายสำหรับการเรียนรู้รูปแบบราคาและรวมผลโมเดล แต่ยังไม่เปิดแสดงผล inference จนกว่าจะมี model artifact, runtime, provenance และผลประเมินที่ตรวจสอบได้</p>
          <p className="ti-section-copy">สถานะ Runtime: มี PyTorch LSTM candidate trainer และ Shadow Inference สำหรับงานวิจัยแบบ offline แล้ว แต่ยังไม่ได้ฝึกด้วยข้อมูล Exness จริงและยังไม่เชื่อมต่อ inference เข้ากับ Dashboard</p>
          <div className="ti-model-list">
            <div><span><b>01</b> LSTM / GRU — Primary Sequence Model</span><em>Target primary processor · not live</em></div>
            <div><span><b>02</b> CNN / 1D-CNN</span><em>Research track</em></div>
            <div><span><b>03</b> Transformer</span><em>Planned / not verified</em></div>
            <div><span><b>04</b> XGBoost — Secondary Comparator</span><em>Benchmark not passed</em></div>
            <div><span><b>05</b> Neuro-symbolic validation</span><em>Prototype / not production</em></div>
          </div>
          <div className="ti-model-warning">ห้ามนำ confidence หรือ prediction จากโมเดลที่ยังไม่ผ่านการทดสอบมาแสดงเป็นสัญญาณจริง</div>
        </section>

        <section className="nova-panel">
          <div className="ti-panel-head">
            <div><span className="ti-kicker">05 / STRATEGY VALIDATION</span><h2>Wave3 + SMC Research</h2></div>
            <span className="ti-model-state">RESEARCH ONLY</span>
          </div>
          <div className="ti-strategy-stack">
            <div><strong>Wave3 + Fibonacci</strong><span>Frozen benchmark rules · no gate relaxation</span></div>
            <div><strong>SMC · BOS / CHoCH / OB / FVG</strong><span>Structural evidence and causality review required</span></div>
            <div><strong>XGBoost + PyTorch LSTM</strong><span>Model comparison and chronological validation</span></div>
            <div><strong>Walk-forward + Final OOS</strong><span>Promotion blocked until independent evidence passes</span></div>
          </div>
          <p className="ti-analysis-footnote">การ์ดนี้รายงานสถานะงานวิจัย ไม่ใช่ผลวิเคราะห์ของสินทรัพย์ที่เลือก และไม่สร้าง Entry, Stop Loss หรือ Take Profit</p>
          <Link className="ti-inline-link" href="/learning-universe">เปิด Learning Universe 16 →</Link>
        </section>
      </section>

      <section className="ti-definition">
        <strong>เกณฑ์เปิด Neural Network inference</strong>
        <span>ต้องระบุ model/data/code version, ตรวจ time-series leakage, ผ่าน nested walk-forward, calibration และ Final OOS ที่ไม่ถูกนำไป tuning ก่อนเปิดแสดงผลบนหน้านี้</span>
      </section>

      <footer className="nova-footer ti-footer">
        NOVA TRADING INTELLIGENCE · DATA PROVENANCE REQUIRED · ORDER SUBMISSION DISABLED · LIVE TRADING OFF
        <span><Link href="/markets">Markets</Link> · <Link href="/broker">Broker Hub</Link> · <Link href="/gen-ai">AI Analysis</Link></span>
      </footer>
    </main>
  );
}
