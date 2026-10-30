'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import IntentResult from '../../components/intent-result';
import { buildBoundedChatHistory } from '../../lib/chat-history.mjs';

const APPROVAL_REVIEW_ENABLED = process.env.NEXT_PUBLIC_NOVA_APPROVALS_ENABLED === 'true';

function intentFromProposal(proposal) {
  const parameters = {
    market: proposal.market ?? null,
    timeframe: proposal.timeframe ?? null,
    risk: proposal.riskProfile ?? null,
  };
  return {
    schemaVersion: 'nova.intent.v1',
    intent: 'draft_strategy',
    parameters,
    component: {
      type: 'strategy_draft',
      ...parameters,
      executionEnabled: false,
      liveTradingEnabled: false,
    },
  };
}

async function loadPendingReviewMessages(accessToken) {
  const response = await fetch('/api/agent/threads?state=awaiting_review', {
    headers: { Authorization: 'Bearer ' + accessToken },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  const threads = Array.isArray(payload.threads) ? payload.threads.slice(0, 20) : [];
  const restored = await Promise.all(threads.map(async (thread) => {
    const result = await fetch('/api/agent/threads/' + encodeURIComponent(thread.id) + '/approvals', {
      headers: { Authorization: 'Bearer ' + accessToken },
      cache: 'no-store',
    });
    if (!result.ok) return null;
    const body = await result.json().catch(() => ({}));
    const approval = Array.isArray(body.approvals) ? body.approvals.find((item) => item.status === 'pending') : null;
    if (!approval) return null;
    return {
      id: 'restored-review-' + approval.id,
      role: 'assistant',
      content: 'พบคำขอตรวจทานร่างงานวิจัยที่บันทึกไว้ สามารถยืนยัน ปฏิเสธ หรือแก้ไขได้จนกว่าจะหมดอายุ',
      intent: intentFromProposal(approval.proposal),
      approval,
      threadId: thread.id,
      restoredReview: true,
    };
  }));
  return restored.filter(Boolean);
}

const suggestions = [
  'อธิบายเงื่อนไข EMA 12/26 และ RSI 14 สำหรับ XAU/USD',
  'ช่วยตรวจความเสี่ยงและเงื่อนไขยกเลิกสมมติฐานกลยุทธ์',
  'อธิบายว่าควรตรวจอะไรบ้างก่อนเชื่อผล Backtest',
];

export default function NovaChatPage() {
  const router = useRouter();
  const listRef = useRef(null);
  const [authState, setAuthState] = useState('checking');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      localOnly: true,
      content: 'สวัสดีครับ ผมคือ NOVA Research Assistant ช่วยอธิบายแนวคิดตลาด กลยุทธ์ และการจัดการความเสี่ยงได้ โดยจะไม่อ้างว่าเห็นราคาสดหรือข้อมูลบัญชีที่ยังไม่ได้เชื่อมต่อจริง และไม่สามารถส่งคำสั่งซื้อขายได้',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [approvalBusyId, setApprovalBusyId] = useState(null);

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
      if (APPROVAL_REVIEW_ENABLED) {
        void loadPendingReviewMessages(data.session.access_token)
          .then((pending) => {
            if (!active || !pending.length) return;
            setMessages((current) => [
              ...current.filter((message) => !message.restoredReview),
              ...pending,
            ]);
          })
          .catch(() => {
            // Review restore is best-effort; private endpoints still fail closed.
          });
      }
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function sendMessage(event) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || busy || authState !== 'ready') return;
    if (content.length > 1200) {
      setError('คำถามต้องไม่เกิน 1,200 ตัวอักษร');
      return;
    }

    setError('');
    setInput('');
    setBusy(true);
    const userMessage = { id: crypto.randomUUID(), role: 'user', content };
    const history = buildBoundedChatHistory(messages, userMessage);
    setMessages((current) => [...current, userMessage]);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + data.session.access_token,
        },
        body: JSON.stringify({ messages: history }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessages = {
          ai_unavailable: 'บริการ AI ยังไม่พร้อมใช้งาน กรุณาตรวจสถานะ NOVA AI Worker และ Cloudflare Workers AI binding',
          authentication_required: 'กรุณาเข้าสู่ระบบใหม่ก่อนใช้ NOVA Chat',
          invalid_or_expired_session: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
          authentication_not_configured: 'ระบบยืนยันตัวตนยังตั้งค่าไม่ครบ',
          ai_provider_unavailable: 'ติดต่อผู้ให้บริการ AI ไม่สำเร็จ ระบบไม่ได้สร้างคำตอบจำลองขึ้นมาแทน',
        };
        throw new Error(errorMessages[payload.error] || 'ส่งคำถามไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
      if (typeof payload.message !== 'string' || !payload.message.trim()) {
        throw new Error('AI Worker ไม่ได้ส่งคำตอบที่ถูกต้องกลับมา');
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: payload.message,
        intent: payload.intent || null,
      }]);
    } catch (err) {
      setError(err?.message || 'ไม่สามารถติดต่อ NOVA AI ได้ในขณะนี้');
    } finally {
      setBusy(false);
    }
  }

  async function requestDraftReview(messageId, intent, revisedProposal = null) {
    if (!APPROVAL_REVIEW_ENABLED || !intent || intent.intent !== 'draft_strategy') return;
    setError('');
    setApprovalBusyId(messageId);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        router.replace('/login');
        return;
      }
      const token = data.session.access_token;
      const threadResponse = await fetch('/api/agent/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ title: 'NOVA strategy draft review' }),
        cache: 'no-store',
      });
      const threadPayload = await threadResponse.json().catch(() => ({}));
      if (!threadResponse.ok || !threadPayload.thread?.id) {
        throw new Error('สร้างเธรดตรวจทานไม่สำเร็จ ระบบอาจยังไม่ได้เปิดใช้งาน approval staging');
      }

      const proposal = revisedProposal || {
        title: 'NOVA Strategy Draft',
        summary: 'ร่างเพื่อการวิจัยเท่านั้น ยังไม่ผ่าน backtest และไม่มีคำสั่งซื้อขาย',
        market: intent.parameters?.market ?? null,
        timeframe: intent.parameters?.timeframe ?? null,
        riskProfile: intent.parameters?.risk ?? null,
      };
      const approvalResponse = await fetch(
        '/api/agent/threads/' + encodeURIComponent(threadPayload.thread.id) + '/approvals',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ requestType: 'strategy_draft_review', proposal }),
          cache: 'no-store',
        },
      );
      const approvalPayload = await approvalResponse.json().catch(() => ({}));
      if (!approvalResponse.ok || !approvalPayload.approval?.id) {
        throw new Error(approvalPayload.error === 'approval_workflow_disabled'
          ? 'ระบบตรวจทานยังปิดอยู่จนกว่าจะเตรียม schema และ staging ผ่าน'
          : 'บันทึกคำขอตรวจทานไม่สำเร็จ กรุณาตรวจ schema และสถานะ staging');
      }

      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, approval: approvalPayload.approval, threadId: threadPayload.thread.id }
        : message));
    } catch (err) {
      setError(err?.message || 'สร้างคำขอตรวจทานไม่สำเร็จ');
    } finally {
      setApprovalBusyId(null);
    }
  }

  async function decideDraftReview(messageId, decisionInput) {
    const target = messages.find((message) => message.id === messageId);
    if (!target?.approval?.id || !APPROVAL_REVIEW_ENABLED) return;
    setError('');
    setApprovalBusyId(messageId);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        router.replace('/login');
        return;
      }
      const response = await fetch('/api/agent/approvals/' + encodeURIComponent(target.approval.id) + '/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify(decisionInput),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.error === 'approval_expired') {
          setMessages((current) => current.map((message) => message.id === messageId
            ? { ...message, approval: { ...message.approval, status: 'expired' } }
            : message));
          return;
        }
        if (payload.error === 'approval_not_expired') {
          setError('เวลาในอุปกรณ์เร็วกว่าฐานข้อมูล คำขอนี้ยังไม่หมดอายุตามเวลาเซิร์ฟเวอร์ จึงยังไม่เปลี่ยนสถานะ');
          return;
        }
        throw new Error(payload.error === 'approval_already_resolved'
          ? 'คำขอนี้ถูกตรวจทานไปแล้ว กรุณารีเฟรชสถานะ'
          : 'บันทึกผลตรวจทานไม่สำเร็จ กรุณาตรวจสถานะการ Login และ staging');
      }
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, approval: { ...message.approval, ...payload.approval } }
        : message));
    } catch (err) {
      setError(err?.message || 'บันทึกผลตรวจทานไม่สำเร็จ');
    } finally {
      setApprovalBusyId(null);
    }
  }

  function clearConversation() {
    setMessages((current) => current.filter((item) => item.localOnly || item.restoredReview || item.approval?.status === 'pending'));
    setError('');
  }

  return (
    <main className="nova-chat-page">
      <section className="nova-chat-heading">
        <div>
          <div className="nova-chat-kicker"><span /> NOVA INTELLIGENCE / CONVERSATION</div>
          <h1>NOVA <em>AI Chat</em></h1>
          <p>ผู้ช่วยวิจัยตลาดและกลยุทธ์ภายใน VOOM SYSTEM — สนทนาในเว็บเดียวกับ Dashboard</p>
        </div>
        <div className="nova-chat-safety"><span /> READ-ONLY <b>·</b> LIVE TRADING OFF</div>
      </section>

      {authState === 'misconfigured' && (
        <div className="nova-chat-alert" role="alert">
          ไม่พบการตั้งค่า Supabase สำหรับ Frontend จึงยังเปิดใช้งาน AI Chat ไม่ได้ กรุณาตรวจ environment ของเว็บโดยไม่เปิดเผยค่า Secret
        </div>
      )}
      {authState === 'error' && <div className="nova-chat-alert" role="alert">{error}</div>}
      {authState === 'checking' && <div className="nova-chat-info" role="status">กำลังตรวจสอบสถานะ Login…</div>}
      {authState === 'signed-out' && <div className="nova-chat-info" role="status">กำลังกลับไปหน้า Login…</div>}

      <section className="nova-chat-workspace">
        <div className="nova-chat-main">
          <div className="nova-chat-toolbar">
            <div><span className="nova-chat-led" /><div><strong>RESEARCH ASSISTANT</strong><small>ตอบจากโมเดล AI เมื่อผู้ให้บริการพร้อมใช้งาน</small></div></div>
            <button type="button" className="nova-chat-clear" onClick={clearConversation} disabled={busy}>ล้างบทสนทนา</button>
          </div>

          <div className="nova-chat-messages" ref={listRef} aria-live="polite" aria-label="บทสนทนา NOVA">
            {messages.map((message) => (
              <article className={'nova-chat-message ' + (message.role === 'user' ? 'user' : 'assistant')} key={message.id}>
                <div className="nova-chat-avatar">{message.role === 'user' ? 'YOU' : 'N'}</div>
                <div className="nova-chat-bubble">
                  <div className="nova-chat-message-label">{message.role === 'user' ? 'YOU' : 'NOVA AI'}</div>
                  <p>{message.content}</p>
                  {message.role === 'assistant' && message.intent && (
                    <IntentResult
                      intent={message.intent}
                      approval={message.approval || null}
                      reviewEnabled={APPROVAL_REVIEW_ENABLED}
                      approvalBusy={approvalBusyId === message.id}
                      onRequestReview={() => requestDraftReview(message.id, message.intent)}
                      onDecision={(decision) => decideDraftReview(message.id, decision)}
                      onReviewEdited={(proposal) => requestDraftReview(message.id, message.intent, proposal)}
                    />
                  )}
                </div>
              </article>
            ))}
            {busy && (
              <article className="nova-chat-message assistant" role="status">
                <div className="nova-chat-avatar">N</div>
                <div className="nova-chat-bubble"><div className="nova-chat-message-label">NOVA AI</div><p>กำลังวิเคราะห์คำถาม…</p></div>
              </article>
            )}
          </div>

          {error && <div className="nova-chat-alert" role="alert">{error}</div>}

          <form className="nova-chat-composer" onSubmit={sendMessage}>
            <label className="nova-chat-input-label" htmlFor="nova-chat-input">MESSAGE NOVA</label>
            <textarea
              id="nova-chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1200}
              rows={3}
              placeholder="ถามเกี่ยวกับกลยุทธ์ ความเสี่ยง หรือผล Backtest…"
              disabled={busy || authState !== 'ready'}
              required
            />
            <div className="nova-chat-compose-footer">
              <span>{input.length}/1200 · ห้ามส่งรหัสผ่านหรือ API Secret</span>
              <button className="nova-chat-send" type="submit" disabled={busy || authState !== 'ready' || !input.trim()}>
                {busy ? 'กำลังส่ง…' : 'ส่งคำถาม'} <span>↗</span>
              </button>
            </div>
          </form>
        </div>

        <aside className="nova-chat-aside">
          <div className="nova-chat-aside-header"><span>✦</span><strong>QUICK PROMPTS</strong></div>
          <p>เลือกหัวข้อเพื่อเริ่มต้นสนทนา</p>
          {suggestions.map((suggestion) => (
            <button type="button" className="nova-chat-prompt" key={suggestion} onClick={() => setInput(suggestion)} disabled={busy || authState !== 'ready'}>
              <span>↗</span>{suggestion}
            </button>
          ))}
          <div className="nova-chat-divider" />
          <div className="nova-chat-aside-header"><span>⌑</span><strong>SAFETY BOUNDARIES</strong></div>
          <ul>
            <li>ไม่มีการส่งคำสั่งซื้อขายจากแชท</li>
            <li>ไม่อ้างว่ามีราคาสดโดยไม่มี feed ที่ตรวจสอบแล้ว</li>
            <li>ไม่เปิดเผยข้อมูลบัญชีส่วนตัวของผู้ใช้อื่น</li>
            <li>ประวัติแชทเก็บในหน้าเว็บชั่วคราว และหายเมื่อรีเฟรช</li>
          </ul>
          <Link href="/gen-ai" className="nova-chat-secondary-link">ไป AI Analysis <span>→</span></Link>
        </aside>
      </section>
      <footer className="nova-chat-footer">VOOM SYSTEM · NOVA AI <span>MODEL AVAILABILITY IS VERIFIED PER REQUEST</span></footer>
    </main>
  );
}
