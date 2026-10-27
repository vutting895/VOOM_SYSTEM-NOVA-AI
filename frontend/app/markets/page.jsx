'use client';

import Link from 'next/link';

const instruments = [
  { symbol: 'EUR / USD', market: 'FOREX', status: 'FEED NOT VERIFIED' },
  { symbol: 'BTC / USD', market: 'CRYPTO', status: 'FEED NOT VERIFIED' },
  { symbol: 'XAU / USD', market: 'METALS', status: 'FEED NOT VERIFIED' },
  { symbol: 'SPX 500', market: 'INDEX', status: 'FEED NOT VERIFIED' },
];

export default function MarketsPage() {
  return (
    <main className="jarvis-layout">
      <aside className="jarvis-sidebar">
        <Link className="jarvis-brand" href="/"><span className="brand-emblem">V<span>✦</span></span><span><strong>VOOM<span> / NOVA</span></strong><small>INTELLIGENCE SYSTEMS</small></span></Link>
        <div className="side-section-label">COMMAND DECK</div>
        <nav className="jarvis-nav" aria-label="Main navigation">
          <Link className="jarvis-nav-link" href="/"><span className="nav-code">01</span><span>OVERVIEW</span></Link>
          <Link className="jarvis-nav-link active" href="/markets"><span className="nav-code">02</span><span>MARKETS</span></Link>
          <Link className="jarvis-nav-link" href="/gen-ai"><span className="nav-code">03</span><span>AI ANALYSIS</span></Link>
          <Link className="jarvis-nav-link" href="/broker"><span className="nav-code">04</span><span>BROKER HUB</span></Link>
          <Link className="jarvis-nav-link" href="/learning-universe"><span className="nav-code">05</span><span>LEARNING UNIVERSE 16</span></Link>
          <Link className="jarvis-nav-link" href="/marketplace"><span className="nav-code">06</span><span>MARKETPLACE</span></Link>
        </nav>
      </aside>
      <section className="jarvis-main">
        <header className="command-header"><div><div className="eyebrow"><span className="eyebrow-line" /> NOVA INTELLIGENCE / DATA TELEMETRY</div><h1>Market <span>Telemetry</span></h1><p>Multi-market watchlist. Live data remains hidden until a trusted feed is verified.</p></div><div className="header-right"><span className="system-clock-label">SYSTEM MODE</span><span className="live-off-pill"><i /> LIVE TRADING OFF</span></div></header>
        <div className="system-strip"><span className="strip-icon">◈</span><span><strong>DATA INTEGRITY GUARD</strong><small>Quotes and price changes are not fabricated. Connect and validate a market-data provider before using this screen for decisions.</small></span></div>
        <section className="module-grid">
          {instruments.map((item, index) => <article className="module-card" key={item.symbol}><span className="module-icon">◉</span><span className="module-number">0{index + 1}</span><h3>{item.symbol}</h3><p>{item.market} · {item.status}</p><span className="module-open">WAITING FOR VERIFIED FEED</span></article>)}
        </section>
        <div className="hud-panel" style={{ marginTop: 16, padding: 18 }}><div className="panel-heading"><span><i className="panel-marker" /> MARKET DATA STATUS</span><span className="panel-code">DATA / VERIFY</span></div><p style={{ color: 'var(--nova-muted)', fontSize: 12, lineHeight: 1.8 }}>No verified streaming feed is connected to this page yet. The dashboard intentionally does not display sample prices as if they were live quotes.</p><Link className="panel-text-link" href="/broker">OPEN BROKER HUB <span>→</span></Link></div>
        <footer className="jarvis-footer"><span>VOOM_SYSTEM · NOVA AI</span><span>VERIFIED DATA ONLY</span><span>LIVE TRADING <strong>OFF</strong></span></footer>
      </section>
    </main>
  );
}
