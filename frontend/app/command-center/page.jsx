'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { buildBoundedChatHistory } from '../../lib/chat-history.mjs';
import ApprovalCard from '../../components/approval-card';
import './command-center.css';

const APPROVALS_ENABLED = process.env.NEXT_PUBLIC_NOVA_APPROVALS_ENABLED === 'true';
const WIDGET_ALLOWLIST = Object.freeze(['smc_chart', 'risk_gauge', 'terminal_log', 'approval_card']);

function makeLog(message, level = 'info') {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), message, level };
}

function safeIntent(intent) {
  if (!intent || intent.schemaVersion !== 'nova.intent.v1') return null;
  if (intent.intent !== 'draft_strategy' || !intent.parameters || typeof intent.parameters !== 'object') return null;
  return {
    schemaVersion: 'nova.intent.v1',
    intent: 'draft_strategy',
    parameters: {
      market: typeof intent.parameters.market === 'string' ? intent.parameters.market.slice(0, 40) : null,
      timeframe: typeof intent.parameters.timeframe === 'string' ? intent.parameters.timeframe.slice(0, 24) : null,
      risk: typeof intent.parameters.risk === 'string' ? intent.parameters.risk.slice(0, 40) : null,
    },
    component: { type: 'strategy_draft', executionEnabled: false, liveTradingEnabled: false },
  };
}

function WidgetFrame({ title, code, children, className = '' }) {
  return <section className={'cc-panel ' + className}>
    <div className="cc-panel-head"><span>{title}</span><small>{code}</small></div>
    {children}
  </section>;
}

function StatusValue({ label, value, tone = 'muted' }) {
  return <div className="cc-stat"><span>{label}</span><strong className={'tone-' + tone}>{value}</strong></div>;
}

export default function CommandCenterPage() {
  const router = useRouter();
  const listRef = useRef(null);
  const [auth, setAuth] = useState({ state: 'checking', token: '', email: '' });
  const identityRef = useRef(null);
  const requestGenerationRef = useRef(0);
  const welcomeMessage = () => ({
    id: 'welcome',
    role: 'assistant',
    content: 'NOVA พร้อมช่วยวิเคราะห์และค้นคว้า โปรดระบุสิ่งที่ต้องการตรวจสอบ ระบบจะแสดงเฉพาะข้อมูลที่ Backend ยืนยันได้ และจะไม่ส่งคำสั่งซื้อขาย',
  });
  const [messages, setMessages] = useState([welcomeMessage()]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [broker, setBroker] = useState({ status: 'checking', detail: 'กำลังตรวจสอบสถานะบัญชีของผู้ใช้ปัจจุบัน' });
  const [logs, setLogs] = useState([]);
  const [approvalBusy, setApprovalBusy] = useState('');

  const appendLog = useCallback((message, level = 'info') => {
    setLogs((current) => [...current.slice(-79), makeLog(message, level)]);
  }, []);

  const resetCustomerState = useCallback(() => {
    requestGenerationRef.current += 1;
    setMessages([welcomeMessage()]);
    setInput('');
    setBusy(false);
    setError('');
    setBroker({ status: 'checking', detail: 'กำลังตรวจสอบสถานะบัญชีของผู้ใช้ปัจจุบัน' });
    setLogs([]);
    setApprovalBusy('');
  }, []);

  const loadBroker = useCallback(async (token, expectedUserId) => {
    const generation = requestGenerationRef.current;
    if (!expectedUserId || identityRef.current !== expectedUserId) return;
    try {
      const response = await fetch('/api/broker/status?broker=mt5', {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(data.detail || 'Broker status unavailable');
      if (generation !== requestGenerationRef.current || identityRef.current !== expectedUserId) return;
      setBroker({ status: data.status || 'unverified', detail: data.detail || 'ยังไม่มีผลตรวจสอบจาก Broker Hub' });
      appendLog('Broker status checked: ' + (data.status || 'unverified'));
    } catch (err) {
      if (generation !== requestGenerationRef.current || identityRef.current !== expectedUserId) return;
      setBroker({ status: 'unavailable', detail: err.message || 'ไม่สามารถตรวจสอบ Broker ได้' });
      appendLog('Broker status unavailable', 'warning');
    }
  }, [appendLog]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuth({ state: 'misconfigured', token: '', email: '', userId: '' });
      return () => { active = false; };
    }

    const applySession = (session) => {
      if (!session?.access_token || !session?.user?.id) {
        if (identityRef.current !== null) resetCustomerState();
        identityRef.current = null;
        setAuth({ state: 'signed-out', token: '', email: '', userId: '' });
        router.replace('/login');
        return;
      }

      const userId = session.user.id;
      const identityChanged = identityRef.current !== userId;
      if (identityChanged) {
        identityRef.current = userId;
        resetCustomerState();
        appendLog('Customer identity changed; previous customer state discarded');
        void loadBroker(session.access_token, userId);
      }
      setAuth({
        state: 'ready',
        token: session.access_token,
        email: session.user.email || 'Signed-in customer',
        userId,
      });
    };

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setAuth({ state: 'error', token: '', email: '', userId: '' });
        return;
      }
      applySession(data?.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      requestGenerationRef.current += 1;
    };
  }, [router, loadBroker, appendLog, resetCustomerState]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const pendingApprovals = useMemo(
    () => messages.filter((message) => message.approval?.status === 'pending'),
    [messages],
  );

  async function createDraftReview(messageId, intent, revisedProposal = null) {
    if (!APPROVALS_ENABLED || !auth.token || intent?.intent !== 'draft_strategy') return;
    setApprovalBusy(messageId);
    try {
      const threadResponse = await fetch('/api/agent/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
        body: JSON.stringify({ title: 'Customer command center strategy review' }),
        cache: 'no-store',
      });
      const thread = await threadResponse.json().catch(() => ({}));
      if (!threadResponse.ok || !thread.thread?.id) throw new Error('ระบบตรวจทานร่างยังไม่พร้อม');
      const proposal = revisedProposal || {
        title: 'NOVA Strategy Draft',
        summary: 'ร่างเพื่อการวิจัยเท่านั้น ยังไม่ผ่านการตรวจสอบย้อนหลังและไม่มีคำสั่งซื้อขาย',
        market: intent.parameters.market,
        timeframe: intent.parameters.timeframe,
        riskProfile: intent.parameters.risk,
      };
      const response = await fetch('/api/agent/threads/' + encodeURIComponent(thread.thread.id) + '/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
        body: JSON.stringify({ requestType: 'strategy_draft_review', proposal }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.approval?.id) throw new Error('บันทึกร่างตรวจทานไม่สำเร็จ');
      setMessages((current) => current.map((item) => item.id === messageId
        ? { ...item, approval: payload.approval, threadId: thread.thread.id }
        : item));
      appendLog('Owner-scoped research draft review created');
    } catch (err) {
      setError(err.message || 'สร้างคำขอตรวจทานไม่สำเร็จ');
      appendLog('Draft review creation failed', 'warning');
    } finally {
      setApprovalBusy('');
    }
  }

  async function decideApproval(messageId, decision) {
    const target = messages.find((item) => item.id === messageId);
    if (!target?.approval?.id || !auth.token) return;
    setApprovalBusy(messageId);
    try {
      const response = await fetch('/api/agent/approvals/' + encodeURIComponent(target.approval.id) + '/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
        body: JSON.stringify(decision),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('ไม่สามารถบันทึกผลตรวจทานได้');
      setMessages((current) => current.map((item) => item.id === messageId
        ? { ...item, approval: { ...item.approval, ...payload.approval } }
        : item));
      appendLog('Research draft review decision saved');
    } catch (err) {
      setError(err.message || 'บันทึกผลไม่สำเร็จ');
      appendLog('Approval decision failed', 'warning');
    } finally {
      setApprovalBusy('');
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || auth.state !== 'ready' || !auth.token) return;
    if (content.length > 1200) {
      setError('ข้อความต้องไม่เกิน 1,200 ตัวอักษร');
      return;
    }
    setError('');
    setInput('');
    setBusy(true);
    const generation = requestGenerationRef.current;
    const requestToken = auth.token;
    const userMessage = { id: crypto.randomUUID(), role: 'user', content };
    const history = buildBoundedChatHistory(messages, userMessage);
    setMessages((current) => [...current, userMessage]);
    appendLog('Chat request submitted to authenticated NOVA API');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + requestToken },
        body: JSON.stringify({ messages: history }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (generation !== requestGenerationRef.current) return;
      if (!response.ok) throw new Error(payload.error === 'ai_provider_unavailable'
        ? 'NOVA AI Worker ยังไม่พร้อมใช้งาน'
        : 'คำขอ AI ไม่สำเร็จ (' + response.status + ')');
      if (typeof payload.message !== 'string' || !payload.message.trim()) throw new Error('AI API ส่งคำตอบไม่ถูกต้อง');
      const intent = safeIntent(payload.intent);
      const messageId = crypto.randomUUID();
      setMessages((current) => [...current, { id: messageId, role: 'assistant', content: payload.message, intent }]);
      appendLog('AI response received; intent passed fixed-catalog validation');
    } catch (err) {
      if (generation !== requestGenerationRef.current) return;
      setError(err.message || 'ไม่สามารถติดต่อ NOVA AI ได้');
      appendLog('Chat request failed', 'warning');
    } finally {
      if (generation === requestGenerationRef.current) setBusy(false);
    }
  }

  if (auth.state === 'checking') return <main className="cc-loading">กำลังตรวจสอบสิทธิ์และเตรียม Workspace…</main>;
  if (auth.state !== 'ready') return <main className="cc-loading" role="alert">ไม่สามารถเปิด Workspace ได้ กรุณาตรวจสอบ Supabase Auth และเข้าสู่ระบบใหม่</main>;

  return (
    <main className="cc-shell">
      <header className="cc-header">
        <Link href="/" className="cc-brand"><span>V</span><strong>VOOM / NOVA</strong></Link>
        <div className="cc-customer"><small>CUSTOMER WORKSPACE</small><strong>{auth.email}</strong></div>
        <div className="cc-safety"><i /> READ-ONLY · LIVE TRADING OFF</div>
      </header>

      <div className="cc-layout">
        <section className="cc-chat">
          <div className="cc-section-title"><div><small>CONVERSATIONAL CONTROL CENTER</small><h1>NOVA <em>Command</em></h1></div><span>01 / CHAT</span></div>
          <div className="cc-chat-notice">AI ใช้ได้เฉพาะข้อมูลและเครื่องมือที่ Backend อนุญาต ไม่มีการส่งคำสั่งซื้อขาย</div>
          <div className="cc-messages" ref={listRef} aria-live="polite">
            {messages.map((message) => <article className={'cc-message ' + message.role} key={message.id}>
              <small>{message.role === 'assistant' ? 'NOVA AI' : 'YOU'}</small>
              <p>{message.content}</p>
              {message.intent?.intent === 'draft_strategy' && !message.approval && (
                <div className="cc-intent">
                  <strong>STRATEGY DRAFT INTENT</strong>
                  <span>{message.intent.parameters.market || 'Market not specified'} · {message.intent.parameters.timeframe || 'Timeframe not specified'}</span>
                  {APPROVALS_ENABLED
                    ? <button type="button" disabled={approvalBusy === message.id} onClick={() => void createDraftReview(message.id, message.intent)}>สร้างคำขอตรวจทาน</button>
                    : <small>ระบบตรวจทานยังไม่เปิดใช้งานใน environment นี้</small>}
                </div>
              )}
              {message.approval && <ApprovalCard
                approval={message.approval}
                busy={approvalBusy === message.id}
                onDecision={(decision) => decideApproval(message.id, decision)}
                onReviewEdited={(edited) => createDraftReview(message.id, {
                  intent: 'draft_strategy',
                  parameters: { market: edited.market, timeframe: edited.timeframe, risk: edited.riskProfile },
                }, edited)}
              />}
            </article>)}
            {busy && <div className="cc-thinking">NOVA กำลังประมวลผล…</div>}
          </div>
          {error && <p className="cc-error" role="alert">{error}</p>}
          <form className="cc-composer" onSubmit={sendMessage}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} maxLength={1200} placeholder="พิมพ์คำสั่งหรือคำถามด้วยภาษาธรรมชาติ…" aria-label="ข้อความถึง NOVA" />
            <button type="submit" disabled={busy || !input.trim()}>ส่ง ↗</button>
          </form>
          <div className="cc-chat-foot">Conversation uses the authenticated customer session · history is page-memory only</div>
        </section>

        <section className="cc-workspace">
          <div className="cc-section-title"><div><small>DYNAMIC CANVAS WORKSPACE</small><h2>Active <em>Workspace</em></h2></div><span>02 / LIVE STATE</span></div>
          <WidgetFrame title="SMC MARKET STRUCTURE" code="WIDGET / CHART">
            <div className="cc-chart-empty">
              <div className="cc-chart-grid" />
              <strong>Waiting for verified market candles</strong>
              <p>ยังไม่มี OHLC feed ที่ยืนยันผ่าน Broker Hub จึงไม่แสดงกราฟหรือ OB/FVG จำลอง</p>
              <span>SMC CHART WIDGET · DATA UNVERIFIED</span>
            </div>
          </WidgetFrame>

          <WidgetFrame title="PORTFOLIO & RISK" code="WIDGET / RISK">
            <div className="cc-stats">
              <StatusValue label="ACCOUNT EQUITY" value="—" />
              <StatusValue label="MARGIN USAGE" value="—" />
              <StatusValue label="MAX DRAWDOWN" value="—" />
            </div>
            <div className="cc-broker-state"><span className={'cc-state-dot ' + (broker.status === 'connected' ? 'ok' : '')} />
              <div><strong>EXNESS MT5 DEMO · {broker.status.toUpperCase()}</strong><p>{broker.detail}</p></div>
              <button type="button" onClick={() => void loadBroker(auth.token, auth.userId)}>ตรวจอีกครั้ง</button>
            </div>
            <p className="cc-data-note">ไม่รวมยอดหลายโบรกเกอร์จนกว่าจะมี API ที่ยืนยันตัวตนและ ownership แยกตามบัญชีได้</p>
          </WidgetFrame>

          <WidgetFrame title="SYSTEM ACTIVITY" code="WIDGET / LOG">
            <div className="cc-log-head"><span>LOCAL UI ACTIVITY</span><small>{logs.length} EVENTS</small></div>
            <div className="cc-logs" aria-live="polite">
              {logs.length === 0 && <p>ยังไม่มีเหตุการณ์ใน Session นี้</p>}
              {logs.slice().reverse().map((log) => <div className={'cc-log ' + log.level} key={log.id}>
                <time>{new Date(log.at).toLocaleTimeString()}</time><span>{log.message}</span>
              </div>)}
            </div>
            <p className="cc-data-note">นี่คือกิจกรรมที่ Frontend รับรู้ ไม่ใช่ FastMCP/Worker server logs</p>
          </WidgetFrame>
          <div className="cc-widget-catalog">ALLOWLIST: {WIDGET_ALLOWLIST.join(' · ').toUpperCase()}</div>
          <div className="cc-workspace-foot"><span>{pendingApprovals.length} PENDING REVIEW</span><span>EXECUTION DISABLED</span><span>LIVE TRADING OFF</span></div>
        </section>
      </div>
    </main>
  );
}
