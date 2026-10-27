'use client';

import { useState } from 'react';
import Link from 'next/link';

const providers = [
  { id: 'mt5', name: 'MetaTrader 5 / XM', market: 'Forex', detail: 'ต้องมี MT5 terminal และ bridge ที่ผ่านการรักษาความปลอดภัย การตรวจนี้ยังไม่ยืนยันบัญชี XM' },
  { id: 'oanda', name: 'OANDA', market: 'Forex', detail: 'ยังไม่เปิดตรวจบัญชีส่วนตัวจนกว่าจะมี authorization ที่ตรวจสอบแล้ว' },
  { id: 'binance', name: 'Binance', market: 'Crypto', detail: 'ใช้ข้อมูลสาธารณะหรือ API แบบอ่านอย่างเดียวเท่านั้น' },
  { id: 'bybit', name: 'Bybit', market: 'Crypto', detail: 'ใช้ข้อมูลสาธารณะหรือ API แบบอ่านอย่างเดียวเท่านั้น' },
  { id: 'okx', name: 'OKX', market: 'Crypto', detail: 'ตรวจเฉพาะข้อมูลตลาดสาธารณะ ยังไม่ยืนยันบัญชีส่วนตัว' },
  { id: 'coinbase', name: 'Coinbase Advanced', market: 'Crypto', detail: 'บัญชีส่วนตัวยังต้องผ่าน authorization และการตรวจสอบ' },
  { id: 'kraken', name: 'Kraken', market: 'Crypto', detail: 'จำกัดสิทธิ์ API เฉพาะการอ่านข้อมูล' },
  { id: 'bitget', name: 'Bitget', market: 'Crypto', detail: 'จำกัดสิทธิ์ API เฉพาะการอ่านข้อมูล' },
  { id: 'alpaca', name: 'Alpaca', market: 'Stocks', detail: 'คง Paper Trading ระหว่างการตรวจสอบ' },
  { id: 'ibkr', name: 'Interactive Brokers', market: 'Stocks', detail: 'ยังไม่เปิดตรวจบัญชีส่วนตัว' },
  { id: 'schwab', name: 'Charles Schwab', market: 'Stocks', detail: 'ยังไม่เปิดตรวจบัญชีส่วนตัว' },
  { id: 'settrade', name: 'SETTrade', market: 'Stocks', detail: 'ยังไม่เปิดตรวจบัญชีส่วนตัว' },
];

export default function BrokerPage() {
  const [broker, setBroker] = useState('mt5');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const selected = providers.find((item) => item.id === broker) || providers[0];

  async function checkStatus(event) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/broker/status?broker=' + encodeURIComponent(broker), {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      setResult({ ...data, httpStatus: response.status });
    } catch {
      setResult({
        status: 'unavailable',
        detail: 'ติดต่อ endpoint ตรวจสถานะไม่ได้ โปรดลองใหม่ภายหลัง',
        accountConnected: false,
        tradingEnabled: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#080b13', color: '#eef2ff', padding: '28px 16px 48px', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <section style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          <strong>VOOM SYSTEM <span style={{ color: '#a99aff' }}>/ NOVA</span></strong>
          <nav style={{ display: 'flex', gap: 16 }}>
            <Link href="/broker-hub" style={{ color: '#bdb2ff' }}>Broker Hub</Link>
            <Link href="/" style={{ color: '#b8c1d7' }}>Dashboard</Link>
          </nav>
        </header>

        <p style={{ color: '#a99aff', fontSize: 11, fontWeight: 800, letterSpacing: '.18em' }}>BROKER CONNECTIVITY</p>
        <h1 style={{ fontSize: 'clamp(30px,5vw,44px)', margin: '10px 0' }}>ตรวจสอบการเชื่อมต่อโบรกเกอร์</h1>
        <p style={{ color: '#a2adc4', lineHeight: 1.8, maxWidth: 700 }}>หน้านี้ตรวจสถานะจาก backend เท่านั้น การตอบสนองของข้อมูลตลาดสาธารณะไม่ถือว่าเชื่อมบัญชีส่วนตัวสำเร็จ และ MT5/XM ยังต้องมี bridge ที่ปลอดภัยและผ่านการทดสอบแยกต่างหาก</p>

        <div role="status" style={{ border: '1px solid #2d5a4e', background: '#10251f', color: '#9ce4ca', borderRadius: 12, padding: 14, margin: '20px 0' }}>
          READ-ONLY · AI ANALYSIS ONLY · LIVE TRADING DISABLED
        </div>

        <form onSubmit={checkStatus} style={{ border: '1px solid #293149', background: '#111521', borderRadius: 16, padding: 20 }}>
          <label htmlFor="broker" style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>เลือกผู้ให้บริการ</label>
          <select id="broker" value={broker} onChange={(event) => { setBroker(event.target.value); setResult(null); }} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #39425d', background: '#090d16', color: '#eef2ff' }}>
            {providers.map((item) => <option key={item.id} value={item.id}>{item.market} — {item.name}</option>)}
          </select>
          <p style={{ color: '#a2adc4', fontSize: 13, lineHeight: 1.7 }}>{selected.detail}</p>
          <button type="submit" disabled={busy} style={{ width: '100%', padding: 13, border: 0, borderRadius: 10, background: '#6858d8', color: 'white', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>
            {busy ? 'กำลังตรวจสอบ…' : 'ตรวจสอบสถานะ (GET only)'}
          </button>
        </form>

        {result && <section role="status" aria-live="polite" style={{ border: '1px solid #57492d', background: '#211b13', color: '#f0d39a', padding: 16, borderRadius: 12, marginTop: 16, overflowWrap: 'anywhere' }}>
          <strong>ผลตรวจสอบ: {result.status || 'unknown'}</strong>
          <p>{result.detail || result.error || 'ไม่มีรายละเอียดจาก backend'}</p>
          <p>HTTP: {result.httpStatus ?? 'ไม่ทราบ'} · บัญชีส่วนตัวเชื่อมต่อ: {result.accountConnected ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'} · ส่งคำสั่งซื้อขาย: {result.tradingEnabled ? 'เปิด' : 'ปิด'}</p>
          {result.checkedAt && <small>ตรวจเมื่อ {new Date(result.checkedAt).toLocaleString('th-TH')}</small>}
        </section>}

        <p style={{ color: '#7f8aa2', fontSize: 12, lineHeight: 1.8, marginTop: 22 }}>ความปลอดภัย: ห้ามกรอกรหัสผ่านหรือ API Secret ในหน้านี้ ห้ามใส่ credentials ลง GitHub หรือแชต และไม่มี endpoint ส่งคำสั่งซื้อขายใน flow นี้</p>
      </section>
    </main>
  );
}
