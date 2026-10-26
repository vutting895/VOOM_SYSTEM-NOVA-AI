'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const providers = [
  { id: 'mt5', market: 'Forex', name: 'MetaTrader 5', symbol: 'MT5', method: 'Windows terminal / secured bridge', note: 'Requires a separately installed and reviewed MT5 bridge.' },
  { id: 'oanda', market: 'Forex', name: 'OANDA', symbol: 'OA', method: 'REST API / account authorization', note: 'API availability and account region must be verified.' },
  { id: 'binance', market: 'Crypto', name: 'Binance', symbol: 'BN', method: 'Read-only API key', note: 'Use read-only permissions; disable trading and withdrawals.' },
  { id: 'bybit', market: 'Crypto', name: 'Bybit', symbol: 'BY', method: 'Read-only API key', note: 'Use read-only permissions; disable trading and withdrawals.' },
  { id: 'okx', market: 'Crypto', name: 'OKX', symbol: 'OK', method: 'Public market data / approved API', note: 'Private account access depends on API program and eligibility.' },
  { id: 'coinbase', market: 'Crypto', name: 'Coinbase Advanced', symbol: 'CB', method: 'Advanced Trade API', note: 'Account authorization must be implemented and verified.' },
  { id: 'kraken', market: 'Crypto', name: 'Kraken', symbol: 'KR', method: 'Read-only API key / public data', note: 'Use permissions limited to the required read scopes.' },
  { id: 'bitget', market: 'Crypto', name: 'Bitget', symbol: 'BG', method: 'Read-only API / public data', note: 'Verify product-specific access before account sync.' },
  { id: 'alpaca', market: 'Stocks', name: 'Alpaca', symbol: 'AL', method: 'OAuth / account API', note: 'Keep the existing integration in Paper Trading during validation.' },
  { id: 'ibkr', market: 'Stocks', name: 'Interactive Brokers', symbol: 'IB', method: 'Client Portal / approved API', note: 'Requires account-specific gateway and authorization setup.' },
  { id: 'schwab', market: 'Stocks', name: 'Charles Schwab', symbol: 'CS', method: 'OAuth / developer API', note: 'Requires approved application and supported account scopes.' },
  { id: 'settrade', market: 'Stocks', name: 'SETTrade Open API', symbol: 'SET', method: 'Broker-approved Open API', note: 'Availability depends on Thai broker participation and approval.' },
];
const markets = ['All', 'Forex', 'Crypto', 'Stocks'];
const panel = { border: '1px solid #293149', background: '#111521', borderRadius: 16, padding: 20 };
const button = { border: '1px solid #39425d', background: '#171c2b', color: '#edf0fa', borderRadius: 10, padding: '10px 13px', cursor: 'pointer' };

export default function BrokerHubPage() {
  const [market, setMarket] = useState('All');
  const [selected, setSelected] = useState('mt5');
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const filtered = useMemo(() => market === 'All' ? providers : providers.filter(p => p.market === market), [market]);
  const active = providers.find(p => p.id === selected) || providers[0];

  async function checkStatus() {
    setChecking(true); setStatus(null);
    try {
      const response = await fetch('/api/broker/status?broker=' + encodeURIComponent(selected), { cache: 'no-store' });
      const data = await response.json();
      setStatus({ ...data, httpOk: response.ok });
    } catch {
      setStatus({ status: 'unavailable', detail: 'Could not reach the broker status endpoint.', connected: false, accountConnected: false, tradingEnabled: false });
    } finally { setChecking(false); }
  }

  return <main style={{ minHeight: '100vh', background: '#080b12', color: '#eef2ff', padding: '26px clamp(16px,4vw,54px) 60px', fontFamily: 'Inter,system-ui,sans-serif' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 36 }}>
        <strong style={{ letterSpacing: '.12em' }}>VOOM SYSTEM <span style={{ color: '#a69aff' }}>/ NOVA</span></strong>
        <Link href="/" style={{ color: '#aab4ce', textDecoration: 'none' }}>← Dashboard</Link>
      </header>
      <p style={{ color: '#a69aff', fontSize: 11, fontWeight: 800, letterSpacing: '.2em' }}>MULTI-BROKER · RESEARCH HUB</p>
      <h1 style={{ fontSize: 'clamp(32px,5vw,48px)', margin: '10px 0', letterSpacing: '-.04em' }}>Broker Hub</h1>
      <p style={{ maxWidth: 760, color: '#a1abc2', fontSize: 14, lineHeight: 1.8 }}>เลือกผู้ให้บริการ Forex, Crypto หรือหุ้นจากหน้าเดียว พร้อมออกแบบให้ส่งเฉพาะข้อมูลที่ได้รับอนุญาตไปยัง AI Research และ Learning Universe</p>
      <p style={{ display: 'inline-block', border: '1px solid #2d5a4e', background: '#10251f', color: '#9ce4ca', borderRadius: 30, padding: '9px 13px', fontSize: 12, fontWeight: 800 }}>READ-ONLY · AI ANALYSIS ONLY · LIVE TRADING DISABLED</p>

      <nav aria-label="Filter markets" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '22px 0 16px' }}>
        {markets.map(m => <button key={m} style={{ ...button, borderColor: market === m ? '#9c8cff' : '#39425d', background: market === m ? '#25203f' : '#171c2b' }} onClick={() => { setMarket(m); const next = m === 'All' ? providers : providers.filter(p => p.market === m); if (!next.some(p => p.id === selected)) setSelected(next[0]?.id || 'mt5'); setStatus(null); }}>{m === 'Stocks' ? 'หุ้น' : m === 'Crypto' ? 'คริปโต' : m === 'Forex' ? 'Forex' : 'ทั้งหมด'}</button>)}
      </nav>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 12 }}>
        {filtered.map(p => <button key={p.id} onClick={() => { setSelected(p.id); setStatus(null); }} style={{ ...panel, textAlign: 'left', color: '#eef2ff', cursor: 'pointer', borderColor: selected === p.id ? '#9787ff' : '#293149', background: selected === p.id ? '#1b1930' : '#111521' }}>
          <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}><div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 12, background: '#25253c', color: '#c2b8ff', fontSize: 11, fontWeight: 900 }}>{p.symbol}</div><div><strong>{p.name}</strong><div style={{ color: '#a69aff', fontSize: 10, marginTop: 4 }}>{p.market.toUpperCase()}</div></div></div>
          <p style={{ fontSize: 12, color: '#c1c9dd', margin: '14px 0 6px' }}>{p.method}</p><p style={{ fontSize: 11, color: '#8995ae', lineHeight: 1.6, margin: 0 }}>{p.note}</p>
        </button>)}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 18 }}>
        <section style={panel}>
          <p style={{ color: '#a69aff', fontSize: 10, fontWeight: 800, letterSpacing: '.15em' }}>SELECTED PROVIDER</p>
          <h2 style={{ fontSize: 23, margin: '12px 0 4px' }}>{active.name}</h2>
          <p style={{ color: '#929db5', fontSize: 12, lineHeight: 1.7 }}>{active.note}</p>
          <p style={{ display: 'inline-block', border: '1px solid #39425d', borderRadius: 6, padding: '5px 8px', color: '#b5c0d9', fontSize: 10 }}>Permission: Read-only / Public market data</p>
          <button disabled={checking} onClick={checkStatus} style={{ ...button, display: 'block', width: '100%', marginTop: 18, background: '#6858d8', opacity: checking ? .6 : 1 }}>{checking ? 'กำลังตรวจสอบ…' : 'ตรวจสอบสถานะการเชื่อมต่อ'}</button>
          {status && <div role="status" aria-live="polite" style={{ border: '1px solid #57492d', background: '#211b13', color: '#f0d39a', padding: 13, borderRadius: 12, fontSize: 12, lineHeight: 1.75, marginTop: 14 }}>
            <strong>ผลตรวจสอบ: {status.status || 'unknown'}</strong><br />{status.detail || status.error || 'ไม่มีรายละเอียด'}<br />
            บัญชีผู้ใช้เชื่อมต่อแล้ว: {status.accountConnected ? 'ใช่' : 'ยังไม่ได้ยืนยัน'}<br />ส่งคำสั่งซื้อขาย: {status.tradingEnabled ? 'เปิด' : 'ปิด'}<br />
            {status.checkedAt ? 'เวลา: ' + new Date(status.checkedAt).toLocaleString('th-TH') : ''}
          </div>}
        </section>
        <aside style={panel}>
          <h2 style={{ marginTop: 0 }}>ขอบเขตความปลอดภัย</h2>
          <ul style={{ paddingLeft: 20, color: '#929db5', fontSize: 12, lineHeight: 1.8 }}>
            <li><strong style={{ color: '#eef2ff' }}>Credential Isolation</strong><br />ห้ามใส่ API Secret หรือรหัสผ่านในหน้าเว็บ แชต หรือ Git</li>
            <li><strong style={{ color: '#eef2ff' }}>Account Verification</strong><br />ต้องมี user session, owner isolation และการอนุญาตต่อบัญชีก่อนอ่านข้อมูลส่วนตัว</li>
            <li><strong style={{ color: '#eef2ff' }}>AI Research</strong><br />ส่งข้อมูลตลาด/พอร์ตที่ได้รับอนุญาตไปวิเคราะห์ SMC, risk, backtest และ optimize</li>
            <li><strong style={{ color: '#eef2ff' }}>Execution Guard</strong><br />หน้านี้ไม่มีคำสั่งซื้อขาย และไม่สามารถเปิด Live Trading</li>
          </ul>
        </aside>
      </div>
      <p style={{ textAlign: 'center', color: '#727d95', fontSize: 11, lineHeight: 1.8, marginTop: 25 }}>VOOM_SYSTEM NOVA · Broker Hub foundation<br />Catalog selection does not mean an account is connected. Private account adapters require separate implementation and security verification.</p>
    </div>
  </main>;
}
