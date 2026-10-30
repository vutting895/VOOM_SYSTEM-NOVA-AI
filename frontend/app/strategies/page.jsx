'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import {
  CUSTOMER_ANALYSIS_STYLES,
  CUSTOMER_MARKETS,
  CUSTOMER_RISK_PROFILES,
  CUSTOMER_STRATEGIES,
  customerWorkspaceStorageKey,
  normalizeCustomerWorkspacePreferences,
} from '../../lib/customer-strategies.mjs';
import './strategy-selection.css';

const EMPTY_DRAFT = Object.freeze({
  strategyId: '',
  market: 'XAU/USD',
  riskProfile: 'low',
  analysisStyle: 'guided',
});

export default function StrategySelectionPage() {
  const router = useRouter();
  const [auth, setAuth] = useState({ state: 'checking', userId: '', email: '' });
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    let currentUserId = null;
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuth({ state: 'misconfigured', userId: '', email: '' });
      return () => { active = false; };
    }

    const applySession = (session) => {
      const userId = session?.user?.id;
      if (!userId) {
        currentUserId = null;
        setAuth({ state: 'signed-out', userId: '', email: '' });
        router.replace('/login');
        return;
      }

      if (currentUserId !== userId) {
        currentUserId = userId;
        let stored = null;
        const storageKey = customerWorkspaceStorageKey(userId);
        try {
          if (storageKey) {
            stored = normalizeCustomerWorkspacePreferences(
              JSON.parse(window.localStorage.getItem(storageKey) || 'null'),
            );
          }
        } catch {
          stored = null;
        }
        setDraft(stored ? { ...EMPTY_DRAFT, ...stored } : { ...EMPTY_DRAFT });
        setError('');
      }

      setAuth({
        state: 'ready',
        userId,
        email: session.user.email || 'Signed-in customer',
      });
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setAuth({ state: 'error', userId: '', email: '' });
        setError('ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
        return;
      }
      applySession(data?.session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  function chooseStrategy(strategy) {
    setDraft((current) => ({
      ...current,
      strategyId: strategy.id,
      market: strategy.defaultMarket,
    }));
    setError('');
  }

  function createWorkspace() {
    if (auth.state !== 'ready' || !auth.userId || saving) return;
    const preferences = normalizeCustomerWorkspacePreferences(draft);
    const storageKey = customerWorkspaceStorageKey(auth.userId);
    if (!preferences || !storageKey) {
      setError('กรุณาเลือกกลยุทธ์ที่ต้องการก่อนสร้าง Workspace');
      return;
    }

    setSaving(true);
    setError('');
    try {
      // Preferences are display defaults only. They are not authorization data.
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
      router.push('/command-center');
    } catch {
      setError('อุปกรณ์นี้ไม่อนุญาตให้บันทึกการตั้งค่า กรุณาเปิดใช้ Browser Storage แล้วลองอีกครั้ง');
      setSaving(false);
    }
  }

  if (auth.state === 'checking') {
    return <main className="strategy-loading">กำลังตรวจสอบสิทธิ์และเตรียมหน้าสร้าง Workspace…</main>;
  }

  if (auth.state !== 'ready') {
    return <main className="strategy-loading" role="alert">
      {auth.state === 'misconfigured'
        ? 'ยังไม่ได้ตั้งค่า Supabase Auth สำหรับหน้าเว็บนี้'
        : error || 'กรุณาเข้าสู่ระบบใหม่เพื่อเลือกกลยุทธ์'}
    </main>;
  }

  const selectedStrategy = CUSTOMER_STRATEGIES.find((strategy) => strategy.id === draft.strategyId);

  return (
    <main className="strategy-shell">
      <header className="strategy-header">
        <Link className="strategy-brand" href="/" aria-label="VOOM_SYSTEM home">
          <span className="strategy-brand-mark">V</span>
          <span><strong>VOOM_SYSTEM</strong><small>NOVA · INTELLIGENT WORKSPACE</small></span>
        </Link>
        <div className="strategy-header-meta">
          <span className="strategy-customer">{auth.email}</span>
          <span className="strategy-safe-pill"><i /> READ-ONLY · LIVE TRADING OFF</span>
        </div>
      </header>

      <section className="strategy-intro">
        <p className="strategy-eyebrow">CUSTOMER ONBOARDING / STEP 01</p>
        <h1>Choose your <em>strategy</em></h1>
        <p>เลือกแนวทางการวิจัยที่ต้องการ แล้ว VOOM_SYSTEM จะจัด Workspace และผู้ช่วย NOVA AI ให้เป็นพื้นที่ส่วนตัวของบัญชีที่เข้าสู่ระบบอยู่</p>
      </section>

      <div className="strategy-layout">
        <section className="strategy-picker" aria-labelledby="strategy-picker-title">
          <div className="strategy-section-head">
            <div><small>STRATEGY LIBRARY</small><h2 id="strategy-picker-title">เลือกกลยุทธ์หลัก</h2></div>
            <span>03 OPTIONS</span>
          </div>

          <div className="strategy-cards">
            {CUSTOMER_STRATEGIES.map((strategy, index) => {
              const selected = draft.strategyId === strategy.id;
              return (
                <button
                  type="button"
                  key={strategy.id}
                  className={'strategy-card' + (selected ? ' selected' : '')}
                  aria-pressed={selected}
                  onClick={() => chooseStrategy(strategy)}
                >
                  <div className="strategy-card-top"><span>{strategy.code}</span><span className="strategy-select-indicator">{selected ? 'SELECTED' : 'SELECT'}</span></div>
                  <span className="strategy-card-index">0{index + 1}</span>
                  <strong>{strategy.name}</strong>
                  <p>{strategy.description}</p>
                  <span className={'strategy-card-status ' + strategy.status}>{strategy.statusLabel}</span>
                  <p className="strategy-card-status-detail">{strategy.statusDetail}</p>
                  <div className="strategy-card-focus">{strategy.focus}</div>
                  <div className="strategy-card-meta"><span>{strategy.markets}</span><span>{strategy.timeframe}</span></div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="strategy-preferences">
          <div className="strategy-section-head">
            <div><small>PERSONALIZATION</small><h2>ตั้งค่า Workspace</h2></div>
            <span>02 / 02</span>
          </div>

          <div className="strategy-selected-preview">
            <span className="strategy-preview-orb" aria-hidden="true">V</span>
            <div><small>YOUR SELECTION</small><strong>{selectedStrategy?.name || 'ยังไม่ได้เลือกกลยุทธ์'}</strong><p>{selectedStrategy?.focus || 'เลือกการ์ดกลยุทธ์เพื่อดูสรุป'}</p>{selectedStrategy && <span className={'strategy-preview-status ' + selectedStrategy.status}>{selectedStrategy.statusLabel}</span>}</div>
          </div>

          <label className="strategy-field">
            <span>ตลาดเริ่มต้น</span>
            <select value={draft.market} onChange={(event) => setDraft((current) => ({ ...current, market: event.target.value }))}>
              {CUSTOMER_MARKETS.map((market) => <option value={market.value} key={market.value}>{market.label}</option>)}
            </select>
          </label>

          <label className="strategy-field">
            <span>Risk Profile สำหรับการวิเคราะห์</span>
            <select value={draft.riskProfile} onChange={(event) => setDraft((current) => ({ ...current, riskProfile: event.target.value }))}>
              {CUSTOMER_RISK_PROFILES.map((profile) => <option value={profile.value} key={profile.value}>{profile.label}</option>)}
            </select>
            <small>{CUSTOMER_RISK_PROFILES.find((profile) => profile.value === draft.riskProfile)?.detail}</small>
          </label>

          <label className="strategy-field">
            <span>รูปแบบคำอธิบายของ NOVA AI</span>
            <select value={draft.analysisStyle} onChange={(event) => setDraft((current) => ({ ...current, analysisStyle: event.target.value }))}>
              {CUSTOMER_ANALYSIS_STYLES.map((style) => <option value={style.value} key={style.value}>{style.label}</option>)}
            </select>
          </label>

          <div className="strategy-preference-note">
            <strong>PRIVATE BY ACCOUNT</strong>
            <p>ข้อมูลการเลือกนี้แยกตาม User ID ที่เข้าสู่ระบบ เก็บใน Browser ของอุปกรณ์นี้เท่านั้น ยังไม่ Sync ข้ามอุปกรณ์ และไม่มีผลต่อสิทธิ์เข้าถึงข้อมูลหรือการส่งคำสั่งซื้อขาย</p>
          </div>

          {error && <p className="strategy-error" role="alert">{error}</p>}
          <button className="strategy-create-button" type="button" onClick={createWorkspace} disabled={!selectedStrategy || saving}>
            {saving ? 'กำลังเปิด Workspace…' : 'Create my private dashboard'} <span>↗</span>
          </button>
          <Link className="strategy-back-link" href="/command-center">กลับไปยัง Private Dashboard</Link>
        </aside>
      </div>

      <footer className="strategy-footer">
        <span>VOOM_SYSTEM · NOVA PERSONAL WORKSPACE</span>
        <span>RESEARCH ONLY · ORDER SUBMISSION DISABLED</span>
      </footer>
    </main>
  );
}
