'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import './broker-hub.css';

const HUB_URL = (process.env.NEXT_PUBLIC_SYSTEM_HUB_URL || 'https://voom-system-hub.suwapat787.workers.dev').replace(/\/$/, '');
const EXNESS_API_HELP = 'https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API';

function formatMoney(value, currency) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value) + (currency ? ' ' + currency : '');
}

function State({ tone = 'pending', children }) {
  return <span className={'state state-' + tone}><i />{children}</span>;
}

export default function BrokerPage() {
  const [demo, setDemo] = useState({ state: 'not_checked', detail: 'ยังไม่ได้ตรวจสอบข้อมูลบัญชี Demo', account: null, checkedAt: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checkDemo = useCallback(async () => {
    setBusy(true);
    setError('');
    setDemo({ state: 'checking', detail: 'กำลังตรวจสอบ session และการเชื่อมต่อผ่าน System Hub', account: null, checkedAt: null });
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase Auth ยังไม่ได้ตั้งค่า');
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('อ่าน Supabase session ไม่สำเร็จ');
      const token = data.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบก่อนตรวจสอบบัญชี');
      const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
      const listResponse = await fetch(HUB_URL + '/v1/connections', { headers, cache: 'no-store' });
      const listPayload = await listResponse.json().catch(() => ({}));
      if (!listResponse.ok) throw new Error(listPayload.error || 'อ่านรายการ Broker connection ไม่สำเร็จ');
      const connection = (Array.isArray(listPayload.connections) ? listPayload.connections : [])
        .find((item) => item.provider === 'exness_mt5' && item.environment === 'demo');
      if (!connection) {
        setDemo({ state: 'not_configured', detail: 'ยังไม่มี Exness MT5 Demo connection ของบัญชีผู้ใช้นี้ ระบบไม่ได้สร้าง connection ใหม่ให้อัตโนมัติ', account: null, checkedAt: new Date().toISOString() });
        return;
      }
      if (connection.recordStatus !== 'connected' || !connection.bridgeAllocated) {
        setDemo({ state: connection.recordStatus === 'disabled' ? 'disabled' : 'pending', detail: 'พบ connection record แต่ยังไม่ได้จัดสรร Dedicated Bridge และ tenant route หรือยังไม่เปิดใช้งาน', account: null, checkedAt: new Date().toISOString() });
        return;
      }
      const accountResponse = await fetch(HUB_URL + '/v1/connections/' + encodeURIComponent(connection.connectionId) + '/account', {
        headers, cache: 'no-store'
      });
      const accountPayload = await accountResponse.json().catch(() => ({}));
      if (!accountResponse.ok || accountPayload.dataVerified !== true || accountPayload.account?.connected !== true) {
        setDemo({ state: 'unverified', detail: accountPayload.error || accountPayload.detail || 'Hub ยังยืนยัน account read จาก MT5 ไม่ได้', account: null, checkedAt: new Date().toISOString() });
        return;
      }
      setDemo({ state: 'data_verified', detail: 'อ่านข้อมูลบัญชี Demo ผ่าน System Integration Hub สำเร็จ (Read-only)', account: accountPayload.account, checkedAt: new Date().toISOString() });
    } catch (err) {
      setDemo({ state: 'unavailable', detail: err instanceof Error ? err.message : 'ตรวจสอบ connection ไม่สำเร็จ', account: null, checkedAt: new Date().toISOString() });
      setError(err instanceof Error ? err.message : 'ตรวจสอบ connection ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="broker-page">
      <div className="broker-wrap">
        <header className="broker-top"><div className="broker-brand">VOOM SYSTEM <span>/ NOVA</span></div><Link className="broker-back" href="/">← กลับ Dashboard</Link></header>
        <div className="broker-eyebrow">BROKER HUB / EXNESS DUAL ADAPTER</div>
        <h1 className="broker-title">Exness Broker Hub</h1>
        <p className="broker-sub">จัดการการเชื่อมต่อแยกตาม Adapter และสภาพแวดล้อม MT5 Live, MT5 Demo และ Exness Trader API จะไม่ใช้สถานะหรือ Credential ร่วมกัน</p>
        <section className="broker-safety" role="status">
          <div><b>LIVE ORDER SUBMISSION: OFF · EXECUTION LOCKED</b>ระบบกำลังพัฒนาให้รองรับ Live Trading แต่หน้านี้ใช้ตรวจสถานะและข้อมูลที่ยืนยันได้เท่านั้น ยังไม่มีการส่งคำสั่งซื้อขายจริง</div>
        </section>
        <section className="broker-grid" aria-label="Exness adapters">
          <article className="broker-card">
            <div className="broker-card-head"><span className="broker-symbol">MT5</span><State tone={demo.state === 'data_verified' ? 'verified' : demo.state === 'unavailable' || demo.state === 'unverified' ? 'unavailable' : demo.state === 'disabled' ? 'disabled' : 'pending'}>{demo.state === 'data_verified' ? 'DATA VERIFIED' : demo.state.replaceAll('_',' ').toUpperCase()}</State></div>
            <h2>Exness MT5 Demo</h2>
            <p className="broker-desc">Windows MT5 Demo Terminal → Dedicated Bridge → Cloudflare Relay → System Integration Hub. แยก Tenant route รายบัญชี</p>
            <div className="broker-detail">{demo.detail}</div>
            {demo.account && <div className="broker-metrics">
              <div className="broker-metric"><small>Balance</small><strong>{formatMoney(demo.account.balance, demo.account.currency)}</strong></div>
              <div className="broker-metric"><small>Equity</small><strong>{formatMoney(demo.account.equity, demo.account.currency)}</strong></div>
              <div className="broker-metric"><small>Free margin</small><strong>{formatMoney(demo.account.free_margin ?? demo.account.margin_free, demo.account.currency)}</strong></div>
              <div className="broker-metric"><small>Provider timestamp</small><strong>{demo.account.as_of || '—'}</strong></div>
            </div>}
            <div className="broker-action"><button className="broker-button" onClick={checkDemo} disabled={busy}>{busy ? 'กำลังตรวจสอบ…' : 'ตรวจบัญชี Demo แบบ Read-only'}</button></div>
          </article>
          <article className="broker-card">
            <div className="broker-card-head"><span className="broker-symbol">MT5</span><State tone="owner_reported">OWNER REPORTED · NOT VERIFIED</State></div>
            <h2>Exness MT5 Live</h2>
            <p className="broker-desc">บัญชี Live มีอยู่ตามที่เจ้าของแจ้ง แต่ยังไม่มีการสร้างหรือยืนยัน Live connection, Dedicated Bridge และ tenant route</p>
            <div className="broker-detail">สถานะ: owner-reported-existing · ต้องพัฒนา additive schema/API สำหรับ environment=live แยกจาก Demo ก่อนเชื่อมบัญชีจริง</div>
            <div className="broker-action"><button className="broker-button" disabled>รอ Live connection contract</button></div>
          </article>
          <article className="broker-card">
            <div className="broker-card-head"><span className="broker-symbol">API</span><State tone="eligibility_pending">ELIGIBILITY PENDING</State></div>
            <h2>Exness Trader API</h2>
            <p className="broker-desc">แยก API Key + Ed25519 signing key, Gateway discovery และ account Access Point ออกจาก MT5 Bridge โดยเด็ดขาด</p>
            <div className="broker-detail">ยังไม่ยืนยันว่า Live account ที่มีอยู่รองรับ Trader API หรือไม่ และยังไม่มี per-tenant Secret Custody ที่ผ่านการตรวจสอบ</div>
            <div className="broker-action"><a className="broker-link" href={EXNESS_API_HELP} target="_blank" rel="noreferrer">อ่านเงื่อนไข Exness API ↗</a><button className="broker-button" disabled>รอ API eligibility และ Secret Custody</button></div>
          </article>
        </section>
        {error && <p className="broker-error" role="alert">{error}</p>}
        <footer className="broker-foot">
          ตรวจสอบล่าสุด: {demo.checkedAt ? new Date(demo.checkedAt).toLocaleString('th-TH') : 'ยังไม่ได้ตรวจสอบ Demo'}<br/>
          ข้อมูล Live และ Trader API จะไม่แสดงเป็น Connected จนกว่าจะผ่าน authenticated account read และ owner/tenant verification<br/>
          ไม่มีช่องรับรหัสผ่านหรือ private key ในหน้าเว็บ · ไม่เก็บ secrets ใน Browser · ไม่มีคำสั่งซื้อขายหรือการโอนเงิน
        </footer>
      </div>
    </main>
  );
}
