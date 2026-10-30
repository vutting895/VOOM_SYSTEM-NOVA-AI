'use client';

import Link from 'next/link';
import { LEARNING_TRACKS, getReadinessCounts, getReadinessLabel } from '../../lib/learning-universe/catalog.mjs';

const counts = getReadinessCounts();

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
        <header className="command-header">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> NOVA INTELLIGENCE / RESEARCH FRAMEWORK</div>
            <h1>Learning <span>Universe 16</span></h1>
            <p>A governed learning roadmap with evidence-based readiness and human-reviewed research gates.</p>
          </div>
          <div className="header-right"><span className="system-clock-label">SYSTEM MODE</span><span className="live-off-pill"><i /> LIVE TRADING OFF</span></div>
        </header>

        <div className="system-strip">
          <span className="strip-icon">◎</span>
          <span>
            <strong>LEARNING READINESS · {counts.planned} PLANNED / {counts.prototype} PROTOTYPE / {counts.partial} PARTIAL</strong>
            <small>Readiness describes source evidence only. No track is represented as a trained, online, or production model.</small>
          </span>
        </div>

        <section className="module-grid">
          {LEARNING_TRACKS.map((module) => (
            <article className="module-card" key={module.id}>
              <span className="module-icon">◎</span>
              <span className="module-number">{module.number}</span>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
              <span className="module-open">{getReadinessLabel(module.readiness)}</span>
              <p>{module.evidenceSummary}</p>
            </article>
          ))}
        </section>

        <div className="hud-panel" style={{ marginTop: 16, padding: 18 }}>
          <div className="panel-heading"><span><i className="panel-marker" /> AUTO-LEARNING LOOP</span><span className="panel-code">CONTRACT / RESEARCH ONLY</span></div>
          <p style={{ color: 'var(--nova-muted)', fontSize: 12, lineHeight: 1.8 }}>
            Governed lifecycle: validate a hashed dataset → approve feature/label contracts → run reproducible out-of-sample evaluation → compare costs, baseline and risk → request human review. The current lifecycle is a contract prototype only: no scheduler, persistent job runner, automatic retraining, or production promotion is enabled.
          </p>
          <Link className="panel-text-link" href="/gen-ai">OPEN AI ANALYSIS <span>→</span></Link>
        </div>
        <footer className="jarvis-footer"><span>VOOM_SYSTEM · NOVA AI</span><span>LEARNING GOVERNANCE</span><span>LIVE TRADING <strong>OFF</strong></span></footer>
      </section>
    </main>
  );
}
