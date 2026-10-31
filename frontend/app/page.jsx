'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

const workspaces = [
  { label: 'AI Workspace', description: 'Chat, research and agent-assisted work', href: '/chat', tag: 'INTELLIGENCE', icon: '✦' },
  { label: 'Market Intelligence', description: 'Multi-asset context and verified market feeds', href: '/markets', tag: 'MARKETS', icon: '⌁' },
  { label: 'Strategy Research', description: 'Explore strategy logic and evidence', href: '/gen-ai', tag: 'RESEARCH', icon: '◇' },
  { label: 'Backtest Lab', description: 'Review reproducible strategy evaluations', href: '/backtest', tag: 'QUANT', icon: '▥' },
  { label: 'Broker Hub', description: 'Review broker connection and read-only access', href: '/broker', tag: 'CONNECTIVITY', icon: '⌘' },
  { label: 'Learning Universe', description: 'Learning modules and governed feedback loops', href: '/learning-universe', tag: 'LEARNING', icon: '◎' },
  { label: 'Marketplace', description: 'Browse strategy and capability catalogues', href: '/marketplace', tag: 'ECOSYSTEM', icon: '▦' },
  { label: 'Customer Workspace', description: 'Open your personal command center', href: '/command-center', tag: 'WORKSPACE', icon: '↗' },
];

function StatusPill({ children, tone = 'neutral' }) {
  return <span className={'nova-dash-pill is-' + tone}><i aria-hidden="true" />{children}</span>;
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="nova-dash-section-heading">
      <div><span className="nova-dash-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {action || null}
    </div>
  );
}

export default function Home() {
  const [broker, setBroker] = useState({
    state: 'checking',
    detail: 'Checking the authenticated broker status endpoint.',
    checkedAt: null,
  });

  useEffect(() => {
    let active = true;
    const checkBroker = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const sessionResult = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        const token = sessionResult.data?.session?.access_token;
        const response = await fetch('/api/broker/status?broker=mt5', {
          cache: 'no-store',
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        const verified = response.ok && data.accountConnected === true;
        setBroker({
          state: verified ? 'reported' : 'unverified',
          detail: data.detail || (response.ok
            ? 'The endpoint did not confirm an owner-scoped broker connection.'
            : 'The broker status endpoint did not return a successful response.'),
          checkedAt: new Date().toISOString(),
        });
      } catch {
        if (active) setBroker({
          state: 'unavailable',
          detail: 'The broker status API did not respond. Account connectivity cannot be confirmed.',
          checkedAt: new Date().toISOString(),
        });
      }
    };
    checkBroker();
    return () => { active = false; };
  }, []);

  const brokerLabel = broker.state === 'checking'
    ? 'CHECKING'
    : broker.state === 'reported'
      ? 'REPORTED BY API · NOT INDEPENDENTLY VERIFIED'
      : broker.state === 'unavailable'
        ? 'STATUS UNAVAILABLE'
        : 'NOT VERIFIED';

  return (
    <main className="nova-dashboard">
      <section className="nova-dash-hero">
        <div className="nova-dash-hero-copy">
          <div className="nova-dash-eyebrow"><span /> NOVA / INTELLIGENCE SYSTEMS</div>
          <h1>Your command surface<span>.</span></h1>
          <p>One place to understand system readiness, continue research and open the workspace you need.</p>
          <div className="nova-dash-hero-actions">
            <Link className="nova-dash-primary-action" href="/chat">Open NOVA AI <span aria-hidden="true">↗</span></Link>
            <Link className="nova-dash-secondary-action" href="/markets">Explore markets</Link>
          </div>
        </div>
        <div className="nova-dash-hero-status" aria-label="Execution safety status">
          <div className="nova-dash-status-icon">⌑</div>
          <div><span className="nova-dash-eyebrow">EXECUTION POLICY</span><strong>Read-only mode</strong><small>Order submission OFF · Live trading OFF</small></div>
          <StatusPill tone="safe">LOCKED</StatusPill>
        </div>
      </section>

      <section className="nova-dash-safety" aria-label="Safety notice">
        <span className="nova-dash-safety-mark">!</span>
        <div><strong>Safe mode is active</strong><p>This dashboard is for monitoring and AI-assisted research. It does not submit broker orders or enable live trading.</p></div>
        <span className="nova-dash-safety-code">POLICY / READ-ONLY</span>
      </section>

      <section className="nova-dash-overview" aria-label="System overview">
        <article className="nova-dash-overview-card nova-dash-overview-primary">
          <div className="nova-dash-card-top"><span className="nova-dash-eyebrow">AI WORKSPACE</span><span className="nova-dash-card-symbol">✦</span></div>
          <h2>Think, research, build.</h2>
          <p>Continue with NOVA AI Chat and your available research tools.</p>
          <Link href="/chat" className="nova-dash-card-link">GO TO AI WORKSPACE <span>↗</span></Link>
        </article>

        <article className="nova-dash-overview-card">
          <div className="nova-dash-card-top"><span className="nova-dash-eyebrow">BROKER CONNECTIVITY</span><span className="nova-dash-card-symbol">⌘</span></div>
          <div className="nova-dash-status-line"><StatusPill tone={broker.state === 'reported' ? 'caution' : broker.state === 'checking' ? 'neutral' : 'warning'}>{brokerLabel}</StatusPill></div>
          <h2>Exness · MT5 Demo</h2>
          <p>{broker.detail}</p>
          <Link href="/broker" className="nova-dash-card-link">OPEN BROKER HUB <span>↗</span></Link>
        </article>

        <article className="nova-dash-overview-card">
          <div className="nova-dash-card-top"><span className="nova-dash-eyebrow">MARKET DATA</span><span className="nova-dash-card-symbol">⌁</span></div>
          <StatusPill tone="warning">FEED NOT VERIFIED</StatusPill>
          <h2>Market intelligence</h2>
          <p>Live prices and chart values are withheld until a trusted feed and freshness are confirmed.</p>
          <Link href="/markets" className="nova-dash-card-link">VIEW MARKET WORKSPACE <span>↗</span></Link>
        </article>
      </section>

      <section className="nova-dash-workspaces">
        <SectionHeading eyebrow="YOUR NOVA ECOSYSTEM" title="Workspaces" action={<span className="nova-dash-section-meta">{workspaces.length} destinations</span>} />
        <div className="nova-dash-workspace-grid">
          {workspaces.map((item, index) => (
            <Link className="nova-dash-workspace-card" href={item.href} key={item.href}>
              <div className="nova-dash-workspace-top"><span className="nova-dash-workspace-icon">{item.icon}</span><span className="nova-dash-workspace-index">0{index + 1}</span></div>
              <span className="nova-dash-workspace-tag">{item.tag}</span>
              <h3>{item.label}</h3>
              <p>{item.description}</p>
              <span className="nova-dash-workspace-open">OPEN WORKSPACE <b>↗</b></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="nova-dash-bottom-grid">
        <article className="nova-dash-info-panel">
          <SectionHeading eyebrow="TRUST & SAFETY" title="Execution guard" />
          <div className="nova-dash-guard-row"><span>Order submission</span><strong className="is-off">OFF</strong></div>
          <div className="nova-dash-guard-row"><span>Live trading</span><strong className="is-off">OFF</strong></div>
          <div className="nova-dash-guard-row"><span>Broker access</span><strong>READ-ONLY INTENT</strong></div>
          <p className="nova-dash-footnote">A displayed policy is not proof of broker-side enforcement. Runtime permissions remain authoritative.</p>
        </article>
        <article className="nova-dash-info-panel nova-dash-next-panel">
          <SectionHeading eyebrow="CONTINUE YOUR WORK" title="Pick up where you left off" />
          <p>Open a workspace to continue a task. Module availability and data access are governed by the authenticated application and its server-side permissions.</p>
          <Link href="/command-center" className="nova-dash-primary-action">Open personal workspace <span>↗</span></Link>
        </article>
      </section>

      <footer className="nova-dash-footer"><span>VOOM / NOVA</span><span>ADAPTIVE COMMAND DASHBOARD</span><span>READ-ONLY · LIVE TRADING OFF</span></footer>
    </main>
  );
}
