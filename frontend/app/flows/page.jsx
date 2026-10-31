'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import './flow-studio.css';

const NODE_META = {
  'trigger.manual': { title: 'Manual trigger', category: 'TRIGGER', icon: '▶', detail: 'เริ่มการจำลองด้วยตนเองเท่านั้น' },
  'data.select_fields': { title: 'Select fields', category: 'DATA', icon: '▤', detail: 'เลือกเฉพาะ field ที่อยู่ใน allowlist' },
  'gate.review_required': { title: 'Review required', category: 'GATE', icon: '◇', detail: 'ทำเครื่องหมายว่าต้องมีคนตรวจทาน' },
  'output.preview': { title: 'Preview output', category: 'OUTPUT', icon: '◎', detail: 'แสดงผลตัวอย่างโดยไม่บันทึกข้อมูล' },
};

const DEFAULT_PROMPT = 'สร้าง workflow ตรวจสอบคำขอ onboarding: รับ customerId และ email, ทำเครื่องหมายให้เจ้าหน้าที่ตรวจสอบก่อน แล้วแสดง preview เท่านั้น';
const DEFAULT_SAMPLE = JSON.stringify({
  customerId: 'demo-customer-001',
  email: 'review@example.invalid',
  plan: 'starter',
}, null, 2);

function nodeSummary(node) {
  if (node.type === 'data.select_fields') return (node.config?.fields || []).join(', ');
  if (node.type === 'gate.review_required') return node.config?.reason || 'รอการตรวจทาน';
  if (node.type === 'output.preview') return node.config?.label || 'Preview';
  return 'Manual start · no schedule';
}

export default function FlowStudioPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState('checking');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [sampleText, setSampleText] = useState(DEFAULT_SAMPLE);
  const [draft, setDraft] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [provider, setProvider] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthState('misconfigured');
      return () => { active = false; };
    }

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setAuthState('error');
        setError('ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
        return;
      }
      if (!data.session?.access_token) {
        router.replace('/login');
        return;
      }
      setAuthState('ready');
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        setAuthState('signed-out');
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function accessToken() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error('ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ');
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      router.replace('/login');
      throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    return data.session.access_token;
  }

  async function generateDraft(event) {
    event.preventDefault();
    if (authState !== 'ready' || generating) return;
    setGenerating(true);
    setError('');
    setNotice('');
    setSimulation(null);
    try {
      const token = await accessToken();
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ operation: 'draft', prompt }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.draft) {
        const messages = {
          invalid_workflow_prompt: 'คำอธิบายต้องมี 1–1,200 ตัวอักษร',
          workflow_draft_rejected: 'ร่างจาก AI ไม่ผ่าน workflow validator จึงไม่ถูกนำมาใช้',
          ai_unavailable: 'Workers AI ยังไม่พร้อมใช้งาน',
          authentication_required: 'กรุณาเข้าสู่ระบบใหม่',
        };
        throw new Error(messages[payload.error] || 'สร้าง workflow draft ไม่สำเร็จ');
      }
      setDraft(payload.draft);
      setProvider(payload.provider || 'NOVA AI Worker');
      setNotice('สร้าง draft และผ่าน server-side graph validation แล้ว');
    } catch (err) {
      setError(err?.message || 'ไม่สามารถสร้าง workflow draft ได้');
    } finally {
      setGenerating(false);
    }
  }

  async function simulateDraft() {
    if (!draft || authState !== 'ready' || simulating) return;
    setSimulating(true);
    setError('');
    setNotice('');
    setSimulation(null);
    try {
      let sampleData;
      try {
        sampleData = JSON.parse(sampleText);
      } catch {
        throw new Error('Sample data ต้องเป็น JSON ที่ถูกต้อง');
      }
      if (!sampleData || typeof sampleData !== 'object' || Array.isArray(sampleData)) {
        throw new Error('Sample data ต้องเป็น JSON object เท่านั้น');
      }
      const token = await accessToken();
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ operation: 'simulate', draft, sampleData }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.simulation) {
        const messages = {
          invalid_simulation_data: 'Sample data ไม่ผ่านข้อจำกัดของ simulator',
          simulation_data_too_large: 'Sample data มีขนาดเกิน 8 KB',
          invalid_workflow_draft: 'Draft ไม่ผ่านการตรวจสอบซ้ำก่อนจำลอง',
        };
        throw new Error(messages[payload.error] || 'จำลอง workflow ไม่สำเร็จ');
      }
      setSimulation(payload.simulation);
      setNotice('Simulator ทำงานในหน่วยความจำและส่งคืน preview เท่านั้น');
    } catch (err) {
      setError(err?.message || 'ไม่สามารถจำลอง workflow ได้');
    } finally {
      setSimulating(false);
    }
  }

  async function copyDraft() {
    if (!draft || !navigator.clipboard?.writeText) {
      setError('เบราว์เซอร์นี้ไม่รองรับการคัดลอก JSON');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      setNotice('คัดลอก workflow draft JSON แล้ว');
    } catch {
      setError('คัดลอก JSON ไม่สำเร็จ');
    }
  }

  const nodes = Array.isArray(draft?.nodes) ? draft.nodes : [];
  const edges = Array.isArray(draft?.edges) ? draft.edges : [];

  return (
    <main className="flow-shell">
      <header className="flow-header">
        <div>
          <p className="flow-eyebrow"><span /> NOVA AUTOMATION / WORKFLOW DESIGN</p>
          <h1>Flow <em>Studio</em></h1>
          <p className="flow-subtitle">แปลงคำสั่งให้เป็น workflow draft ตรวจโครงสร้าง และทดลองด้วยข้อมูลจำลองก่อนเข้าสู่กระบวนการ review</p>
        </div>
        <div className="flow-header-actions">
          <span className="flow-mode-pill"><i /> DRAFT-ONLY MODE</span>
          <Link className="flow-back-link" href="/">Dashboard ↗</Link>
        </div>
      </header>

      <section className="flow-safety-strip">
        <span className="flow-safety-icon">⌑</span>
        <div><strong>SAFE WORKFLOW SANDBOX</strong><p>ไม่มีการบันทึก workflow, schedule, external effects, database writes, broker writes หรือคำสั่งซื้อขาย · Live Trading OFF</p></div>
        <span className="flow-safety-lock">LOCKED</span>
      </section>

      {authState === 'misconfigured' && <div className="flow-alert" role="alert">ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ กรุณาติดต่อผู้ดูแลระบบ</div>}
      {authState === 'checking' && <div className="flow-muted-banner">กำลังตรวจสอบเซสชัน NOVA…</div>}
      {error && <div className="flow-alert" role="alert">{error}</div>}
      {notice && <div className="flow-notice" role="status">{notice}</div>}

      <div className="flow-workspace">
        <aside className="flow-left-rail">
          <form className="flow-panel flow-prompt-panel" onSubmit={generateDraft}>
            <div className="flow-section-head"><span className="flow-section-index">01</span><div><span className="flow-label">AI WORKFLOW DESIGNER</span><h2>Describe your flow</h2></div></div>
            <label className="flow-field-label" htmlFor="flow-prompt">อธิบายงานที่ต้องการให้ NOVA จัดโครงสร้าง</label>
            <textarea id="flow-prompt" className="flow-textarea" rows={7} maxLength={1200} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="เช่น ตรวจสอบข้อมูลลูกค้า สร้างจุด review และแสดงผล preview" />
            <div className="flow-field-foot"><span>Plain language → bounded workflow</span><span>{prompt.length}/1,200</span></div>
            <button className="flow-primary-button" type="submit" disabled={authState !== 'ready' || generating || !prompt.trim()}>
              {generating ? <><span className="flow-spinner" /> GENERATING DRAFT…</> : <>GENERATE WORKFLOW <span>↗</span></>}
            </button>
            <p className="flow-helper">AI สร้างได้เฉพาะ node ที่อยู่ใน server-owned allowlist ผลลัพธ์ทุกชุดต้องผ่าน validator ก่อนแสดง</p>
          </form>

          <section className="flow-panel flow-registry-panel">
            <div className="flow-section-head"><span className="flow-section-index">02</span><div><span className="flow-label">SERVER-OWNED REGISTRY</span><h2>Allowed nodes</h2></div></div>
            <div className="flow-registry-list">
              {Object.entries(NODE_META).map(([type, item]) => (
                <div className="flow-registry-item" key={type}>
                  <span className="flow-registry-icon">{item.icon}</span>
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <code>{item.category}</code>
                </div>
              ))}
            </div>
            <p className="flow-helper">Node ประเภท HTTP, Shell, SQL, JavaScript, provider action และ broker action ไม่ได้รับอนุญาต</p>
          </section>
        </aside>

        <section className="flow-main-column">
          <section className="flow-panel flow-canvas-panel">
            <div className="flow-section-head flow-canvas-head">
              <span className="flow-section-index">03</span>
              <div><span className="flow-label">VISUAL GRAPH INSPECTOR</span><h2>Workflow canvas</h2></div>
              <div className="flow-canvas-stats"><span>{nodes.length} <small>NODES</small></span><span>{edges.length} <small>EDGES</small></span></div>
            </div>
            {!draft ? (
              <div className="flow-empty-canvas">
                <div className="flow-empty-orbit"><span>✦</span></div>
                <strong>Your workflow starts here</strong>
                <p>เขียนเป้าหมายทางซ้าย แล้วสร้าง draft เพื่อดู node graph ที่ผ่านการตรวจสอบแล้ว</p>
              </div>
            ) : (
              <>
                <div className="flow-draft-title"><div><span className="flow-validated-mark">✓ VALIDATED DRAFT</span><h3>{draft.title}</h3><p>{draft.description}</p></div><button className="flow-copy-button" type="button" onClick={copyDraft}>COPY JSON ↗</button></div>
                <div className="flow-node-grid">
                  {nodes.map((node, index) => {
                    const meta = NODE_META[node.type] || { title: node.type, category: 'UNKNOWN', icon: '?' };
                    const outgoing = edges.filter((edge) => edge.from === node.id).map((edge) => edge.to);
                    return (
                      <article className={'flow-node-card flow-node-' + meta.category.toLowerCase()} key={node.id}>
                        <div className="flow-node-top"><span className="flow-node-icon">{meta.icon}</span><span className="flow-node-number">NODE {String(index + 1).padStart(2, '0')}</span><span className="flow-node-category">{meta.category}</span></div>
                        <h4>{meta.title}</h4>
                        <p>{nodeSummary(node)}</p>
                        <div className="flow-node-foot"><code>{node.id}</code><span>{outgoing.length ? '→ ' + outgoing.join(', ') : 'TERMINAL'}</span></div>
                      </article>
                    );
                  })}
                </div>
                <div className="flow-edge-list"><span className="flow-label">CONNECTIONS</span>{edges.map((edge, index) => <div className="flow-edge-row" key={edge.from + '-' + edge.to}><span>{edge.from}</span><i>⟶</i><span>{edge.to}</span><small>EDGE {String(index + 1).padStart(2, '0')}</small></div>)}</div>
                <div className="flow-contract-footer"><span>SCHEMA {draft.schemaVersion}</span><span>MODE {draft.executionMode}</span><span>EXTERNAL EFFECTS OFF</span></div>
              </>
            )}
          </section>

          <section className="flow-panel flow-simulator-panel">
            <div className="flow-section-head"><span className="flow-section-index">04</span><div><span className="flow-label">DETERMINISTIC TEST BENCH</span><h2>Simulator</h2></div><span className="flow-local-tag">IN-MEMORY ONLY</span></div>
            <div className="flow-simulator-grid">
              <div>
                <label className="flow-field-label" htmlFor="flow-sample">Sample data · JSON object</label>
                <textarea id="flow-sample" className="flow-textarea flow-code-textarea" rows={8} spellCheck="false" value={sampleText} onChange={(event) => setSampleText(event.target.value)} />
                <div className="flow-field-foot"><span>ไม่เกิน 50 fields · 8 KB · scalar values เท่านั้น</span><span>DEMO DATA</span></div>
                <button className="flow-secondary-button" type="button" disabled={!draft || simulating || authState !== 'ready'} onClick={simulateDraft}>
                  {simulating ? 'SIMULATING…' : 'RUN PREVIEW SIMULATION ↗'}
                </button>
              </div>
              <div className="flow-simulation-result" aria-live="polite">
                {!simulation ? (
                  <div className="flow-result-empty"><span>◎</span><strong>Preview output</strong><p>เลือก draft และ sample data จากนั้นเริ่ม simulation เพื่อดู deterministic trace</p></div>
                ) : (
                  <>
                    <div className="flow-result-head"><span className="flow-validated-mark">✓ SIMULATION COMPLETE</span><span className="flow-preview-only">NO SIDE EFFECTS</span></div>
                    <div className="flow-trace-list">{simulation.trace.map((step, index) => <div className="flow-trace-row" key={step.nodeId}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.nodeId}</strong><small>{step.status.replaceAll('_', ' ')}</small></div>)}</div>
                    <div className="flow-preview-data"><span className="flow-label">PREVIEW PAYLOAD</span><pre>{JSON.stringify(simulation.preview, null, 2)}</pre></div>
                    <div className="flow-preview-flags"><span>EXECUTION OFF</span><span>PERSISTENCE OFF</span><span>BROKER WRITES OFF</span></div>
                  </>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>

      <footer className="flow-footer"><span>VOOM / NOVA · FLOW STUDIO</span><span>{provider ? 'DRAFT PROVIDER · ' + provider : 'AWAITING DRAFT'}</span><span>LIVE TRADING <strong>OFF</strong></span></footer>
    </main>
  );
}
