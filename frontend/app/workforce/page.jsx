import Link from 'next/link';
import './workforce.css';

const workforceAreas = [
  {
    code: '01',
    icon: '⌂',
    title: 'Organization & Roles',
    description: 'Department structure, accountable owners and human/Agent role definitions.',
    state: 'NOT CONNECTED',
    note: 'No organization source is connected to this preview.',
  },
  {
    code: '02',
    icon: '◈',
    title: 'Agent Registry',
    description: 'Approved templates, immutable versions, accountable owners and instance lifecycle.',
    state: 'NO AGENT DATA',
    note: 'No Agent instances are provisioned or activated by this interface.',
  },
  {
    code: '03',
    icon: '⇄',
    title: 'Work Queue & SLA',
    description: 'Task intake, assignment, bounded retries, escalation and service-level tracking.',
    state: 'NO TASK DATA',
    note: 'Queue and SLA metrics require a verified orchestration service.',
  },
  {
    code: '04',
    icon: '⌑',
    title: 'Human Review Inbox',
    description: 'Role-authorized review of consequential actions and policy-bound approvals.',
    state: 'NO APPROVAL DATA',
    note: 'This preview cannot approve, reject or execute any action.',
  },
  {
    code: '05',
    icon: '◎',
    title: 'Skills & Quality',
    description: 'Training evidence, evaluation results, quality checks and rework signals.',
    state: 'NO EVIDENCE',
    note: 'No employee or Agent performance scores are generated here.',
  },
  {
    code: '06',
    icon: '⌁',
    title: 'Audit & Governance',
    description: 'Permission boundaries, policy versions, provisioning history and audit events.',
    state: 'NO AUDIT SOURCE',
    note: 'Audit records must come from an authoritative backend source.',
  },
];

const readiness = [
  { label: 'Human workforce', value: '—', detail: 'Awaiting an authorized HR source' },
  { label: 'Active Agents', value: '—', detail: 'No runtime registry connected' },
  { label: 'Open work items', value: '—', detail: 'No task queue connected' },
  { label: 'Pending reviews', value: '—', detail: 'No approval feed connected' },
];

export default function WorkforcePage() {
  return (
    <main className="nova-workforce">
      <header className="nova-workforce-header">
        <div>
          <div className="nova-workforce-eyebrow"><span /> NOVA / INTERNAL OPERATIONS</div>
          <h1>Workforce <em>&amp; AI Agents</em></h1>
          <p>One governed workspace for people operations, approved Agent roles and accountable work.</p>
        </div>
        <Link className="nova-workforce-back" href="/">← Main Dashboard</Link>
      </header>

      <section className="nova-workforce-notice" role="status" aria-live="polite">
        <span className="nova-workforce-notice-icon">i</span>
        <div>
          <strong>Design preview · Read-only</strong>
          <p>No employee records, Agent instances, task data or approval records are connected or created by this page. Values remain unavailable until verified, permission-aware services are integrated.</p>
        </div>
        <span className="nova-workforce-preview-tag">P1 / UI FOUNDATION</span>
      </section>

      <section className="nova-workforce-readiness" aria-label="Workforce data readiness">
        {readiness.map((item) => (
          <article className="nova-workforce-readiness-card" key={item.label}>
            <span>{item.label}</span>
            <strong aria-label={item.label + ': unavailable'}>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </section>

      <section className="nova-workforce-section">
        <div className="nova-workforce-section-heading">
          <div>
            <span className="nova-workforce-kicker">CONTROLLED MODULES</span>
            <h2>Workforce operations</h2>
          </div>
          <span className="nova-workforce-section-meta">6 capability areas · backend integration pending</span>
        </div>

        <div className="nova-workforce-grid">
          {workforceAreas.map((area) => (
            <article className="nova-workforce-card" key={area.code}>
              <div className="nova-workforce-card-top">
                <span className="nova-workforce-card-icon" aria-hidden="true">{area.icon}</span>
                <span className="nova-workforce-card-code">{area.code}</span>
              </div>
              <h3>{area.title}</h3>
              <p>{area.description}</p>
              <div className="nova-workforce-card-state"><span />{area.state}</div>
              <small>{area.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="nova-workforce-governance">
        <div>
          <span className="nova-workforce-kicker">AUTHORITY MODEL</span>
          <h2>Human accountability stays in control.</h2>
          <p>Agents may perform bounded internal work only after their template, identity and permissions are approved. Consequential decisions remain with an authorized human.</p>
        </div>
        <ul>
          <li><strong>L1 · Bounded automation</strong><span>Read, classify, summarize and route within an approved scope.</span></li>
          <li><strong>L2 · Human approval</strong><span>Prepare proposals; wait for the named authorized reviewer.</span></li>
          <li><strong>L3 · Human decision</strong><span>Hiring, pay, promotion, discipline and termination are never delegated to AI alone.</span></li>
        </ul>
      </section>

      <footer className="nova-workforce-footer">
        <span>VOOM / NOVA · WORKFORCE</span>
        <span>NO HR DATA · NO AGENT PROVISIONING · NO AUTONOMOUS EMPLOYMENT DECISIONS</span>
      </footer>
    </main>
  );
}
