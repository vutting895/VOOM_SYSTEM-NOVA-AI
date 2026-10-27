'use client';

import Link from 'next/link';

export default function LoginPage() {
  return (
    <main className="nova-login-wrap">
      <section className="nova-login-card">
        <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
        <h1>เข้าสู่ระบบและเชื่อมต่อบัญชี</h1>
        <p>ศูนย์กลางจัดการการเข้าถึง VOOM SYSTEM และไปยังหน้าตั้งค่าการเชื่อมต่อโบรกเกอร์</p>
        <div className="nova-notice">
          <strong>AUTH NOT CONFIGURED · LIVE TRADING OFF</strong>
          <p>ระบบยืนยันตัวตนผู้ใช้ยังไม่ได้เปิดใช้งานจากหน้านี้ จึงไม่มีการขอหรือส่งรหัสผ่าน รหัสบัญชีโบรกเกอร์ หรือ API Secret</p>
        </div>
        <div className="nova-panel">
          <h2>ข้อกำหนดก่อนใช้งาน</h2>
          <ul className="nova-list">
            <li>ตั้งค่า Authentication ฝั่งเซิร์ฟเวอร์และการแยกข้อมูลผู้ใช้ให้เสร็จก่อน</li>
            <li>เชื่อมต่อ XM / MT5 ผ่าน broker adapter ที่ได้รับอนุญาต โดยเริ่มจาก Read-only</li>
            <li>เก็บ credentials ใน secret storage ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามใส่ในฟอร์มทดสอบหรือ Git</li>
            <li>Live Trading ยังคงปิด และหน้านี้ไม่มีการส่งคำสั่งซื้อขาย</li>
          </ul>
        </div>
        <div className="nova-actions">
          <Link className="nova-link-button nova-button-primary" href="/broker">ไปหน้า Broker Hub →</Link>
          <Link className="nova-link-button" href="/">กลับ Dashboard</Link>
        </div>
        <p className="nova-small">ไม่กรอกหรือส่งรหัสผ่านของ XM, MT5 หรือโบรกเกอร์อื่นในหน้านี้</p>
      </section>
    </main>
  );
}