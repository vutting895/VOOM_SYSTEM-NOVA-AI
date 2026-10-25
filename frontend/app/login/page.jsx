'use client';

import { useState } from 'react';
import Link from 'next/link';

const brokers = [
  { id: 'binance', name: 'Binance', type: 'Crypto exchange', mark: 'B', color: '#f0c76b', detail: 'เริ่มจาก API แบบ read-only และปิดสิทธิ์ถอนเงิน' },
  { id: 'bybit', name: 'Bybit', type: 'Crypto exchange', mark: 'By', color: '#a99aff', detail: 'ต้องตั้งค่า API/OAuth และ callback ฝั่งเซิร์ฟเวอร์ก่อน' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [broker, setBroker] = useState('binance');
  const [notice, setNotice] = useState('');
  const selected = brokers.find((item) => item.id === broker);

  return (
    <main style={{minHeight:'100vh',padding:'28px 16px 48px',color:'#eef3ff',fontFamily:'Inter,system-ui,sans-serif',background:'radial-gradient(ellipse at 10% 0%,#654bce30,transparent 40%),radial-gradient(ellipse at 95% 40%,#00cba51a,transparent 35%),#060910'}}>
      <div style={{maxWidth:1000,margin:'auto'}}>
        <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:36}}>
          <strong style={{letterSpacing:'.12em'}}>VOOM SYSTEM <span style={{color:'#a99aff'}}>/ NOVA</span></strong>
          <Link href="/" style={{color:'#aab4cb',textDecoration:'none',fontSize:13}}>← Dashboard</Link>
        </header>
        <p style={{color:'#7be8d1',fontSize:11,letterSpacing:'.2em',fontWeight:800}}>SECURE ACCESS · BROKER PORTAL</p>
        <h1 style={{fontSize:'clamp(30px,5vw,48px)',letterSpacing:'-.04em',margin:'12px 0'}}>เข้าสู่ระบบและเชื่อมต่อบัญชี</h1>
        <p style={{color:'#98a4bd',fontSize:14,lineHeight:1.8,maxWidth:680}}>ศูนย์กลางจัดการการเข้าถึง VOOM SYSTEM และเลือกแพลตฟอร์มโบรกเกอร์ที่ต้องการเชื่อมต่อ</p>
        <div style={{display:'inline-block',padding:'9px 13px',border:'1px solid #55452b',background:'#1c1914',borderRadius:30,color:'#e9c27c',fontSize:12,margin:'8px 0 24px'}}>● AUTH NOT CONFIGURED · LIVE TRADING OFF</div>
        <div className="login-columns">
          <section className="login-panel">
            <h2>เข้าสู่ระบบ VOOM</h2>
            <p>ฟอร์มเตรียมไว้สำหรับเชื่อมระบบ Authentication</p>
            <form onSubmit={(event)=>{event.preventDefault();setNotice('ยังไม่ได้เปิดใช้การยืนยันตัวตนจริง ต้องตั้งค่า Authentication ฝั่งเซิร์ฟเวอร์ก่อน ฟอร์มนี้ไม่ส่งหรือบันทึกข้อมูลบัญชี')}}>
              <label>อีเมล<input type="email" required autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@example.com"/></label>
              <button className="login-primary" type="submit">ดำเนินการเข้าสู่ระบบ</button>
            </form>
            {notice && <p role="status" className="login-warning">{notice}</p>}
            <div className="login-warning">ความปลอดภัย: ยังไม่มีการตรวจรหัสผ่านหรือสร้าง session จาก backend และหน้านี้ไม่ขอรหัสผ่านโบรกเกอร์</div>
            <p className="login-status">● Live trading ปิดอยู่ — ไม่มีคำสั่งซื้อขายถูกส่ง</p>
          </section>
          <section className="login-panel">
            <h2>เลือกโบรกเกอร์</h2><p>เลือกบริการเพื่อไปหน้าตั้งค่าการเชื่อมต่อ</p>
            {brokers.map((item)=><button type="button" key={item.id} onClick={()=>setBroker(item.id)} className={'broker-option '+(broker===item.id?'chosen':'')}><span className="broker-mark" style={{color:item.color}}>{item.mark}</span><span><strong>{item.name}</strong><small>{item.type}</small></span><span style={{marginLeft:'auto',color:'#a99aff'}}>{broker===item.id?'✓':'→'}</span></button>)}
            <div className="login-warning">{selected.detail}<br/>ต้องติดตั้งและทดสอบ broker adapter และ secure secret storage ก่อนเชื่อมต่อบัญชีจริง</div>
            <Link className="login-primary" style={{display:'block',textAlign:'center',textDecoration:'none'}} href="/broker">ไปหน้าตั้งค่าโบรกเกอร์ →</Link>
          </section>
        </div>
        <p style={{textAlign:'center',fontSize:11,color:'#6f7b93',lineHeight:1.8,marginTop:22}}>VOOM SYSTEM · NOVA<br/>ห้ามกรอก API Secret หรือรหัสผ่านโบรกเกอร์ในหน้าที่ยังไม่ได้เปิดใช้ระบบเชื่อมต่อจริง</p>
      </div>
      <style jsx>{`
        .login-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .login-panel{border:1px solid #252b3d;border-radius:18px;padding:clamp(18px,3vw,26px);background:#101420}
        .login-panel h2{font-size:16px;margin:0 0 8px}.login-panel p{color:#929db5;font-size:12px;line-height:1.75}
        .login-panel label{display:block;color:#c5cce0;font-size:12px;margin-top:18px}
        .login-panel input{display:block;width:100%;margin-top:8px;border:1px solid #30364a;background:#090d16;color:white;border-radius:10px;padding:13px;font:inherit}
        .login-primary{width:100%;margin-top:16px;padding:13px;border:0;border-radius:10px;background:linear-gradient(100deg,#8974ff,#4a9df5);color:white;font-weight:800;cursor:pointer}
        .login-warning{margin-top:14px;border:1px solid #55452b;background:#201a12;color:#e8c782;border-radius:10px;padding:12px;font-size:11px;line-height:1.8}
        .login-status{color:#7be8d1!important}.broker-option{display:flex;align-items:center;gap:12px;width:100%;text-align:left;color:#e9edfa;border:1px solid #2a3042;background:#0b0f19;border-radius:12px;padding:13px;margin-top:9px;cursor:pointer}
        .broker-option.chosen{border-color:#9b8cff;background:#1b1930}.broker-mark{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:#20243a;font-weight:900}
        .broker-option strong,.broker-option small{display:block}.broker-option strong{font-size:12px}.broker-option small{font-size:10px;color:#8995ad;margin-top:4px}
        @media(max-width:720px){.login-columns{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
