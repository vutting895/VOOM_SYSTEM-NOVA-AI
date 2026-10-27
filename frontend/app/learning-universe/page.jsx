'use client';

import Link from 'next/link';

const tracks = [
  ['01', 'Supervised Learning', 'Model training and validation concepts'],
  ['02', 'Unsupervised Learning', 'Clustering and regime discovery'],
  ['03', 'CNN / Vision Models', 'Visual pattern extraction'],
  ['04', 'Graph Neural Networks', 'Relationships between assets and signals'],
  ['05', 'Sequence Models', 'Temporal pattern research'],
  ['06', 'Reinforcement Learning', 'Simulation-only policy research'],
  ['07', 'Diffusion Models', 'Synthetic data research with validation'],
  ['08', 'Neuro-Symbolic AI', 'Rules, constraints and model reasoning'],
  ['09', 'Market Microstructure', 'Liquidity and execution-cost research'],
  ['10', 'Technical Pattern Lab', 'Pattern hypotheses and evidence'],
  ['11', 'Sentiment Research', 'News and text signal evaluation'],
  ['12', 'Feature Engineering', 'Data quality and signal construction'],
  ['13', 'Risk Intelligence', 'Exposure and drawdown controls'],
  ['14', 'Backtest Validation', 'Out-of-sample and walk-forward tests'],
  ['15', 'Drift Monitoring', 'Model and data drift monitoring'],
  ['16', 'Auto-Learning Loop', 'Human-reviewed feedback and retraining gates'],
];

export default function LearningUniversePage() {
  return (
    <main className="jarvis-layout">
      <aside className="jarvis-sidebar">
        <Link className="jarvis-brand" href="/"><span className="brand-emblem">V<span>✦</span></span><span><strong>VOOM<span> / NOVA</span></strong><small>INTELLIGENCE SYSTEMS</small></span></Link>
        <div className="side-section-label">COMMAND DECK</div>
        <nav className="jarvis-nav" aria-label="Main navigation">
          <Link className="jarvis-nav-link" href="/"><span className="nav-code">01</span><span>OVERVIEW</span></Link>
          <Link className="jarvis-nav-link" href="/markets"><span className="nav-code">02</span><span>MARKETS</span></Link>
          <Link className="jarvis-nav-link" href="/gen-ai"><span className="nav-code">03</span><span>AI ANALYSIS</span></Link>
          <Link className="jarvis-nav-link" href="/broker"><span className="nav-code">04</span><span>BROKER HUB</span></Link>
          <Link className="jarvis-nav-link active" href="/learning-universe"><span className="nav-code">05</span><span>LEARNING UNIVERSE 16</span></Link>
          <Link className="jarvis-nav-link" href="/marketplace"><span className="nav-code">06</span><span>MARKETPLACE</span></Link>
        </nav>
      </aside>
      <section className="jarvis-main">
        <header className="command-header"><div><div className="eyebrow"><span className="eyebrow-line" /> NOVA INTELLIGENCE / RESEARCH FRAMEWORK</div><h1>Learning <span>Universe 16</span></h1><p>A research roadmap for the Auto-Learning Loop, with validation and human review gates.</p></div><div className="header-right"><span className="system-clock-label">SYSTEM MODE</span><span className="live-off-pill"><i /> LIVE TRADING OFF</span></div></header>
        <div className="system-strip"><span className="strip-icon">◎</span><span><strong>LEARNING SAFETY GATE</strong><small>These are framework tracks, not proof that models are trained or running. Retraining and production promotion require evidence and approval.</small></span></div>
        <section className="module-grid">{tracks.map(([number, name, detail]) => <article className="module-card" key={number}><span className="module-icon">◎</span><span className="module-number">{number}</span><h3>{name}</h3><p>{detail}</p><span className="module-open">RESEARCH TRACK · NOT YET VERIFIED</span></article>)}</section>
        <div className="hud-panel" style={{ marginTop: 16, padding: 18 }}><div className="panel-heading"><span><i className="panel-marker" /> AUTO-LEARNING LOOP</span><span className="panel-code">LOOP / SAFE</span></div><p style={{ color: 'var(--nova-muted)', fontSize: 12, lineHeight: 1.8 }}>Proposed lifecycle: collect validated data → evaluate quality → train in isolated experiments → backtest out-of-sample → review risk and drift → require approval before release. No automatic live trading is enabled.</p><Link className="panel-text-link" href="/gen-ai">OPEN AI ANALYSIS <span>→</span></Link></div>
        <footer className="jarvis-footer"><span>VOOM_SYSTEM · NOVA AI</span><span>RESEARCH ROADMAP</span><span>LIVE TRADING <strong>OFF</strong></span></footer>
      </section>
    </main>
  );
}
