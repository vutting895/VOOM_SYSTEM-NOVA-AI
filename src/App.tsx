import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import ConnectPage from './pages/ConnectPage';

const navigation = [
  { label: 'OVERVIEW', href: '/', code: '01' },
  { label: 'MARKETS', href: '/markets', code: '02' },
  { label: 'AI ANALYSIS', href: '/gen-ai', code: '03' },
  { label: 'BROKER HUB', href: '/broker', code: '04' },
  { label: 'LEARNING UNIVERSE 16', href: '/learning-universe', code: '05' },
  { label: 'MARKETPLACE', href: '/marketplace', code: '06' },
  { label: 'AI CHAT', href: '/chat', code: '07' },
  { label: 'VIDEO WORKSPACE', href: '/video', code: '08' },
  { label: 'BACKTEST', href: '/backtest', code: '09' },
  { label: 'SECURE CONNECT', href: '/connect', code: '10' },
];

const watchlist = [
  { symbol: 'EUR / USD', market: 'FOREX', note: 'Awaiting verified feed' },
  { symbol: 'BTC / USD', market: 'CRYPTO', note: 'Awaiting verified feed' },
  { symbol: 'XAU / USD', market: 'METALS', note: 'Awaiting verified feed' },
  { symbol: 'SPX 500', market: 'INDEX', note: 'Awaiting verified feed' },
];

const modules = [
  { name: 'AI CHAT', detail: 'Conversational research assistant', href: '/chat', icon: '✦' },
  { name: 'AI ANALYSIS', detail: 'Strategy research and explainable insights', href: '/gen-ai', icon: '◈' },
  { name: 'BROKER HUB', detail: 'Connection status and account access', href: '/broker', icon: '⌘' },
  { name: 'LEARNING UNIVERSE 16', detail: 'Learning modules and feedback loop', href: '/learning-universe', icon: '◎' },
  { name: 'STRATEGY MARKETPLACE', detail: 'Explore strategy templates', href: '/marketplace', icon: '▦' },
  { name: 'GEN-AI VIDEO', detail: 'Video generation jobs & workspace', href: '/video', icon: '▤' },
  { name: 'BACKTEST ENGINE', detail: 'Test strategy parameters', href: '/backtest', icon: '⌖' },
];

function Orb() {
  return (
    <div className="jarvis-orb-wrap" aria-label="NOVA AI visual indicator">
      <div className="orb-ring orb-ring-a" />
      <div className="orb-ring orb-ring-b" />
      <div className="orb-ring orb-ring-c" />
      <div className="orb-cross orb-cross-x" />
      <div className="orb-cross orb-cross-y" />
      <div className="orb-core"><span>N</span></div>
      <span className="orb-point orb-point-one" />
      <span className="orb-point orb-point-two" />
      <span className="orb-point orb-point-three" />
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="chart-placeholder">
      <div className="chart-grid" />
      <svg viewBox="0 0 700 190" role="img" aria-label="Illustrative chart graphic, not live market data" preserveAspectRatio="none">
        <defs>
          <linearGradient id="novaChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#48e4ed" stopOpacity=".25" />
            <stop offset="100%" stopColor="#48e4ed" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 150 L38 140 L64 151 L94 115 L123 127 L151 94 L180 107 L209 75 L238 90 L265 63 L297 82 L328 48 L356 70 L389 60 L418 83 L451 42 L481 58 L512 31 L545 50 L576 24 L604 44 L636 18 L666 35 L700 10 L700 190 L0 190 Z" fill="url(#novaChartFill)" />
        <path d="M0 150 L38 140 L64 151 L94 115 L123 127 L151 94 L180 107 L209 75 L238 90 L265 63 L297 82 L328 48 L356 70 L389 60 L418 83 L451 42 L481 58 L512 31 L545 50 L576 24 L604 44 L636 18 L666 35 L700 10" fill="none" stroke="#57e5ee" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-watermark">ILLUSTRATIVE VIEW · NO LIVE FEED CONFIRMED</div>
    </div>
  );
}

// Layout wrapper with Jarvis sidebar
function JarvisLayout() {
  const location = useLocation();

  return (
    <div className="jarvis-layout">
      <aside className="jarvis-sidebar">
        <Link className="jarvis-brand" to="/" aria-label="VOOM NOVA home">
          <span className="brand-emblem">V<span>✦</span></span>
          <span><strong>VOOM<span> / NOVA</span></strong><small>INTELLIGENCE SYSTEMS</small></span>
        </Link>
        <div className="side-section-label">COMMAND DECK</div>
        <nav className="jarvis-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link className={active ? 'jarvis-nav-link active' : 'jarvis-nav-link'} to={item.href} key={item.label}>
                <span className="nav-code">{item.code}</span><span>{item.label}</span>{active && <span className="nav-active-dot" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-section-label">SECURITY PROTOCOL</div>
          <div className="security-card"><span className="security-led" /><div><strong>READ-ONLY MODE</strong><small>Order execution locked</small></div><span className="lock-icon">⌑</span></div>
          <Link className="profile-link" to="/profile"><span className="profile-avatar">U</span><span><strong>USER ACCESS</strong><small>Login / Profile</small></span><span className="profile-arrow">↗</span></Link>
        </div>
      </aside>

      <section className="jarvis-main">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/broker" element={<BrokerPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/gen-ai" element={<GenAIPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/learning-universe" element={<LearningUniversePage />} />
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/video" element={<VideoPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </section>
    </div>
  );
}

function OverviewPage() {
  const [brokerStatus, setBrokerStatus] = useState('CHECKING');
  const [brokerDetail, setBrokerDetail] = useState('Checking the broker status endpoint…');

  useEffect(() => {
    let active = true;
    fetch('/api/broker/status?broker=mt5', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        setBrokerStatus(data.accountConnected ? 'REPORTED CONNECTED' : 'NOT VERIFIED');
        setBrokerDetail(data.detail || 'Verified Exness MT5 Demo endpoint.');
      })
      .catch(() => {
        if (active) {
          setBrokerStatus('STATUS UNAVAILABLE');
          setBrokerDetail('The broker status API did not respond.');
        }
      });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <header className="command-header">
        <div><div className="eyebrow"><span className="eyebrow-line" /> NOVA INTELLIGENCE / SYSTEM OVERVIEW</div><h1>Command <span>Center</span></h1><p>Market intelligence. Strategy research. Risk-aware decisions.</p></div>
        <div className="header-right"><span className="system-clock-label">SYSTEM MODE</span><span className="live-off-pill"><i /> LIVE TRADING OFF</span><Link className="header-profile" to="/login" aria-label="Login and profile">↗</Link></div>
      </header>

      <div className="system-strip"><span className="strip-icon">◈</span><span><strong>SAFE MODE ACTIVE</strong><small>Read-only + AI Analysis · No trade orders will be sent from this dashboard.</small></span><span className="strip-right">PROTOCOL 01 <b>●</b></span></div>

      <div className="command-grid">
        <section className="hud-panel ai-core-panel">
          <div className="panel-heading"><span><i className="panel-marker" /> NOVA AI CORE</span><span className="panel-code">CORE / 001</span></div>
          <div className="ai-core-content"><Orb /><div className="core-copy"><span className="micro-label">INTELLIGENCE ENGINE</span><h2>Ready to <em>analyze.</em></h2><p>Use AI research tools to review strategies and market context. No verified live market feed is displayed here.</p><Link className="hud-button" to="/chat">OPEN NOVA AI CHAT <span>↗</span></Link></div></div>
          <div className="core-foot"><span><i className="tiny-led" /> UI ONLINE</span><span>AI PROVIDER READY</span></div>
        </section>

        <section className="hud-panel broker-panel">
          <div className="panel-heading"><span><i className="panel-marker" /> BROKER LINK</span><span className="panel-code">LINK / 004</span></div>
          <div className="broker-name-row"><div className="broker-monogram">XM</div><div><h2>Exness / MetaTrader 5 Demo</h2><p>Broker connection monitor</p></div></div>
          <div className="broker-state"><span className="state-ring" /><div><strong>{brokerStatus}</strong><small>{brokerDetail}</small></div></div>
          <div className="read-only-row"><span>ACCESS SCOPE</span><strong>READ-ONLY</strong></div>
          <Link className="panel-text-link" to="/broker">OPEN BROKER HUB <span>→</span></Link>
        </section>

        <section className="hud-panel market-panel">
          <div className="panel-heading"><span><i className="panel-marker" /> MARKET TELEMETRY</span><span className="panel-code">DATA / 002</span></div>
          <div className="market-title-row"><div><h2>Market overview</h2><p>Multi-asset intelligence feed</p></div><span className="unverified-tag"><i /> FEED UNVERIFIED</span></div>
          <ChartPlaceholder />
          <div className="watchlist">
            {watchlist.map((item) => <div className="watch-row" key={item.symbol}><span className="watch-symbol">{item.symbol}</span><span className="watch-market">{item.market}</span><span className="watch-note">{item.note}</span></div>)}
          </div>
          <Link className="panel-text-link" to="/markets">OPEN MARKETS <span>→</span></Link>
        </section>

        <section className="hud-panel risk-panel">
          <div className="panel-heading"><span><i className="panel-marker" /> RISK &amp; EXECUTION GUARD</span><span className="panel-code">SAFE / 003</span></div>
          <div className="guard-visual"><div className="guard-icon">⌑</div><div><span className="micro-label">ORDER ROUTING</span><h2>LOCKED</h2><p>Live execution is disabled by design.</p></div><div className="guard-seal">OFF</div></div>
          <div className="guard-list"><div><span>Live order submission</span><strong className="state-off">DISABLED</strong></div><div><span>Verified portfolio values</span><strong>NOT AVAILABLE</strong></div><div><span>Risk engine status</span><strong>REQUIRES VALIDATION</strong></div></div>
          <div className="risk-note">No real balances, returns, or account metrics are shown until a trusted source is connected and verified.</div>
        </section>
      </div>

      <section className="modules-section">
        <div className="section-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> SYSTEM MODULES</div><h2>Intelligence <span>Modules</span></h2></div><span className="panel-code">MODULES / 07</span></div>
        <div className="module-grid">{modules.map((module, i) => <Link className="module-card" to={module.href} key={module.name}><span className="module-icon">{module.icon}</span><span className="module-number">0{i + 1}</span><h3>{module.name}</h3><p>{module.detail}</p><span className="module-open">ACCESS MODULE ↗</span></Link>)}</div>
      </section>

      <footer className="jarvis-footer"><span>VOOM_SYSTEM <b>·</b> NOVA AI</span><span>INTERFACE CONCEPT / VERIFIED DATA ONLY</span><span>LIVE TRADING <strong>OFF</strong></span></footer>
    </div>
  );
}

function ChatPage() {
  const listRef = useRef(null);
  const [messages, setMessages] = useState([
    { id: '1', role: 'assistant', content: 'สวัสดีครับ ผมคือ NOVA Research Assistant ช่วยอธิบายแนวคิดตลาด กลยุทธ์ และการจัดการความเสี่ยงได้' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const suggestions = [
    'อธิบายเงื่อนไข EMA 12/26 และ RSI 14 สำหรับ XAU/USD',
    'ช่วยตรวจความเสี่ยงและเงื่อนไขยกเลิกสมมติฐานกลยุทธ์',
    'อธิบายว่าควรตรวจอะไรบ้างก่อนเชื่อผล Backtest',
  ];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function sendMessage(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setInput('');
    setError('');
    setBusy(true);
    const userMsg = { id: crypto.randomUUID(), role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ส่งคำถามไม่สำเร็จ');
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.message }]);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ AI');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">NOVA INTELLIGENCE / CONVERSATION</p>
          <h1 className="nova-title">NOVA AI Chat</h1>
          <p className="nova-subtitle">ผู้ช่วยวิจัยตลาดและกลยุทธ์ภายใน VOOM SYSTEM — ปลอดภัยและไม่มีการส่งคำสั่งซื้อขาย</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>

      <section className="nova-panel" style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--nova-line)', paddingBottom: '12px', marginBottom: '14px' }}>
          <div><strong>RESEARCH ASSISTANT</strong><div className="nova-small">อ่านและตอบคำถามเชิงวิจัยตลาด</div></div>
          <button type="button" className="nova-button" onClick={() => setMessages([{ id: '1', role: 'assistant', content: 'ล้างบทสนทนาแล้ว พร้อมเริ่มคำถามใหม่ครับ' }])}>ล้างแชท</button>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '6px' }}>
          {messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{ background: m.role === 'user' ? '#1d3557' : '#0c2a3a', border: '1px solid var(--nova-line)', borderRadius: '12px', padding: '12px 16px' }}>
                <div style={{ fontSize: '10px', color: 'var(--nova-cyan)', marginBottom: '4px', fontWeight: 800 }}>{m.role === 'user' ? 'YOU' : 'NOVA AI'}</div>
                <p style={{ margin: 0, color: 'var(--nova-text)', fontSize: '13px', lineHeight: '1.6' }}>{m.content}</p>
              </div>
            </div>
          ))}
          {busy && <div className="nova-small" style={{ color: 'var(--nova-cyan)' }}>NOVA กำลังคิด…</div>}
        </div>

        {error && <div className="nova-notice" style={{ marginTop: '10px' }}>{error}</div>}

        <form onSubmit={sendMessage} style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
          <input className="nova-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="พิมพ์คำถามเกี่ยวกับกลยุทธ์หรือตลาด..." />
          <button className="nova-button nova-button-primary" type="submit" disabled={busy || !input.trim()}>ส่ง</button>
        </form>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          {suggestions.map((s) => (
            <button key={s} type="button" className="nova-tag" style={{ border: '0', cursor: 'pointer' }} onClick={() => setInput(s)}>{s}</button>
          ))}
        </div>
      </section>
    </div>
  );
}

function BrokerPage() {
  const [broker, setBroker] = useState('mt5');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  async function checkBroker(e) {
    e.preventDefault();
    setChecking(true);
    setMessage('กำลังตรวจสอบสถานะการเชื่อมต่อ...');
    try {
      const res = await fetch(`/api/broker/status?broker=${broker}`, { cache: 'no-store' });
      const data = await res.json();
      setMessage(data.detail || 'เชื่อมต่อเรียบร้อย (Read-only)');
    } catch {
      setMessage('ไม่สามารถติดต่อเซิร์ฟเวอร์ตรวจสอบโบรกเกอร์ได้');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">BROKER HUB / CONFIGURATION</p>
          <h1 className="nova-title">Broker Connection Hub</h1>
          <p className="nova-subtitle">จัดการการเชื่อมต่อโบรกเกอร์แบบ Read-only และตรวจสอบสถานะ Terminal Bridge</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
        <Link to="/connect" className="nova-link-button">Secure QR Connect</Link>
      </header>

      <section className="nova-grid">
        <form className="nova-panel" onSubmit={checkBroker}>
          <h2>ผู้ให้บริการ Exness MT5 / Crypto</h2>
          <div className="nova-form-grid" style={{ marginTop: '14px' }}>
            {['mt5', 'binance', 'bybit', 'okx'].map((b) => (
              <button key={b} type="button" className={`nova-button ${broker === b ? 'nova-button-primary' : ''}`} onClick={() => setBroker(b)}>
                {b.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="nova-notice" style={{ marginTop: '16px' }}>
            <strong>READ-ONLY ACCESS</strong>
            <p>ระบบจะตรวจสอบสถานะการเชื่อมต่อผ่าน System Integration Hub โดยไม่มีการส่งคำสั่งซื้อขายหรือเปิดพอร์ตอัตโนมัติ</p>
          </div>
          <button className="nova-button nova-button-primary" type="submit" disabled={checking} style={{ marginTop: '16px', width: '100%' }}>
            {checking ? 'กำลังตรวจสอบ…' : `ตรวจสอบสถานะ ${broker.toUpperCase()}`}
          </button>
          {message && <div className="nova-message" style={{ marginTop: '12px', padding: '10px', background: 'rgba(98,230,243,0.1)', border: '1px solid var(--nova-line)', borderRadius: '8px', fontSize: '12px' }}>{message}</div>}
        </form>

        <section className="nova-panel">
          <h2>สถานะความปลอดภัย</h2>
          <ul className="nova-list" style={{ marginTop: '12px' }}>
            <li><b>API Secret Management</b> · เก็บข้อมูลด้วยความปลอดภัยสูงสุด</li>
            <li><b>Tenant Isolation</b> · แยกสิทธิ์การเข้าถึงรายบัญชี</li>
            <li><b>Live Trading Guard</b> · ปิดการส่งคำสั่งอัตโนมัติโดยสมบูรณ์</li>
          </ul>
        </section>
      </section>
    </div>
  );
}

function GenAIPage() {
  const [prompt, setPrompt] = useState('ศึกษาแนวทาง EMA และ RSI สำหรับ XAU/USD');
  const [market, setMarket] = useState('XAU/USD');
  const [timeframe, setTimeframe] = useState('1h');
  const [risk, setRisk] = useState('medium');
  const [strategy, setStrategy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStrategy(null);
    try {
      const res = await fetch('/api/gen-ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, market, timeframe, risk })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างร่างกลยุทธ์ไม่สำเร็จ');
      setStrategy(data.strategy);
    } catch (err) {
      setError(err.message || 'ไม่สามารถเรียกบริการสร้างกลยุทธ์ได้');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
          <h1 className="nova-title">Gen AI Strategy Lab</h1>
          <p className="nova-subtitle">สร้างร่างกลยุทธ์สำหรับการวิจัย ตรวจสอบผลลัพธ์ และศึกษาโมเดล AI Worker</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>

      <section className="nova-grid">
        <form className="nova-panel" onSubmit={generate}>
          <h2>กำหนดโจทย์กลยุทธ์</h2>
          <label className="nova-label">โจทย์วิจัย
            <textarea className="nova-textarea" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
          </label>
          <div className="nova-form-grid">
            <label className="nova-label">Market
              <select className="nova-select" value={market} onChange={(e) => setMarket(e.target.value)}>
                {['BTC/USDT', 'ETH/USDT', 'EUR/USD', 'XAU/USD', 'US30'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="nova-label">Timeframe
              <select className="nova-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {['5m', '15m', '1h', '4h', '1d'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <button className="nova-button nova-button-primary" type="submit" disabled={busy} style={{ marginTop: '16px' }}>
            {busy ? 'กำลังสร้าง…' : 'สร้าง Strategy Draft'}
          </button>
          {error && <p style={{ color: '#ffaaa3', marginTop: '10px' }}>{error}</p>}
        </form>

        <section className="nova-panel">
          <h2>ผลลัพธ์ Strategy Draft</h2>
          {!strategy ? (
            <div className="nova-empty">กรอกโจทย์แล้วกดสร้าง ระบบจะประมวลผลผ่าน AI Worker</div>
          ) : (
            <div>
              <span className="nova-pill">DRAFT · RESEARCH ONLY</span>
              <h2 style={{ marginTop: '12px' }}>{strategy.name}</h2>
              <p>{strategy.market} · {strategy.timeframe} · Risk: {strategy.riskProfile}</p>
              <p>{strategy.rationale}</p>
              <div className="nova-notice" style={{ marginTop: '12px' }}><strong>ข้อควรระวัง</strong><p>{strategy.warning}</p></div>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function MarketplacePage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const strategies = [
    { id: 'trend', name: 'Trend Following', category: 'Trend', risk: 'Medium', description: 'แม่แบบ EMA และตัวกรองโมเมนตัม' },
    { id: 'mean', name: 'Mean Reversion', category: 'Mean Reversion', risk: 'Medium–High', description: 'แม่แบบค้นหาการเบี่ยงเบนจากค่าเฉลี่ย' },
    { id: 'breakout', name: 'Breakout Research', category: 'Breakout', risk: 'High', description: 'โครงร่างเพื่อศึกษาการทะลุกรอบ' }
  ];
  const filtered = useMemo(() => strategies.filter(s => s.name.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
          <h1 className="nova-title">Strategy Marketplace</h1>
          <p className="nova-subtitle">แค็ตตาล็อกแม่แบบเพื่อสำรวจและต่อยอดเป็น Strategy Draft</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>

      <section className="nova-panel" style={{ marginBottom: '16px' }}>
        <input className="nova-input" placeholder="ค้นหากลยุทธ์..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </section>

      <div className="nova-catalogue">
        {filtered.map((s) => (
          <article className="nova-card" key={s.id}>
            <span className="nova-pill">{s.category}</span>
            <h2 style={{ marginTop: '12px' }}>{s.name}</h2>
            <p>{s.description}</p>
            <button className="nova-button" type="button" onClick={() => setSelected(s)} style={{ marginTop: '12px' }}>ดูรายละเอียด</button>
          </article>
        ))}
      </div>

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'grid', placeItems: 'center', padding: '16px' }}>
          <section className="nova-panel" style={{ width: '400px' }}>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <button className="nova-button" type="button" onClick={() => setSelected(null)} style={{ marginTop: '16px' }}>ปิด</button>
          </section>
        </div>
      )}
    </div>
  );
}

function LearningUniversePage() {
  const modules = [
    'Supervised XGBoost', 'Unsupervised KMeans', 'CNN Vision / MAE', 'GNN Correlation',
    'Mamba Long-Context', 'Diffusion Research', 'Neuro-symbolic Rules', 'VLM Analysis',
    'Continual Learning / EWC', 'World Model / JEPA', 'Agentic Self-play', 'Federated Learning',
    'RL / PPO Research', 'Gen AI Strategy', 'Backtest Engine', 'Optuna Tuning'
  ];
  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
          <h1 className="nova-title">Learning Universe 16</h1>
          <p className="nova-subtitle">รายการโมดูล AI และการเรียนรู้เพื่อการวิจัยระบบ</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>
      <section className="nova-panel">
        <div className="nova-worker-grid">
          {modules.map((m, i) => <div className="nova-worker" key={m}><strong>{i + 1}. {m}</strong><small>สถานะ: พร้อมใช้งานในโหมดวิจัย</small></div>)}
        </div>
      </section>
    </div>
  );
}

function MarketsPage() {
  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">NOVA TELEMETRY</p>
          <h1 className="nova-title">Markets Overview</h1>
          <p className="nova-subtitle">ข้อมูลตลาดและ Watchlist แบบ Read-only</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>
      <section className="nova-panel">
        <ChartPlaceholder />
        <div className="watchlist" style={{ marginTop: '16px' }}>
          {watchlist.map((w) => <div className="watch-row" key={w.symbol}><span className="watch-symbol">{w.symbol}</span><span className="watch-market">{w.market}</span><span className="watch-note">{w.note}</span></div>)}
        </div>
      </section>
    </div>
  );
}

function VideoPage() {
  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">NOVA MEDIA WORKSPACE</p>
          <h1 className="nova-title">Gen-AI Video Studio</h1>
          <p className="nova-subtitle">สร้างและจัดการโปรเจกต์วิดีโอ AI สำหรับการนำเสนอ</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>
      <section className="nova-panel">
        <div className="nova-empty">ยังไม่มีโปรเจกต์วิดีโอในเซสชันนี้ · รองรับการสร้างเนื้อหาวิดีโอตามข้อกำหนด NOVA Video Spec</div>
      </section>
    </div>
  );
}

function BacktestPage() {
  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">NOVA BACKTEST ENGINE</p>
          <h1 className="nova-title">Backtest & Simulation</h1>
          <p className="nova-subtitle">ทดสอบพารามิเตอร์กลยุทธ์ย้อนหลัง</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>
      <section className="nova-panel">
        <div className="nova-empty">เลือกกลยุทธ์จาก Marketplace หรือ Gen AI Lab เพื่อเริ่มการจำลอง Backtest</div>
      </section>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="nova-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <section className="nova-panel" style={{ width: 'min(450px, 100%)', textAlign: 'center' }}>
        <h2>เข้าสู่ระบบ NOVA</h2>
        <p>เชื่อมต่อ Supabase Authentication เพื่อเข้าถึงฟีเจอร์ขั้นสูง</p>
        <Link to="/" className="nova-button nova-button-primary" style={{ marginTop: '16px', display: 'inline-flex' }}>กลับสู่ Dashboard</Link>
      </section>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="nova-shell">
      <header className="nova-header">
        <div>
          <p className="nova-eyebrow">USER ACCESS / PROFILE</p>
          <h1 className="nova-title">User Profile & Security</h1>
          <p className="nova-subtitle">ตรวจสอบสิทธิ์การใช้งานและความปลอดภัย</p>
        </div>
        <Link to="/" className="nova-link-button">← Dashboard</Link>
      </header>
      <section className="nova-panel">
        <h2>สถานะผู้ใช้</h2>
        <p>โหมดความปลอดภัย: Read-only · ไม่มีคำสั่งซื้อขายอัตโนมัติ</p>
      </section>
    </div>
  );
}

export default function App() {
  return <JarvisLayout />;
}
