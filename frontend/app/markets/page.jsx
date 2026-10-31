'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import {
  findExnessDemoConnection,
  isProvisionedDemoConnection,
  normalizeReadOnlyQuote,
  quoteFreshness,
} from '../../lib/trading-market-data';
import './markets.css';

const HUB_URL = (process.env.NEXT_PUBLIC_SYSTEM_HUB_URL || 'https://voom-system-hub.suwapat787.workers.dev').replace(/\/$/, '');
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function CandleChart({ bars, digits }) {
  const geometry = useMemo(() => {
    if (!bars?.length) return null;
    const low = Math.min(...bars.map((bar) => bar.low));
    const high = Math.max(...bars.map((bar) => bar.high));
    const span = Math.max(high - low, Math.pow(10, -(digits ?? 2)));
    const xStep = 900 / bars.length;
    const y = (price) => 370 - ((price - low) / span) * 320;
    return { low, high, xStep, y };
  }, [bars, digits]);

  if (!geometry) return <div className="market-chart-empty">ยังไม่มีแท่งเทียนที่ผ่านการตรวจสอบ</div>;

  return (
    <svg className="market-candles" viewBox="0 0 1000 420" role="img" aria-label="กราฟแท่งเทียน OHLC จาก Exness MT5 Demo" preserveAspectRatio="none">
      {[0, 1, 2, 3, 4].map((line) => {
        const y = 42 + line * 80;
        return <line key={line} x1="48" x2="960" y1={y} y2={y} className="market-grid-line" />;
      })}
      {bars.map((bar, index) => {
        const x = 50 + index * geometry.xStep + geometry.xStep / 2;
        const rising = bar.close >= bar.open;
        const top = geometry.y(Math.max(bar.open, bar.close));
        const bottom = geometry.y(Math.min(bar.open, bar.close));
        const bodyHeight = Math.max(1.5, bottom - top);
        const width = Math.max(2, Math.min(9, geometry.xStep * 0.58));
        return (
          <g key={bar.time + '-' + index} className={rising ? 'market-candle-up' : 'market-candle-down'}>
            <line x1={x} x2={x} y1={geometry.y(bar.high)} y2={geometry.y(bar.low)} />
            <rect x={x - width / 2} y={top} width={width} height={bodyHeight} rx="0.8" />
          </g>
        );
      })}
      <text x="54" y="22" className="market-chart-axis">{geometry.high.toFixed(digits ?? 2)}</text>
      <text x="54" y="405" className="market-chart-axis">{geometry.low.toFixed(digits ?? 2)}</text>
    </svg>
  );
}

export default function MarketsPage() {
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('M5');
  const [quote, setQuote] = useState(null);
  const [connectionState, setConnectionState] = useState('checking');
  const [detail, setDetail] = useState('กำลังตรวจสอบ Exness Demo และ MT5 Bridge');
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    const requestedSymbol = symbol.trim();
    if (!requestedSymbol) {
      setConnectionState('invalid');
      setDetail('กรุณาระบุ Symbol ที่ตรงกับชื่อใน MT5');
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase Auth ยังไม่ได้ตั้งค่า');
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error('อ่าน Supabase session ไม่สำเร็จ');
      const token = data.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อนดูข้อมูลบัญชี Demo');

      const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
      const connectionsResponse = await fetch(HUB_URL + '/v1/connections', {
        headers, cache: 'no-store', signal: AbortSignal.timeout(12000),
      });
      const connectionsPayload = await connectionsResponse.json().catch(() => ({}));
      if (!connectionsResponse.ok) throw new Error(connectionsPayload.error || 'อ่าน Broker connections ไม่สำเร็จ');

      const connection = findExnessDemoConnection(connectionsPayload);
      if (!connection) {
        setConnectionState('not_configured');
        setDetail('ไม่พบ Exness MT5 Demo connection ของผู้ใช้นี้ กรุณาเปิด Broker Hub เพื่อเริ่มคำขอเชื่อมต่อ');
        setQuote(null);
        return;
      }
      if (!isProvisionedDemoConnection(connection)) {
        setConnectionState('pending');
        setDetail('พบ Demo connection แต่ยังไม่ได้จัดสรร Dedicated Bridge และ Tenant Route');
        setQuote(null);
        return;
      }

      const endpoint = HUB_URL + '/v1/connections/' + encodeURIComponent(connection.connectionId) +
        '/quotes?symbol=' + encodeURIComponent(requestedSymbol) +
        '&timeframe=' + encodeURIComponent(timeframe) + '&count=120';
      const quoteResponse = await fetch(endpoint, {
        headers, cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const quotePayload = await quoteResponse.json().catch(() => ({}));
      if (!quoteResponse.ok) {
        const message = quotePayload.detail || quotePayload.error || 'MT5 ยังไม่สามารถส่งข้อมูลราคาได้';
        throw new Error(message);
      }
      const normalized = normalizeReadOnlyQuote(quotePayload);
      if (!normalized) throw new Error('ข้อมูลจาก Broker ไม่ผ่านเงื่อนไขยืนยัน Read-only / Data Verified');
      setQuote(normalized);
      setConnectionState('verified');
      setDetail('รับข้อมูล OHLC และ Bid/Ask จาก Exness MT5 Demo ผ่าน System Hub');
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      setConnectionState('unavailable');
      setDetail(error instanceof Error ? error.message : 'ไม่สามารถอ่านข้อมูลตลาดได้');
    } finally {
      setBusy(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const freshness = quoteFreshness(quote?.tick?.time, Date.now());
  const priceDigits = quote?.digits ?? 2;

  return (
    <main className="trading-market-page">
      <header className="trading-market-header">
        <div>
          <Link className="trading-market-brand" href="/">VOOM SYSTEM <span>/ NOVA</span></Link>
          <p className="trading-market-eyebrow">TRADING / MARKET INTELLIGENCE</p>
          <h1>Market <em>Dashboard</em></h1>
          <p className="trading-market-intro">ข้อมูลราคาและแท่งเทียนจาก Exness MT5 Demo ที่ผ่านการยืนยันเท่านั้น ไม่มีราคาจำลอง</p>
        </div>
        <div className="trading-market-mode"><strong>READ-ONLY</strong><span>ORDER SUBMISSION OFF</span><span>LIVE TRADING OFF</span></div>
      </header>

      <section className="trading-market-guard" role="status">
        <strong>SAFE MODE ACTIVE</strong>
        <span>หน้านี้อ่านข้อมูลบัญชีและตลาดเท่านั้น ไม่มี endpoint สำหรับส่งคำสั่งซื้อขาย</span>
      </section>

      <section className="trading-market-controls" aria-label="Market data controls">
        <label>MT5 SYMBOL
          <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 40))} maxLength={40} />
        </label>
        <label>TIMEFRAME
          <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
            {TIMEFRAMES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" onClick={refresh} disabled={busy}>{busy ? 'กำลังอ่านข้อมูล…' : 'Refresh MT5 Data'}</button>
      </section>

      <section className="trading-market-status">
        <span className={'trading-market-state state-' + connectionState}>{connectionState.replaceAll('_', ' ').toUpperCase()}</span>
        <p>{detail}</p>
        <small>ตรวจสอบล่าสุด: {lastUpdated ? new Date(lastUpdated).toLocaleString('th-TH') : 'ยังไม่มีข้อมูลที่ยืนยันได้'}</small>
      </section>

      {quote && (
        <>
          <section className="trading-market-price-grid" aria-label="Verified market quote">
            <article><span>SYMBOL</span><strong>{quote.symbol}</strong><small>{quote.timeframe} · Exness MT5 Demo</small></article>
            <article><span>BID</span><strong>{quote.tick ? quote.tick.bid.toFixed(priceDigits) : '—'}</strong><small>Provider tick</small></article>
            <article><span>ASK</span><strong>{quote.tick ? quote.tick.ask.toFixed(priceDigits) : '—'}</strong><small>Provider tick</small></article>
            <article><span>SPREAD</span><strong>{quote.tick ? (quote.tick.ask - quote.tick.bid).toFixed(priceDigits) : '—'}</strong><small>Ask − Bid</small></article>
          </section>

          <section className="trading-market-chart-panel">
            <div className="trading-market-chart-heading">
              <div><span>EXNESS MT5 / VERIFIED OHLC</span><h2>{quote.symbol} · {quote.timeframe}</h2></div>
              <span className={'trading-market-state state-' + freshness}>{freshness === 'fresh' ? 'TICK FRESH' : freshness === 'stale' ? 'TICK STALE' : 'TICK TIME UNKNOWN'}</span>
            </div>
            <CandleChart bars={quote.bars} digits={priceDigits} />
            <div className="trading-market-chart-foot"><span>{quote.bars.length} bars</span><span>Provider time: {quote.tick?.time || quote.asOf || '—'}</span></div>
          </section>
        </>
      )}

      {!quote && (
        <section className="trading-market-empty">
          <strong>{connectionState === 'pending' ? 'MT5 Bridge ยังไม่พร้อม' : connectionState === 'not_configured' ? 'ยังไม่มี Demo Connection' : 'รอข้อมูลตลาดที่ยืนยันได้'}</strong>
          <p>{detail}</p>
          <Link href="/broker">เปิด Exness Broker Hub ↗</Link>
        </section>
      )}

      <footer className="trading-market-footer">
        <span>VOOM / NOVA TRADING</span><span>DATA SOURCE: EXNESS MT5 DEMO</span><span>ORDERS OFF · LIVE TRADING OFF</span>
      </footer>
    </main>
  );
}
