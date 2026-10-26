import Link from "next/link";

const services = [
  ["Data Ingestion","data-ingestion","รับและตรวจสอบข้อมูลต้นทาง"],
  ["Feature Engineering","feature","สร้างคุณลักษณะสำหรับโมเดล"],
  ["Gen AI Strategy Lab","gen-ai","สร้างร่างกลยุทธ์จาก prompt และแม่แบบ"],
  ["Strategy Marketplace","marketplace","สำรวจและค้นหาแม่แบบกลยุทธ์"],
  ["Backtest","backtest","ทดสอบย้อนหลังพร้อมต้นทุน"],
  ["Tuning","tuning","ปรับพารามิเตอร์โดยแยกชุดทดสอบ"],
  ["Risk","risk","ตรวจความเสี่ยงก่อนส่งคำสั่ง"],
  ["Portfolio","portfolio","จัดการ exposure และ allocation"],
  ["Execution","execution","ปิดใช้งานไว้จนกว่าจะผ่านการอนุมัติ"]
];

export default function Home() {
  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">VOOM SYSTEM / NOVA</p><h1>AI Trading Platform</h1><p className="muted">แพลตฟอร์มวิเคราะห์กลยุทธ์แบบแยกบริการ</p></div><div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><Link href="/login" style={{color:"#eaf0ff",border:"1px solid #35425d",padding:"9px 12px",borderRadius:9,textDecoration:"none",fontSize:13}}>เข้าสู่ระบบ</Link><Link href="/profile" style={{color:"#eaf0ff",border:"1px solid #35425d",padding:"9px 12px",borderRadius:9,textDecoration:"none",fontSize:13}}>โปรไฟล์</Link><span className="status">LIVE TRADING OFF</span></div></header>
    <section className="notice"><strong>สถานะ: DEVELOPMENT / PAPER-FIRST</strong><p>Gen AI ใช้ rule-based strategy templates ในขณะนี้ ยังไม่ได้เชื่อม LLM provider ภายนอก และกลยุทธ์ต้องผ่าน Backtest กับ Risk Engine ก่อนใช้งานจริง</p></section>
    <nav style={{display:"flex",gap:12,flexWrap:"wrap",margin:"0 0 24px"}}><Link href="/login" style={{background:"#8274f7",color:"white",padding:"12px 16px",borderRadius:10,textDecoration:"none",fontWeight:800}}>เข้าสู่ระบบ / สมัครสมาชิก →</Link><Link href="/gen-ai" style={{background:"#182236",border:"1px solid #35425d",color:"#eaf0ff",padding:"12px 16px",borderRadius:10,textDecoration:"none",fontWeight:700}}>เปิด Gen AI Strategy Lab →</Link><Link href="/marketplace" style={{background:"#182236",border:"1px solid #35425d",color:"#eaf0ff",padding:"12px 16px",borderRadius:10,textDecoration:"none",fontWeight:700}}>เปิด Strategy Marketplace →</Link><Link href="/broker" style={{background:"#182236",border:"1px solid #35425d",color:"#eaf0ff",padding:"12px 16px",borderRadius:10,textDecoration:"none",fontWeight:700}}>Broker Connection →</Link></nav>
    <section className="grid">{services.map(([name,id,description])=><article className="service" key={id}><div className="service-head"><h2>{name}</h2><span className={id==="execution"?"pill disabled":(id==="gen-ai"||id==="marketplace"?"pill":"pill")}>{id==="execution"?"DISABLED":(id==="gen-ai"||id==="marketplace"?"AVAILABLE":"PLANNED")}</span></div><p>{description}</p>{id==="gen-ai"?<Link href="/gen-ai">เปิด Strategy Lab →</Link>:id==="marketplace"?<Link href="/marketplace">เปิด Marketplace →</Link>:<code>workers/{id}</code>}</article>)}</section>
    <footer>Project: voom_system_nova · Architecture: nova · Execution authority: none</footer>
  </main>;
}