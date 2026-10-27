'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const services = [
  { name: 'Broker Hub', href: '/broker', detail: 'ตรวจสถานะการเชื่อมต่อโบรกเกอร์โดยไม่ส่งคำสั่งซื้อขาย' },
  { name: 'Gen AI Strategy Lab', href: '/gen-ai', detail: 'สร้างร่างกลยุทธ์และแสดงแหล่งที่มาของผลลัพธ์' },
  { name: 'Strategy Marketplace', href: '/marketplace', detail: 'สำรวจแม่แบบกลยุทธ์ โดยไม่ deploy หรือเทรดอัตโนมัติ' },
  { name: 'Broker Settings', href: '/settings/broker', detail: 'ตั้งค่าการเชื่อมต่อและขอบเขตความเสี่ยง' },
  { name: 'Account Access', href: '/login', detail: 'หน้าข้อมูลการเข้าถึงระบบและข้อกำหนดความปลอดภัย' }
];

export default function Home() {
  const [brokerStatus, setBrokerStatus] = useState('กำลังตรวจสอบสถานะ…');
  const [brokerDetail, setBrokerDetail] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/broker/status?broker=mt5', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        setBrokerStatus(data.accountConnected ? 'บัญชีเชื่อมต่อแล้ว' : 'ยังไม่ยืนยันการเชื่อมต่อบัญชี');
        setBrokerDetail(data.detail || 'ยังไม่มีข้อมูลยืนยันจาก MT5');
      })
      .catch(() => {
        if (active) {
          setBrokerStatus('ตรวจสอบสถานะไม่ได้');
          setBrokerDetail('API สถานะโบรกเกอร์ไม่ตอบสนอง จึงไม่สามารถยืนยันบัญชีได้');
        }
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
          <h1 className="nova-title">AI Trading Research Platform</h1>
          <p className="nova-subtitle">ศูนย์กลางวิเคราะห์กลยุทธ์ ตรวจสอบความเสี่ยง และติดตามสถานะบริการ</p>
        </div>
        <span className="nova-status">LIVE TRADING OFF</span>
      </header>

      <section className="nova-notice">
        <strong>โหมดปัจจุบัน: Read-only + AI Analysis</strong>
        <p>หน้านี้ไม่แสดงผลกำไรหรือมูลค่าพอร์ตที่ยังไม่ได้ยืนยันจากบัญชีจริง และจะไม่ส่งคำสั่งซื้อขาย ระบบต้องผ่านการตรวจสอบบัญชี Backtest และ Risk Engine ก่อนพิจารณาขั้นตอนถัดไป</p>
      </section>

      <nav className="nova-actions" aria-label="เมนูหลัก">
        <Link className="nova-link-button nova-button-primary" href="/gen-ai">เปิด Gen AI Strategy Lab →</Link>
        <Link className="nova-link-button" href="/broker">Broker Hub</Link>
        <Link className="nova-link-button" href="/marketplace">Strategy Marketplace</Link>
      </nav>

      <section className="nova-grid" aria-label="สถานะระบบ">
        <article className="nova-panel">
          <h2>Broker / MT5</h2>
          <div className="nova-stat">{brokerStatus}</div>
          <p>{brokerDetail || 'รอผลตรวจจาก API สถานะบัญชี'}</p>
          <p className="nova-small">หมายเหตุ: สถานะ API นี้ไม่ใช่การล็อกอินเข้าบัญชี XM/MT5 และไม่ใช่การตรวจสอบสิทธิ์ส่งคำสั่ง</p>
        </article>
        <article className="nova-panel">
          <h2>Gen AI</h2>
          <div className="nova-stat">Strategy Draft</div>
          <p>หน้า Gen AI ใช้ API <code>/api/gen-ai/generate</code> ซึ่งอาจใช้ Local LLM หรือ rule-based fallback ตามความพร้อมของบริการ</p>
          <Link href="/gen-ai">ไปยัง Gen AI →</Link>
        </article>
        <article className="nova-panel">
          <h2>Portfolio</h2>
          <div className="nova-stat">ไม่มีข้อมูลที่ยืนยันแล้ว</div>
          <p>ยังไม่มี API พอร์ตที่เชื่อมบัญชีลูกค้าและคืนยอดเงินที่ตรวจสอบได้ จึงไม่แสดงตัวเลขกำไรหรือมูลค่าจำลองเป็นข้อมูลจริง</p>
        </article>
        <article className="nova-panel">
          <h2>Execution Guard</h2>
          <div className="nova-stat">ปิดใช้งาน</div>
          <p>ระบบนี้แสดงผลการวิจัยเท่านั้น ไม่มีปุ่มส่งคำสั่งจริง และไม่ได้เปิด Live Trading</p>
        </article>
      </section>

      <h2 style={{ marginTop: 30, fontSize: 18 }}>เมนูระบบ</h2>
      <section className="nova-grid" style={{ marginTop: 13 }}>
        {services.map((service) => (
          <article className="nova-panel" key={service.href}>
            <h2>{service.name}</h2>
            <p>{service.detail}</p>
            <Link href={service.href}>เปิดหน้า →</Link>
          </article>
        ))}
      </section>

      <footer className="nova-footer">แหล่งข้อมูล: API ของ VOOM SYSTEM NOVA ที่มีอยู่ใน repo · ไม่มีการส่งคำสั่งซื้อขาย · สถานะบัญชีต้องผ่านการยืนยันก่อนใช้งาน</footer>
    </main>
  );
}