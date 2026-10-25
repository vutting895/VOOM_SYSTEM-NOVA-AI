'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function GenAIPage() {
  const [prompt, setPrompt] = useState('สร้างกลยุทธ์ตามแนวโน้ม มีตัวกรองความผันผวน และจำกัดความเสี่ยง');
  const [market, setMarket] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [risk, setRisk] = useState('medium');
  const [strategy, setStrategy] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function generate(e) {
    e.preventDefault(); setBusy(true); setError(''); setStrategy(null);
    try {
      const res = await fetch('/api/gen-ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, market, timeframe, risk }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างกลยุทธ์ไม่สำเร็จ');
      setStrategy(data.strategy);
    } catch (e) { setError(e.message || 'ไม่สามารถเรียกบริการได้'); }
    finally { setBusy(false); }
  }
  const panel = {background:'#111827',border:'1px solid #29354b',borderRadius:16,padding:22};
  const field = {width:'100%',background:'#0b1220',color:'#e5e7eb',border:'1px solid #344155',borderRadius:10,padding:'12px 13px',marginTop:7};
  return <main style={{maxWidth:1120,margin:'0 auto',padding:'30px 20px 60px',color:'#eef2ff'}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap',marginBottom:30}}><div><div style={{color:'#9eabff',fontSize:12,letterSpacing:3,fontWeight:800}}>VOOM SYSTEM / NOVA</div><h1 style={{fontSize:38,margin:'10px 0'}}>Gen AI Strategy Lab</h1><p style={{color:'#9caecb',margin:0}}>สร้างร่างกลยุทธ์จากเป้าหมาย เลือกตลาดและระดับความเสี่ยง แล้วส่งไปทดสอบย้อนหลัง</p></div><Link href="/" style={{color:'#b9c4dd'}}>← Dashboard</Link></header>
    <div style={{border:'1px solid #7b6035',background:'#2b2115',color:'#f4d39a',padding:14,borderRadius:12,marginBottom:20,fontSize:13,lineHeight:1.7}}><b>สถานะ: Strategy template engine</b><br/>ตอนนี้ใช้แม่แบบและกฎที่กำหนดไว้ ไม่ได้เรียก LLM ภายนอก และไม่สร้างคำสั่งซื้อขายจริง ผลลัพธ์ต้องผ่าน Backtest และ Risk Engine ก่อนนำไปใช้</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:18,alignItems:'start'}}>
      <form onSubmit={generate} style={panel}>
        <h2 style={{marginTop:0}}>กำหนดโจทย์กลยุทธ์</h2><label style={{display:'block',marginTop:18,fontSize:13}}>เป้าหมาย / คำอธิบาย<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={1200} required rows={5} style={{...field,resize:'vertical',lineHeight:1.6}} placeholder="เช่น กลยุทธ์ breakout ที่ใช้ volume ยืนยัน"/></label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:15}}><label style={{fontSize:13}}>Market<select value={market} onChange={e=>setMarket(e.target.value)} style={field}>{['BTC/USDT','ETH/USDT','EUR/USD','XAU/USD','US30'].map(x=><option key={x}>{x}</option>)}</select></label><label style={{fontSize:13}}>Timeframe<select value={timeframe} onChange={e=>setTimeframe(e.target.value)} style={field}>{['5m','15m','1h','4h','1d'].map(x=><option key={x}>{x}</option>)}</select></label></div>
        <label style={{display:'block',marginTop:15,fontSize:13}}>Risk profile<select value={risk} onChange={e=>setRisk(e.target.value)} style={field}><option value="low">Low — conservative</option><option value="medium">Medium</option><option value="high">High — aggressive template</option></select></label>
        <button disabled={busy} style={{width:'100%',marginTop:20,padding:14,border:0,borderRadius:10,background:'#8274f7',color:'white',fontWeight:800,cursor:'pointer'}}>{busy?'กำลังสร้าง…':'สร้าง Strategy Draft'}</button>
        {error&&<p role="alert" style={{color:'#ffaaa3',marginBottom:0}}>{error}</p>}
      </form>
      <section style={panel}><h2 style={{marginTop:0}}>ผลลัพธ์กลยุทธ์</h2>{!strategy?<div style={{color:'#9caecb',padding:'35px 0',lineHeight:1.8}}>กรอกโจทย์แล้วกดสร้าง ระบบจะแสดงกฎเข้าออก รายการ worker และข้อควรระวังที่ตรวจสอบได้</div>:<div>
        <div style={{display:'inline-block',fontSize:11,color:'#c7f9df',border:'1px solid #28634c',borderRadius:30,padding:'5px 10px'}}>DRAFT · NOT BACKTESTED</div><h3 style={{fontSize:24,marginBottom:6}}>{strategy.name}</h3><p style={{color:'#9caecb',fontSize:13}}>{strategy.market} · {strategy.timeframe} · Risk: {strategy.riskProfile}</p>
        <h3 style={{fontSize:14,marginTop:22}}>Entry workers</h3><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{strategy.entryWorkers.map(w=><span key={w} style={{background:'#202a40',border:'1px solid #35425d',padding:'7px 9px',borderRadius:8,fontSize:12}}>{w}</span>)}</div>
        <h3 style={{fontSize:14,marginTop:22}}>Exit template</h3><p>Take profit: <b>{strategy.exit.takeProfitPct}%</b> · Stop loss: <b>{strategy.exit.stopLossPct}%</b></p><p style={{color:'#bdc8df',lineHeight:1.7}}>{strategy.rationale}</p>
        <div style={{fontSize:12,color:'#f2d49b',background:'#2b2115',padding:12,borderRadius:9,lineHeight:1.7}}>{strategy.warning}</div>
        <button onClick={()=>navigator.clipboard?.writeText(JSON.stringify(strategy,null,2))} style={{marginTop:15,padding:'10px 13px',borderRadius:9,border:'1px solid #45516a',background:'#182236',color:'#e7edff',cursor:'pointer'}}>คัดลอก JSON</button> <Link href="/marketplace" style={{color:'#b9b1ff',marginLeft:12}}>ไป Marketplace →</Link>
      </div>}</section>
    </div>
    <p style={{color:'#7786a2',fontSize:12,marginTop:20}}>ทุก draft เริ่มต้นด้วย executionEnabled=false และไม่มีการส่งคำสั่งซื้อขาย</p>
  </main>;
}