import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

type Integration = { id: string; role?: string; adapter?: string; endpoint?: string; environment?: string; mode?: string; configured?: boolean; verification?: string };
type Connection = { connectionId: string; provider: string; environment: string; recordStatus: string; accountLabel?: string | null; lastVerifiedAt?: string | null; bridgeAllocated?: boolean; readiness?: string; dataVerified?: boolean; ordersEnabled?: boolean; liveTradingEnabled?: boolean };
type HubState = { integrations: Integration[]; connections: Connection[]; health: Record<string, unknown> | null };

const runtimeEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || runtimeEnv.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const hubUrl = (runtimeEnv.VITE_SYSTEM_HUB_URL || runtimeEnv.NEXT_PUBLIC_SYSTEM_HUB_URL || 'https://voom-system-hub.suwapat787.workers.dev').replace(/\/+$/, '');
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

const connectorMeta: Record<string, { title: string; description: string; group: string }> = {
  'supabase-auth': { title: 'Supabase Identity', description: 'Session identity and tenant-scoped authorization', group: 'IDENTITY' },
  'exness-mt5-demo': { title: 'Exness MT5 Demo', description: 'Read-only account and market-data adapter', group: 'BROKER' },
  'nova-ai': { title: 'NOVA AI Worker', description: 'Analysis and research runtime', group: 'AI RUNTIME' },
  'remote-mcp': { title: 'Remote MCP', description: 'Authenticated, bounded tool interface', group: 'AGENT TOOLS' }
};
function stateLabel(value?: string) {
  const labels: Record<string, string> = { data_verified: 'DATA VERIFIED', configured: 'CONFIGURED', pending_provisioning: 'PENDING PROVISIONING', pending: 'PENDING', disabled: 'DISABLED', unavailable: 'UNAVAILABLE', not_checked: 'NOT CHECKED', 'per-connection': 'VERIFY PER CONNECTION' };
  return labels[value || ''] || (value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
}

export default function IntegrationCenterPage() {
  const [snapshot, setSnapshot] = useState<HubState>({ integrations: [], connections: [], health: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const recordActivity = useCallback((message: string) => setActivity((items) => [new Date().toLocaleTimeString() + ' · ' + message, ...items].slice(0, 6)), []);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const healthResponse = await fetch(hubUrl + '/health', { cache: 'no-store' });
      const health = await healthResponse.json().catch(() => ({}));
      if (!healthResponse.ok) throw new Error('System Hub health endpoint unavailable');
      let integrations: Integration[] = [];
      let connections: Connection[] = [];
      if (supabase) {
        const { data, error: authError } = await supabase.auth.getSession();
        if (authError) throw new Error('Unable to read the current Supabase session');
        const session = data.session;
        setSessionReady(Boolean(session?.access_token));
        setSessionEmail(session?.user?.email || '');
        if (session?.access_token) {
          const headers = { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' };
          const [ir, cr] = await Promise.all([
            fetch(hubUrl + '/v1/integrations', { headers, cache: 'no-store' }),
            fetch(hubUrl + '/v1/connections', { headers, cache: 'no-store' })
          ]);
          const idata = await ir.json().catch(() => ({})), cdata = await cr.json().catch(() => ({}));
          if (!ir.ok || !cr.ok) {
            const status = !ir.ok ? ir.status : cr.status;
            throw new Error(status === 401 ? 'Session expired — sign in again' : 'Authenticated integration inventory could not be loaded');
          }
          integrations = Array.isArray(idata.integrations) ? idata.integrations : [];
          connections = Array.isArray(cdata.connections) ? cdata.connections : [];
        }
      } else { setSessionReady(false); setSessionEmail(''); }
      setSnapshot({ health, integrations, connections });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to refresh Integration Center');
    } finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(true); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const exnessConnection = useMemo(() => snapshot.connections.find((item) => item.provider === 'exness_mt5' && item.environment === 'demo'), [snapshot.connections]);

  async function requestExnessConnection() {
    if (!supabase || !window.confirm('ส่งคำขอเชื่อมต่อ Exness MT5 Demo แบบ Read-only หรือไม่? ระบบจะสร้างเพียง pending request และยังไม่เชื่อมต่อบัญชีหรือเปิดการซื้อขาย')) return;
    setBusyAction('connect-exness');
    try {
      const { data } = await supabase.auth.getSession(), token = data.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
      const response = await fetch(hubUrl + '/v1/connections', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}', cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Connection request failed');
      recordActivity(result.created ? 'Created Exness Demo pending request' : 'Loaded existing Exness Demo request');
      await refresh(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Connection request failed'); }
    finally { setBusyAction(''); }
  }

  async function verifyConnection(connection: Connection) {
    if (!supabase) return;
    setBusyAction('verify-' + connection.connectionId);
    try {
      const { data } = await supabase.auth.getSession(), token = data.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
      const response = await fetch(hubUrl + '/v1/connections/' + encodeURIComponent(connection.connectionId) + '/check', { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.state || result.error || 'Verification failed');
      recordActivity('Verified read-only connection: ' + connection.accountLabel);
      await refresh(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification failed'); }
    finally { setBusyAction(''); }
  }

  const healthReady = snapshot.health?.status === 'ready';
  const tradeLocked = snapshot.health?.ordersEnabled === false && snapshot.health?.liveTradingEnabled === false;

  return (
    <div className="nova-shell">
      <header className="nova-header"><div><p className="nova-eyebrow">NOVA CONTROL PLANE / AUTOMATION</p><h1 className="nova-title">Integration Center</h1><p className="nova-subtitle">ตรวจจับระบบ จัดการการเชื่อมต่อ ตรวจสอบสิทธิ์ และติดตามสุขภาพจาก NOVA System Hub</p></div><Link to="/" className="nova-link-button">← Dashboard</Link></header>
      <section className="nova-panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><span className="nova-pill">FULL AUTOMATION · APPROVAL-GATED</span><h2 style={{ marginTop: 12 }}>Control plane status</h2><p className="nova-small">ตรวจจับและ monitor อัตโนมัติทุก 30 วินาที · การ provision, OAuth consent และการเปลี่ยนสิทธิ์ต้องได้รับอนุมัติก่อน</p></div>
          <button className="nova-button nova-button-primary" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'กำลังตรวจสอบ…' : '↻ ตรวจสอบระบบทั้งหมด'}</button>
        </div>
        <div className="nova-form-grid" style={{ marginTop: 18 }}>
          <div className="nova-worker"><small>SYSTEM HUB</small><strong>{healthReady ? 'HEALTHY' : 'UNVERIFIED'}</strong><small>{hubUrl}</small></div>
          <div className="nova-worker"><small>USER SESSION</small><strong>{sessionReady ? 'AUTHENTICATED' : 'SIGN-IN REQUIRED'}</strong><small>{sessionEmail || 'No active Supabase session detected'}</small></div>
          <div className="nova-worker"><small>TRADING SAFETY</small><strong>{tradeLocked ? 'LOCKED · READ ONLY' : 'SAFETY STATE UNVERIFIED'}</strong><small>Orders / execution / live trading must remain OFF</small></div>
        </div>
        {error && <div className="nova-notice" role="alert" style={{ marginTop: 14 }}>{error}</div>}
        {!supabase && <div className="nova-notice" style={{ marginTop: 14 }}>ยังไม่ได้ตั้งค่า public Supabase URL / anon key ใน frontend environment — ระบบจะไม่ขอหรือรับ secret ผ่านหน้านี้</div>}
      </section>

      <section className="nova-panel" style={{ marginBottom: 16 }}>
        <div className="nova-section-heading"><div><p className="nova-eyebrow">DISCOVERY / REGISTRY</p><h2>ระบบที่ตรวจพบ</h2></div><span className="nova-pill">{snapshot.integrations.length} REGISTERED</span></div>
        {!sessionReady ? <div className="nova-empty">ต้องเข้าสู่ระบบ Supabase ก่อนเพื่ออ่าน Integration Registry และ connection records ที่ผูกกับบัญชีของคุณ</div> :
          snapshot.integrations.length === 0 ? <div className="nova-empty">ไม่พบรายการ integration จาก Hub</div> :
          <div className="nova-worker-grid">{snapshot.integrations.map((integration) => {
            const meta = connectorMeta[integration.id] || { title: integration.id, description: integration.adapter || 'Registered integration', group: 'INTEGRATION' };
            const verification = integration.id === 'exness-mt5-demo' ? (exnessConnection?.readiness || integration.verification) : integration.verification;
            return <article className="nova-worker" key={integration.id}><small>{meta.group}</small><strong>{meta.title}</strong><small>{meta.description}</small><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10, alignItems: 'center' }}><span className="nova-pill">{integration.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span><span className="nova-small">{stateLabel(verification)}</span></div>{integration.mode && <small>Scope: {integration.mode}</small>}</article>;
          })}</div>}
      </section>

      <section className="nova-grid" style={{ marginBottom: 16 }}>
        <div className="nova-panel"><p className="nova-eyebrow">CONNECTION LIFECYCLE</p><h2>Exness MT5 Demo</h2><p className="nova-small">เริ่มคำขอแบบ pending → ผู้ดูแลจัดสรร route → ทดสอบ account read → จึงแสดง Data Verified</p>
          {exnessConnection ? <div className="nova-notice" style={{ marginTop: 14 }}><strong>{stateLabel(exnessConnection.readiness)}</strong><p>{exnessConnection.accountLabel || 'Exness MT5 Demo'} · {exnessConnection.recordStatus} · Route {exnessConnection.bridgeAllocated ? 'allocated' : 'not allocated'}</p><p>Data verified: {exnessConnection.dataVerified ? 'YES' : 'NO'} · Last verified: {exnessConnection.lastVerifiedAt || 'Not yet'}</p><button className="nova-button" type="button" disabled={!exnessConnection.bridgeAllocated || busyAction !== ''} onClick={() => void verifyConnection(exnessConnection)} style={{ marginTop: 10 }}>{busyAction === 'verify-' + exnessConnection.connectionId ? 'กำลังทดสอบ…' : 'ทดสอบ Read-only'}</button></div> :
            <button className="nova-button nova-button-primary" type="button" disabled={!sessionReady || busyAction !== ''} onClick={() => void requestExnessConnection()} style={{ marginTop: 14 }}>{busyAction === 'connect-exness' ? 'กำลังส่งคำขอ…' : 'ขอเชื่อมต่อ Exness Demo'}</button>}
          <p className="nova-small" style={{ marginTop: 12 }}>การกดปุ่มนี้สร้างเฉพาะคำขอ pending เท่านั้น ไม่มีการส่งรหัสผ่านหรือ API secret และไม่เปิดคำสั่งซื้อขาย</p>
        </div>
        <div className="nova-panel"><p className="nova-eyebrow">AUTOMATION POLICY</p><h2>Approval Gate</h2><ul className="nova-list" style={{ marginTop: 12 }}><li><b>Auto Detect</b> · อ่าน registry และ health status อัตโนมัติ</li><li><b>Auto Monitor</b> · refresh สถานะทุก 30 วินาที</li><li><b>Auto Configure</b> · เตรียม configuration เฉพาะ integration ที่มี adapter รองรับ</li><li><b>Human Approval</b> · OAuth consent, credential provisioning, tenant route และ permission changes</li><li><b>Fail Closed</b> · ไม่พบ session หรือ Hub ติดต่อไม่ได้จะไม่เชื่อมต่อแทนผู้ใช้</li></ul></div>
      </section>

      <section className="nova-panel"><div className="nova-section-heading"><div><p className="nova-eyebrow">AUDIT / ACTIVITY</p><h2>กิจกรรมในเซสชันนี้</h2></div><span className="nova-pill">LOCAL VIEW</span></div><p className="nova-small">รายการด้านล่างเป็น activity ในหน้าปัจจุบันเท่านั้น ยังไม่ใช่ persistent audit log จาก backend</p>
        {activity.length ? activity.map((entry, index) => <div className="nova-worker" key={index}><strong>{entry}</strong></div>) : <div className="nova-empty">ยังไม่มีกิจกรรมในเซสชันนี้</div>}
      </section>
      <p className="nova-small" style={{ marginTop: 16 }}>Security invariant: ordersEnabled=false · executionEnabled=false · liveTradingEnabled=false. ไม่มี order, transfer, deposit หรือ withdrawal capability ใน Integration Center</p>
    </div>
  );
}
