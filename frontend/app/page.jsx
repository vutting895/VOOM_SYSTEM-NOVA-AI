'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

const navigation = [
  { label: 'OVERVIEW', href: '/', code: '01' },
  { label: 'MARKETS', href: '/markets', code: '02' },
  { label: 'AI ANALYSIS', href: '/gen-ai', code: '03' },
  { label: 'BROKER HUB', href: '/broker', code: '04' },
  { label: 'LEARNING UNIVERSE 16', href: '/learning-universe', code: '05' },
  { label: 'MARKETPLACE', href: '/marketplace', code: '06' },
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

export default function Home() {
  const [brokerStatus, setBrokerStatus] = useState('CHECKING');
  const [brokerDetail, setBrokerDetail] = useState('Checking the broker status endpoint…');

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
      const requestStatus = async () => {
        const sessionResult = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        const token = sessionResult.data?.session?.access_token;
        return fetch('/api/broker/status?broker=mt5', { cache: 'no-store', headers: token ? { Authorization: 'Bearer ' + token } : {} });
      };
      requestStatus()
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        setBrokerStatus(data.accountConnected ? 'REPORTED CONNECTED' : 'NOT VERIFIED');
        setBrokerDetail(data.detail || 'The endpoint did not provide verified MT5 account details.');
      })
      .catch(() => {
        if (active) {
          setBrokerStatus('STATUS UNAVAILABLE');
          setBrokerDetail('The broker status API did not respond; account connection cannot be confirmed.');
        }
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="jarvis-layout">
      <aside className="jarvis-sidebar">
        <Link className="jarvis-brand" href="/" aria-label="VOOM NOVA home">
          <span className="brand-emblem">V<span>✦</span></span>
          <span><strong>VOOM<span> / NOVA</span></strong><small>INTELLIGENCE SYSTEMS</small></span>
        </Link>
        <div className="side-section-label">COMMAND DECK</div>
        <nav className="jarvis-nav" aria-label="Main navigation">
          {navigation.map((item, index) => (
            <Link className={index === 0 ? 'jarvis-nav-link active' : 'jarvis-nav-link'} href={item.href} key={item.label}>
              <span className="nav-code">{item.code}</span><span>{item.label}</span>{index === 0 && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-section-label">SECURITY PROTOCOL</div>
          <div className="security-card"><span className="security-led" /><div><strong>READ-ONLY MODE</strong><small>Order execution locked</small></div><span className="lock-icon">⌑</span></div>
          <Link className="profile-link" href="/profile"><span className="profile-avatar">U</span><span><strong>USER ACCESS</strong><small>Login / Profile</small></span><span className="profile-arrow">↗</span></Link>
        </div>
      </aside>

      <section className="jarvis-main">
        <header className="command-header">
          <div><div className="eyebrow"><span className="eyebrow-line" /> NOVA INTELLIGENCE / SYSTEM OVERVIEW</div><h1>Command <span>Center</span></h1><p>Market intelligence. Strategy research. Risk-aware decisions.</p></div>
          <div className="header-right"><span className="system-clock-label">SYSTEM MODE</span><span className="live-off-pill"><i /> LIVE TRADING OFF</span><Link className="header-profile" href="/login" aria-label="Login and profile">↗</Link></div>
        </header>

        <div className="system-strip"><span className="strip-icon">◈</span><span><strong>SAFE MODE ACTIVE</strong><small>Read-only + AI Analysis · No trade orders will be sent from this dashboard.</small></span><span className="strip-right">PROTOCOL 01 <b>●</b></span></div>

        <div className="command-grid">
          <section className="hud-panel ai-core-panel">
            <div className="panel-heading"><span><i className="panel-marker" /> NOVA AI CORE</span><span className="panel-code">CORE / 001</span></div>
            <div className="ai-core-content"><Orb /><div className="core-copy"><span className="micro-label">INTELLIGENCE ENGINE</span><h2>Ready to <em>analyze.</em></h2><p>Use AI research tools to review strategies and market context. No verified live market feed is displayed here.</p><Link className="hud-button" href="/chat">OPEN NOVA AI CHAT <span>↗</span></Link></div></div>
            <div className="core-foot"><span><i className="tiny-led" /> UI ONLINE</span><span>AI PROVIDER STATUS REQUIRES CHECK</span></div>
          </section>

          <section className="hud-panel broker-panel">
            <div className="panel-heading"><span><i className="panel-marker" /> BROKER LINK</span><span className="panel-code">LINK / 004</span></div>
            <div className="broker-name-row"><div className="broker-monogram">XM</div><div><h2>Exness / MetaTrader 5 Demo</h2><p>Broker connection monitor</p></div></div>
            <div className="broker-state"><span className="state-ring" /><div><strong>{brokerStatus}</strong><small>{brokerDetail}</small></div></div>
            <div className="read-only-row"><span>ACCESS SCOPE</span><strong>READ-ONLY</strong></div>
            <Link className="panel-text-link" href="/broker">OPEN BROKER HUB <span>→</span></Link>
          </section>

          <section className="hud-panel market-panel">
            <div className="panel-heading"><span><i className="panel-marker" /> MARKET TELEMETRY</span><span className="panel-code">DATA / 002</span></div>
            <div className="market-title-row"><div><h2>Market overview</h2><p>Multi-asset intelligence feed</p></div><span className="unverified-tag"><i /> FEED UNVERIFIED</span></div>
            <ChartPlaceholder />
            <div className="watchlist">
              {watchlist.map((item) => <div className="watch-row" key={item.symbol}><span className="watch-symbol">{item.symbol}</span><span className="watch-market">{item.market}</span><span className="watch-note">{item.note}</span></div>)}
            </div>
            <Link className="panel-text-link" href="/markets">OPEN MARKETS <span>→</span></Link>
          </section>

          <section className="hud-panel risk-panel">
            <div className="panel-heading"><span><i className="panel-marker" /> RISK &amp; EXECUTION GUARD</span><span className="panel-code">SAFE / 003</span></div>
            <div className="guard-visual"><div className="guard-icon">⌑</div><div><span className="micro-label">ORDER ROUTING</span><h2>LOCKED</h2><p>Live execution is disabled by design.</p></div><div className="guard-seal">OFF</div></div>
            <div className="guard-list"><div><span>Live order submission</span><strong className="state-off">DISABLED</strong></div><div><span>Verified portfolio values</span><strong>NOT AVAILABLE</strong></div><div><span>Risk engine status</span><strong>REQUIRES VALIDATION</strong></div></div>
            <div className="risk-note">No real balances, returns, or account metrics are shown until a trusted source is connected and verified.</div>
          </section>
        </div>

        <section className="wix-insight-grid" aria-label="NOVA research, portfolio and telemetry">
          <section className="hud-panel wix-insight-panel">
            <div className="panel-heading">
              <span><i className="panel-marker" /> AI SIGNAL &amp; RATIONALE</span>
              <span className="panel-code">RESEARCH / 005</span>
            </div>
            <div className="wix-insight-body">
              <div className="wix-signal-state">
                <span className="micro-label">SIGNAL CONFIDENCE</span>
                <strong>—</strong>
                <span className="wix-data-state">WAITING FOR VALIDATED RESULT</span>
              </div>
              <div className="wix-rationale">
                <strong>RATIONALE</strong>
                <p>ยังไม่มีผลวิเคราะห์ที่ผ่านการตรวจสอบจาก Strategy Engine จึงไม่แสดงทิศทางสัญญาณ คะแนนความเชื่อมั่น หรือเหตุผลที่สร้างขึ้นเอง</p>
              </div>
              <Link className="panel-text-link" href="/gen-ai">OPEN AI ANALYSIS <span>→</span></Link>
            </div>
          </section>

          <section className="hud-panel wix-insight-panel">
            <div className="panel-heading">
              <span><i className="panel-marker" /> PORTFOLIO &amp; RISK</span>
              <span className="panel-code">RISK / 006</span>
            </div>
            <div className="wix-insight-body">
              <div className="wix-metric-grid">
                <div><span>ACCOUNT EQUITY</span><strong>—</strong><small>NOT VERIFIED</small></div>
                <div><span>EXPOSURE</span><strong>—</strong><small>NOT VERIFIED</small></div>
                <div><span>DRAWDOWN</span><strong>—</strong><small>NO VERIFIED HISTORY</small></div>
              </div>
              <div className="wix-execution-lock">
                <span className="guard-icon">⌑</span>
                <div><strong>EXECUTION LOCKED</strong><small>Risk monitoring only · No close-all or order action is available</small></div>
                <span className="guard-seal">OFF</span>
              </div>
              <Link className="panel-text-link" href="/backtest">OPEN BACKTEST &amp; RISK REVIEW <span>→</span></Link>
            </div>
          </section>

          <section className="hud-panel wix-insight-panel">
            <div className="panel-heading">
              <span><i className="panel-marker" /> PORTFOLIO ALLOCATION</span>
              <span className="panel-code">ALLOC / 007</span>
            </div>
            <div className="wix-insight-body">
              <div className="wix-allocation-empty">
                <div className="wix-allocation-ring" aria-hidden="true"><span>—</span></div>
                <div>
                  <strong>NO VERIFIED ALLOCATION</strong>
                  <p>การจัดสรรสินทรัพย์จะแสดงเมื่อเชื่อมข้อมูลพอร์ตที่ยืนยันเจ้าของบัญชีและแหล่งข้อมูลแล้ว</p>
                </div>
              </div>
              <div className="wix-data-footnote">ไม่มีการนำเปอร์เซ็นต์ตัวอย่างจาก Wix มาใช้เป็นยอดถือครองจริง</div>
              <Link className="panel-text-link" href="/broker">CHECK ACCOUNT CONNECTION <span>→</span></Link>
            </div>
          </section>

          <section className="hud-panel wix-insight-panel">
            <div className="panel-heading">
              <span><i className="panel-marker" /> SYSTEM ACTIVITY &amp; TELEMETRY</span>
              <span className="panel-code">SYSTEM / 008</span>
            </div>
            <div className="wix-insight-body">
              <div className="wix-telemetry-list">
                <div><span className="wix-telemetry-led pending" /><span><strong>BROKER STATUS API</strong><small>{brokerStatus} · {brokerDetail}</small></span></div>
                <div><span className="wix-telemetry-led pending" /><span><strong>MARKET DATA FEED</strong><small>UNVERIFIED · Live candles are not available on this overview</small></span></div>
                <div><span className="wix-telemetry-led locked" /><span><strong>ORDER EXECUTION</strong><small>DISABLED · No order submission or emergency close action</small></span></div>
              </div>
              <div className="wix-data-footnote">แสดงเฉพาะสถานะที่ Frontend ตรวจพบ ไม่ใช่ Server Logs หรือประวัติธุรกรรม</div>
              <Link className="panel-text-link" href="/broker">OPEN SYSTEM &amp; BROKER STATUS <span>→</span></Link>
            </div>
          </section>
        </section>

        <section className="modules-section"><div className="section-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> SYSTEM MODULES</div><h2>Intelligence <span>Modules</span></h2></div><span className="panel-code">MODULES / 04</span></div><div className="module-grid">{modules.map((module, i) => <Link className="module-card" href={module.href} key={module.name}><span className="module-icon">{module.icon}</span><span className="module-number">0{i + 1}</span><h3>{module.name}</h3><p>{module.detail}</p><span className="module-open">ACCESS MODULE ↗</span></Link>)}</div></section>

        <footer className="jarvis-footer"><span>VOOM_SYSTEM <b>·</b> NOVA AI</span><span>INTERFACE CONCEPT / VERIFIED DATA ONLY</span><span>LIVE TRADING <strong>OFF</strong></span></footer>
      </section>
    </main>
  );
}
