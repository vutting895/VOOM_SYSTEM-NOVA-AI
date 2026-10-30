'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';

const learningModules = [
  'Supervised XGBoost', 'Unsupervised KMeans', 'CNN Vision / MAE', 'GNN Correlation',
  'Mamba Long-Context', 'Diffusion Research', 'Neuro-symbolic Rules', 'VLM Analysis',
  'Continual Learning / EWC', 'World Model / JEPA', 'Agentic Self-play', 'Federated Learning',
  'RL / PPO Research', 'Gen AI Strategy', 'Backtest Engine', 'Optuna Tuning'
];

export default function GenAIPage() {
  const [prompt, setPrompt] = useState('ศึกษาแนวทาง EMA และ RSI สำหรับ XAU/USD โดยจำกัดความเสี่ยงและระบุเงื่อนไขยกเลิกสัญญาณ');
  const [market, setMarket] = useState('XAU/USD');
  const [timeframe, setTimeframe] = useState('1h');
  const [risk, setRisk] = useState('low');
  const [strategy, setStrategy] = useState(null);
  const [provider, setProvider] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function generate(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setStrategy(null);
    setProvider('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับหน้าเว็บ');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        window.location.assign('/login');
        return;
      }
      const response = await fetch('/api/gen-ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ prompt, market, timeframe, risk })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'สร้างร่างกลยุทธ์ไม่สำเร็จ');
      if (!data.strategy) throw new Error('API ไม่ได้ส่งข้อมูล strategy กลับมา');
      setStrategy(data.strategy);
      setProvider(data.llm?.available && data.llm?.provider === 'gemini' ? 'Google Gemini' : data.llm?.available && data.llm?.provider === 'cloudflare-workers-ai' ? 'Cloudflare Workers AI' : 'Rule-based fallback');
    } catch (err) {
      setError(err.message || 'ไม่สามารถเรียกบริการสร้างกลยุทธ์ได้');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
          <h1 className="nova-title">Gen AI Strategy Lab</h1>
          <p className="nova-subtitle">สร้างร่างกลยุทธ์สำหรับการวิจัย ตรวจสอบผลลัพธ์ และส่งต่อไป Backtest ในขั้นตอนที่รองรับ</p>
        </div>
        <Link href="/" className="nova-link-button">← Dashboard</Link>
      </header>

      <section className="nova-notice">
        <strong>RESEARCH ONLY · NO ORDER EXECUTION</strong>
        <p>API นี้ส่งคืนร่างกลยุทธ์เท่านั้น ผลลัพธ์ยังไม่ผ่าน Backtest หรือ Risk Engine และไม่ใช่คำแนะนำให้ซื้อขายจริง โมดูล Learning Universe 16 ที่แสดงด้านล่างเป็นรายการแนวคิด ไม่ใช่การยืนยันว่าแต่ละ worker กำลังรันออนไลน์</p>
      </section>

      <section className="nova-grid">
        <form className="nova-panel" onSubmit={generate}>
          <h2>กำหนดโจทย์กลยุทธ์</h2>
          <label className="nova-label">เป้าหมาย / คำอธิบาย
            <textarea className="nova-textarea" required maxLength={1200} rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="เช่น กลยุทธ์ breakout พร้อมตัวกรอง volume และ volatility" />
          </label>
          <div className="nova-form-grid">
            <label className="nova-label">Market
              <select className="nova-select" value={market} onChange={(event) => setMarket(event.target.value)}>
                {['BTC/USDT', 'ETH/USDT', 'EUR/USD', 'XAU/USD', 'US30'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="nova-label">Timeframe
              <select className="nova-select" value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
                {['5m', '15m', '1h', '4h', '1d'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <label className="nova-label">Risk profile
            <select className="nova-select" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="low">Low — conservative template</option>
              <option value="medium">Medium</option>
              <option value="high">High — research only</option>
            </select>
          </label>
          <button className="nova-button nova-button-primary" type="submit" disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้าง Strategy Draft'}</button>
          {error && <p role="alert" style={{ color: '#ffaaa3' }}>{error}</p>}
        </form>

        <section className="nova-panel" aria-live="polite">
          <h2>ผลลัพธ์กลยุทธ์</h2>
          {!strategy ? (
            <div className="nova-empty">กรอกโจทย์แล้วกดสร้าง ระบบจะเรียก Google Gemini ผ่าน NOVA AI Worker เป็นหลัก และใช้ Cloudflare Workers AI เป็นตัวสำรองหลังตรวจ session หาก AI ทั้งสองไม่พร้อมจะแสดง rule-based fallback พร้อมป้ายกำกับ</div>
          ) : (
            <div>
              <span className="nova-pill">DRAFT · NOT BACKTESTED</span>
              <h2 style={{ marginTop: 16 }}>{strategy.name}</h2>
              <p>{strategy.market} · {strategy.timeframe} · Risk: {strategy.riskProfile}</p>
              <p className="nova-small">แหล่งผลลัพธ์: {provider || strategy.source || 'API'} · สถานะ: {strategy.status || 'draft'}</p>
              <div className="nova-divider" />
              <strong>Entry workers</strong>
              <div className="nova-tags">{(strategy.entryWorkers || []).map((worker) => <span className="nova-tag" key={worker}>{worker}</span>)}</div>
              <p>Take profit template: <b>{strategy.exit?.takeProfitPct ?? '—'}%</b></p>
              <p>Stop loss template: <b>{strategy.exit?.stopLossPct ?? '—'}%</b></p>
              <p>{strategy.rationale || 'API ไม่ได้ให้เหตุผลประกอบ'}</p>
              <div className="nova-notice"><strong>ข้อควรระวัง</strong><p>{strategy.warning || 'ยังไม่ผ่าน Backtest หรือ Risk Engine และห้ามใช้เป็นคำสั่งซื้อขาย'}</p></div>
              <button className="nova-button" type="button" onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(JSON.stringify(strategy, null, 2)).catch(() => setError('ไม่สามารถคัดลอกข้อมูลไปยัง clipboard ได้'));
                } else {
                  setError('เบราว์เซอร์นี้ไม่รองรับการคัดลอกอัตโนมัติ');
                }
              }}>คัดลอก Draft JSON</button>
            </div>
          )}
        </section>
      </section>

      <section className="nova-panel" style={{ marginTop: 18 }}>
        <h2>Learning Universe 16 · รายการโมดูล</h2>
        <p>รายการเพื่อจัดหมวดการพัฒนา ไม่ได้หมายความว่าทุกโมดูลถูก deploy หรือทำงานอัตโนมัติ</p>
        <div className="nova-worker-grid">
          {learningModules.map((module, index) => <div className="nova-worker" key={module}><strong>{index + 1}. {module}</strong><small>สถานะ runtime: ยังไม่ยืนยัน</small></div>)}
        </div>
        <div className="nova-notice" style={{ marginBottom: 0 }}><strong>Auto-Learning Loop</strong><p>ควรเปิดวงจรเรียนรู้อัตโนมัติหลังมีข้อมูล Backtest ที่ทำซ้ำได้, guardrails, การประเมิน out-of-sample และการอนุมัติที่ตรวจสอบย้อนกลับได้เท่านั้น</p></div>
      </section>

      <footer className="nova-footer">API: /api/gen-ai/generate → Google Gemini · Cloudflare Workers AI backup · Draft only · Live Trading OFF</footer>
    </main>
  );
}