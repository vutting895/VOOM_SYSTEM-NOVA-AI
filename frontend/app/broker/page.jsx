'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';

const providers = [
  {id:'mt5-bridge',name:'MetaTrader 5 Bridge',market:'forex',kind:'Forex',auth:'Windows/VPS bridge',detail:'ต้องมี MT5 terminal ทำงานบน Windows/VPS แยกจาก Cloudflare Workers',status:'catalog-only'},
  {id:'oanda',name:'OANDA API',market:'forex',kind:'Forex',auth:'Provider API / OAuth ตามสิทธิ์',detail:'ตรวจสอบการให้บริการและสิทธิ์ API ตามประเทศและประเภทบัญชี',status:'catalog-only'},
  {id:'exness',name:'Exness Trading API',market:'forex',kind:'Forex',auth:'API Key + Ed25519 signing',detail:'มีบัญชี MT5 แล้ว แต่ต้องตรวจเมนู API ใน Personal Area ก่อน บัญชี MT5/MetaTrader บางประเภทไม่รองรับ API โดยตรง; ยังไม่มีการยืนยันการเชื่อมต่อ',status:'api-access-check'},
  {id:'binance',name:'Binance',market:'crypto',kind:'Crypto',auth:'Public market data / read-only API',detail:'เริ่มจาก public market data; ข้อมูลบัญชีต้องใช้ API key แบบอ่านอย่างเดียว',status:'public-data'},
  {id:'coinbase',name:'Coinbase',market:'crypto',kind:'Crypto',auth:'Public data / OAuth หรือ API',detail:'สิทธิ์บัญชีและ API แตกต่างตามผลิตภัณฑ์และภูมิภาค',status:'catalog-only'},
  {id:'kraken',name:'Kraken',market:'crypto',kind:'Crypto',auth:'Public data / read-only API',detail:'ต้องตรวจสอบ permission ของ API key ก่อนเปิดใช้ข้อมูลส่วนตัว',status:'catalog-only'},
  {id:'bybit',name:'Bybit',market:'crypto',kind:'Crypto',auth:'Public data / read-only API',detail:'ปิด trading และ withdrawal permissions; ตรวจสอบข้อจำกัดภูมิภาค',status:'catalog-only'},
  {id:'alpaca',name:'Alpaca',market:'equities',kind:'หุ้น',auth:'OAuth 2.0',detail:'ต้องตรวจสอบ OAuth callback และสิทธิ์ของ integration เดิมก่อนเปิดใช้',status:'catalog-only'},
  {id:'settrade-open-api',name:'SETTrade Open API',market:'equities',kind:'หุ้นไทย',auth:'Broker-approved API',detail:'ต้องเป็นโบรกเกอร์ที่เข้าร่วมและได้รับอนุมัติสิทธิ์ API',status:'catalog-only'},
  {id:'interactive-brokers',name:'Interactive Brokers',market:'equities',kind:'หุ้น',auth:'IBKR API / Client Portal',detail:'ต้องตรวจสอบข้อกำหนดบัญชีและวิธี authentication ของ IBKR',status:'catalog-only'},
];
const marketFilters = [{id:'all',label:'ทั้งหมด'},{id:'forex',label:'Forex'},{id:'crypto',label:'Crypto'},{id:'equities',label:'หุ้น'}];
export default function BrokerPage(){
  const [market,setMarket] = useState('all');
  const [selected,setSelected] = useState('binance');
  const [notice,setNotice] = useState('');
  const [checking,setChecking] = useState(false);
  const visible = useMemo(()=>providers.filter(p=>market==='all'||p.market===market),[market]);
  const current = providers.find(p=>p.id===selected);
  function choose(p){setSelected(p.id);setNotice(p.status==='public-data'?'ตัวเลือกนี้มี public market-data adapter เบื้องต้นเท่านั้น ยังไม่ได้เชื่อมบัญชีส่วนตัว':p.id==='exness'?'ยังไม่ได้ตรวจสอบสิทธิ์ Exness API ใน Personal Area; ยังไม่ถือว่าเชื่อมต่อแล้ว':'ยังไม่ได้ตั้งค่าและตรวจสอบ connector ของผู้ให้บริการนี้ จึงยังไม่สามารถยืนยันการเชื่อมต่อได้');}
  async function checkExnessReadiness(){
    setChecking(true);
    try {
      const response = await fetch('/api/broker/status?broker=exness',{method:'GET',cache:'no-store',headers:{Accept:'application/json'}});
      const data = await response.json();
      setNotice(data.detail || 'ยังตรวจสอบ API access ไม่ได้');
    } catch {
      setNotice('เรียกสถานะเตรียมเชื่อมต่อไม่สำเร็จ; ยังไม่มีการเชื่อมบัญชี Exness');
    } finally { setChecking(false); }
  }
  async function checkMt5CloudStatus(){
    setChecking(true);
    try {
      const response = await fetch('/api/broker/status?broker=mt5', { method:'GET', cache:'no-store', headers:{Accept:'application/json'} });
      const data = await response.json();
      setNotice(data.detail || (data.connected ? 'ได้รับ MT5 telemetry ล่าสุดผ่าน Cloudflare แล้ว แต่ยังปิดการส่งคำสั่งซื้อขาย' : 'Cloudflare API ตอบสนองแล้ว แต่ยังไม่มี MT5 telemetry ล่าสุด; ยังไม่ถือว่าเชื่อมต่อบัญชีสำเร็จ'));
    } catch {
      setNotice('ตรวจสถานะ MT5 ผ่าน Cloudflare ไม่สำเร็จ; ไม่มีการส่งคำสั่งซื้อขาย');
    } finally { setChecking(false); }
  }  return <main className="page"><style jsx>{`
    .page{min-height:100vh;background:#090d16;color:#edf2ff;padding:28px clamp(16px,4vw,52px) 60px;font-family:Inter,system-ui,sans-serif;background-image:radial-gradient(ellipse at 15% 0%,#6754d926,transparent 40%)}
    .wrap{max-width:1180px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:38px}.brand{font-weight:850;letter-spacing:.12em}.brand span{color:#a89bff}.back{color:#adb7cd;text-decoration:none;font-size:13px}
    .eyebrow{color:#a89bff;font-size:11px;font-weight:800;letter-spacing:.2em}.title{font-size:clamp(32px,5vw,48px);letter-spacing:-.045em;margin:12px 0}.sub{color:#9ca8bf;line-height:1.8;max-width:730px;font-size:14px}.pill{display:inline-flex;border:1px solid #315b50;background:#10251f;color:#8fe0c6;padding:9px 13px;border-radius:30px;font-size:12px;font-weight:750;margin-top:14px}
    .layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:18px;margin-top:28px}.panel{border:1px solid #252d40;border-radius:19px;background:#111724;padding:clamp(18px,3vw,27px)}h2{font-size:16px;margin:0 0 7px}.muted{font-size:12px;line-height:1.7;color:#94a0b8}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.filter{border:1px solid #30384e;border-radius:22px;background:#0c1220;color:#bac4d9;padding:9px 14px;cursor:pointer;font-size:12px}.filter.active{background:#292342;border-color:#9b8bff;color:#fff}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.provider{border:1px solid #2b344a;border-radius:14px;background:#0d1421;color:#eaf0ff;padding:15px;text-align:left;cursor:pointer;min-width:0}.provider.selected{border-color:#9787ff;background:#1b1b31;box-shadow:inset 0 0 0 1px #9787ff33}.provider strong{display:block;font-size:13px;margin-bottom:9px}.provider small{display:block;color:#a5b0c7;font-size:11px;line-height:1.6}.status{display:inline-block;font-size:9px;letter-spacing:.05em;color:#e6c17e;border:1px solid #5a4930;border-radius:20px;padding:5px 8px;margin-top:12px}.status.public{color:#8fe0c6;border-color:#315b50}
    .details{margin-top:18px;border-top:1px solid #2a3246;padding-top:18px}.detailrow{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #242d40;font-size:12px}.detailrow span{color:#96a2ba;text-align:right}.notice{margin-top:15px;border:1px solid #5a4930;background:#211b14;color:#e8c787;border-radius:12px;padding:13px;font-size:12px;line-height:1.75}.guard{margin-top:14px;border:1px solid #315b50;background:#10231f;color:#b7ebdc;border-radius:12px;padding:13px;font-size:12px;line-height:1.8}.list{padding-left:17px;color:#a6b0c6;font-size:12px;line-height:1.9}.foot{color:#75819b;font-size:11px;text-align:center;margin-top:25px;line-height:1.8}
    @media(max-width:820px){.layout{grid-template-columns:1fr}}@media(max-width:430px){.title{font-size:32px}.top{margin-bottom:25px}.cards{grid-template-columns:1fr 1fr}}
  `}</style>
  <div className="wrap">
    <header className="top"><div className="brand">VOOM SYSTEM <span>/ NOVA</span></div><Link className="back" href="/">← กลับ Dashboard</Link></header>
    <div className="eyebrow">BROKER HUB · READ-ONLY</div><h1 className="title">เชื่อมต่อโบรกเกอร์จากศูนย์กลาง</h1>
    <p className="sub">เลือกผู้ให้บริการ Forex, Crypto และหุ้น เพื่อเตรียมเชื่อมบัญชีผ่าน API หรือ OAuth ที่ได้รับอนุญาต ข้อมูลบัญชีส่วนตัวจะแสดงเมื่อ connector ผ่านการตั้งค่าและตรวจสอบจริงเท่านั้น</p>
    <div className="pill">● Read-only + AI Analysis · Live Trading ปิดอยู่</div>
    <div className="layout">
      <section className="panel"><h2>เลือกตลาดและผู้ให้บริการ</h2><p className="muted">รายการนี้เป็น Broker Registry ไม่ใช่หลักฐานว่าบัญชีใดเชื่อมต่อแล้ว</p>
        <div className="filters">{marketFilters.map(f=><button key={f.id} type="button" className={'filter '+(market===f.id?'active':'')} onClick={()=>setMarket(f.id)}>{f.label}</button>)}</div>
        <div className="cards">{visible.map(p=><button type="button" key={p.id} className={'provider '+(selected===p.id?'selected':'')} onClick={()=>choose(p)}><strong>{p.name}</strong><small>{p.kind} · {p.auth}</small><span className={'status '+(p.status==='public-data'?'public':'')}>{p.status==='public-data'?'PUBLIC DATA ADAPTER':'NOT CONFIGURED'}</span></button>)}</div>
        {current&&<div className="details"><h2>{current.name}</h2><p className="muted">{current.detail}</p><div className="detailrow"><b>ตลาด</b><span>{current.kind}</span></div><div className="detailrow"><b>วิธีเชื่อมต่อ</b><span>{current.auth}</span></div><div className="detailrow"><b>สถานะบัญชี</b><span>{current.id==='exness'?'API access ยังไม่ตรวจสอบ':'ยังไม่ได้ยืนยัน'}</span></div>{current.id==='exness'&&<button type="button" onClick={checkExnessReadiness} disabled={checking} style={{marginTop:14,padding:'10px 14px',borderRadius:10,border:'1px solid #7165b4',background:'#282342',color:'#fff',cursor:checking?'wait':'pointer'}}>{checking?'กำลังตรวจสถานะ…':'ตรวจสถานะขั้นเตรียมเชื่อมต่อ'}</button>}        {current.id==='mt5-bridge'&&<button type="button" onClick={checkMt5CloudStatus} disabled={checking} style={{marginTop:14,padding:'10px 14px',borderRadius:10,border:'1px solid #7165b4',background:'#282342',color:'#fff',cursor:checking?'wait':'pointer'}}>{checking?'กำลังตรวจสถานะ…':'ตรวจสถานะ MT5 ผ่าน Cloudflare'}</button>}<div className="notice" role="status" aria-live="polite">{notice||'เลือกผู้ให้บริการเพื่อดูสถานะการเตรียมเชื่อมต่อ'}</div></div>}
      </section>
      <aside className="panel"><h2>ขั้นตอนการเชื่อมต่อ</h2><p className="muted">เชื่อมต่อจริงจะเปิดใช้งานเป็นราย provider หลังผ่านการพัฒนาและทดสอบ</p>
        <ol className="list"><li>เลือก provider และตรวจสอบว่า API/OAuth รองรับบัญชีและประเทศของคุณ</li><li>ยืนยันตัวตนผ่าน flow ทางการของ provider หรือกำหนด read-only API key ในฝั่งเซิร์ฟเวอร์</li><li>ตรวจสอบสิทธิ์และดึงข้อมูลทดสอบโดยไม่ส่งคำสั่งซื้อขาย</li><li>บันทึกเฉพาะ metadata ของ connection ลง Supabase ภายใต้ RLS</li><li>ส่งข้อมูลตลาดที่ผ่าน validation ไปให้ AI Research และ Learning Universe</li></ol>
        <div className="guard"><b>ข้อกำหนดความปลอดภัย</b><br/>• ไม่กรอก API Secret หรือรหัสผ่านในหน้านี้<br/>• API key ต้องอ่านอย่างเดียวและปิดสิทธิ์ถอนเงิน<br/>• ไม่เก็บ token ใน browser storage หรือฐานข้อมูล metadata<br/>• ไม่มี endpoint ส่งคำสั่งซื้อขายใน Broker Hub รุ่นนี้</div>
        <div className="notice"><b>MT5:</b> ต้องมี terminal/bridge บน Windows หรือ VPS ที่แยกต่างหาก Cloudflare Workers ไม่สามารถรัน MT5 terminal ได้โดยตรง</div>
        <div className="foot">VOOM_SYSTEM · Broker Hub<br/>Connection status is only confirmed after a real provider-side verification.</div>
      </aside>
    </div>
  </div></main>;
}
