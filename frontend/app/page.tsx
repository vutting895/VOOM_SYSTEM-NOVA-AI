const modules = [
  { number: "01", title: "Market Overview", detail: "Public market data and watchlist", status: "Research mode" },
  { number: "02", title: "AI Research", detail: "Strategy notes and model-assisted analysis", status: "Local model required" },
  { number: "03", title: "Backtesting", detail: "Deterministic EMA crossover on OHLCV candles", status: "Research only" },
  { number: "04", title: "Risk & Portfolio", detail: "Validate risk limits before paper execution", status: "Guardrails only" },
  { number: "05", title: "Broker Connection", detail: "Alpaca OAuth connection and account summary", status: "Paper trading only" },
  { number: "06", title: "Marketplace", detail: "Strategy and research catalogue", status: "Preview" },
];

export default function HomePage() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="VOOM SYSTEM home">
          <span className="brand-mark">V</span>
          <span>VOOM <b>SYSTEM</b><small>NOVA AI PLATFORM</small></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav className="navigation" aria-label="Main navigation">
          <a className="nav-link active" href="/">◈ <span>Overview</span></a>
          <a className="nav-link" href="#market">⌁ <span>Market data</span></a>
          <a className="nav-link" href="#research">✳ <span>Gen AI research</span></a>
          <a className="nav-link" href="#backtest">▥ <span>Backtesting</span></a>
          <a className="nav-link" href="#risk">◉ <span>Risk & portfolio</span></a>
          <a className="nav-link" href="/settings/broker">⇄ <span>Broker connection</span></a>
          <a className="nav-link" href="#marketplace">▦ <span>Marketplace</span></a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Research environment
          <small>Live order execution disabled</small>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><span className="eyebrow">NOVA WORKSPACE</span><h1>System overview</h1></div>
          <div className="topbar-right"><span className="pill"><span className="status-dot" /> PAPER / RESEARCH</span><span className="avatar">VS</span></div>
        </header>

        <section className="welcome">
          <div>
            <span className="eyebrow light">VOOM SYSTEM · NOVA AI</span>
            <h2>Research with clarity.<br /><em>Trade with discipline.</em></h2>
            <p>A modular workspace for market research, strategy testing and risk-aware paper-trading workflows.</p>
            <a className="primary-button" href="#modules">Explore workspace <span aria-hidden="true">↗</span></a>
          </div>
          <div className="orb" aria-hidden="true"><span>V</span></div>
          <div className="welcome-foot"><span>01 / RESEARCH FIRST</span><span>LIVE EXECUTION: DISABLED</span></div>
        </section>

        <section className="metrics" aria-label="System status">
          <article className="metric"><span>PLATFORM MODE</span><strong>Research</strong><small><span className="status-dot" /> Live orders disabled</small></article>
          <article className="metric"><span>MARKET DATA</span><strong>On demand</strong><small>Public candle sources</small></article>
          <article className="metric"><span>BACKTEST ENGINE</span><strong>EMA baseline</strong><small>OHLCV · not tick-accurate</small></article>
          <article className="metric"><span>BROKER LINK</span><strong>Not verified</strong><small>Configure paper OAuth first</small></article>
        </section>

        <section id="modules" className="section">
          <div className="section-heading"><div><span className="eyebrow">YOUR TOOLKIT</span><h2>Workspace modules</h2></div><span className="section-count">06 MODULES</span></div>
          <div className="module-grid">
            {modules.map((module) => (
              <article className="module-card" key={module.number} id={module.title === "Market Overview" ? "market" : module.title === "AI Research" ? "research" : module.title === "Backtesting" ? "backtest" : module.title === "Risk & Portfolio" ? "risk" : module.title === "Marketplace" ? "marketplace" : undefined}>
                <div className="module-top"><span className="module-number">{module.number}</span><span className="arrow">↗</span></div>
                <h3>{module.title}</h3><p>{module.detail}</p>
                <div className="module-status"><span className="tiny-dot" />{module.status}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="safety-note">
          <div className="safety-icon">✓</div><div><strong>Safety by default</strong><p>This repository is a research scaffold. No live orders are submitted. Before production use, configure authentication, database policies, observability and end-to-end tests.</p></div>
        </section>
        <footer>VOOM SYSTEM · NOVA AI <span>Built for careful research, testing and iteration.</span></footer>
      </section>
    </main>
  );
}
