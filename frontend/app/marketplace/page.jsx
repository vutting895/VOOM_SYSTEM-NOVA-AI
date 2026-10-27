'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const strategies = [
  { id: 'trend', name: 'Trend Following', category: 'Trend', risk: 'Medium', market: 'Multi-market', description: 'แม่แบบ EMA และตัวกรองโมเมนตัมเพื่อศึกษาแนวโน้ม', workers: ['EMATrendWorker', 'RSIWorker'], tags: ['EMA', 'RSI'] },
  { id: 'mean', name: 'Mean Reversion', category: 'Mean Reversion', risk: 'Medium–High', market: 'Multi-market', description: 'แม่แบบค้นหาการเบี่ยงเบนจากค่าเฉลี่ย พร้อมข้อควรระวังในตลาดที่มีแนวโน้มแรง', workers: ['RSIWorker', 'BollingerBandWorker'], tags: ['RSI', 'Bollinger'] },
  { id: 'breakout', name: 'Breakout Research', category: 'Breakout', risk: 'High', market: 'Crypto / Forex', description: 'โครงร่างเพื่อศึกษาการทะลุกรอบ โดยต้องตรวจ false breakout และต้นทุนธุรกรรม', workers: ['VolumeSpikeWorker', 'DonchianBreakoutWorker'], tags: ['Volume', 'Donchian'] },
  { id: 'volatility', name: 'Volatility Guard', category: 'Risk Control', risk: 'Low–Medium', market: 'Multi-market', description: 'แนวคิดใช้ ATR/ความผันผวนเป็นตัวกรอง ไม่ใช่ระบบรับประกันความเสี่ยง', workers: ['ATRVolatilityFilter', 'PortfolioExposureCheck'], tags: ['ATR', 'Risk'] },
  { id: 'correlation', name: 'Correlation Monitor', category: 'Research', risk: 'Research', market: 'Multi-asset', description: 'แม่แบบติดตามความสัมพันธ์สินทรัพย์ ยังไม่มีการยืนยันว่า GNN inference ทำงานจริง', workers: ['CorrelationFeatureWorker', 'PortfolioExposureCheck'], tags: ['Correlation', 'Portfolio'] }
];

export default function MarketplacePage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(null);
  const categories = ['All', 'Trend', 'Mean Reversion', 'Breakout', 'Risk Control', 'Research'];
  const filtered = useMemo(() => strategies.filter((item) =>
    (category === 'All' || item.category === category) &&
    (item.name + ' ' + item.description + ' ' + item.tags.join(' ')).toLowerCase().includes(query.toLowerCase())
  ), [category, query]);

  return (
    <main className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
          <h1 className="nova-title">Strategy Marketplace</h1>
          <p className="nova-subtitle">แค็ตตาล็อกแม่แบบเพื่อสำรวจและต่อยอดเป็น Strategy Draft</p>
        </div>
        <Link href="/" className="nova-link-button">← Dashboard</Link>
      </header>

      <section className="nova-notice">
        <strong>STARTER CATALOG · RESEARCH ONLY</strong>
        <p>รายการทั้งหมดเป็นแม่แบบตัวอย่างภายใน ไม่มีผลกำไร, win rate, Sharpe, Profit Factor หรือคะแนนผ่าน Gate ที่คำนวณจากผลจริงในหน้านี้ จึงไม่แสดงตัวเลขดังกล่าวและไม่มีปุ่ม Deploy หรือส่งคำสั่งซื้อขาย</p>
      </section>

      <section className="nova-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(160px, 230px)', gap: 12, marginBottom: 18 }}>
        <input className="nova-input" aria-label="ค้นหากลยุทธ์" placeholder="ค้นหากลยุทธ์หรือ tag…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="nova-select" aria-label="ประเภทกลยุทธ์" value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </section>

      <section className="nova-catalogue">
        {filtered.map((item) => (
          <article className="nova-card" key={item.id}>
            <span className="nova-pill">{item.category}</span>
            <h2 style={{ marginTop: 14 }}>{item.name}</h2>
            <p>{item.description}</p>
            <div className="nova-tags">{item.tags.map((tag) => <span className="nova-tag" key={tag}>{tag}</span>)}</div>
            <div className="nova-divider" />
            <p className="nova-small">Market: {item.market}<br />Risk profile: {item.risk}</p>
            <button className="nova-button" type="button" onClick={() => setSelected(item)}>ดูรายละเอียด</button>
          </article>
        ))}
      </section>
      {!filtered.length && <p className="nova-empty">ไม่พบกลยุทธ์ที่ตรงกับคำค้น</p>}

      {selected && (
        <div role="dialog" aria-modal="true" aria-label={selected.name} style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, .85)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 20 }}>
          <section className="nova-panel" style={{ width: 'min(560px, 100%)', maxHeight: '85vh', overflow: 'auto' }}>
            <header className="nova-header" style={{ marginBottom: 14 }}>
              <div><span className="nova-pill">RESEARCH TEMPLATE</span><h2 style={{ marginTop: 12 }}>{selected.name}</h2></div>
              <button className="nova-button" type="button" onClick={() => setSelected(null)} aria-label="ปิดรายละเอียด">ปิด</button>
            </header>
            <p>{selected.description}</p>
            <p className="nova-small">Workers / concepts: {selected.workers.join(' · ')}</p>
            <div className="nova-notice"><strong>ยังไม่พร้อม Deploy</strong><p>แม่แบบนี้ยังไม่มีผล Backtest ที่ผ่านการตรวจสอบในหน้านี้ ให้สร้าง Draft แล้วประเมินต้นทุน, out-of-sample และ Risk Engine ก่อนเท่านั้น</p></div>
            <Link className="nova-link-button nova-button-primary" href="/gen-ai">ไปสร้าง Strategy Draft →</Link>
          </section>
        </div>
      )}

      <footer className="nova-footer">จำนวนแม่แบบที่แสดง: {filtered.length} · ไม่มีข้อมูล performance ที่ยืนยันแล้ว · Live execution: OFF</footer>
    </main>
  );
}