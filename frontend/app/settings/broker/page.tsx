"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

type HubConnection = {
  connectionId: string;
  provider: string;
  environment: string;
  recordStatus: string;
  accountLabel?: string | null;
  readiness: string;
  bridgeAllocated: boolean;
  dataVerified: boolean;
};

type ReadOnlyAccount = {
  connected?: boolean;
  broker?: string;
  platform?: string;
  mode?: string;
  server?: string | null;
  currency?: string | null;
  balance?: number | null;
  equity?: number | null;
  margin?: number | null;
  margin_level?: number | null;
  margin_free?: number | null;
  free_margin?: number | null;
  order_submission_enabled?: boolean;
  as_of?: string | null;
};

type ReadOnlyQuote = {
  symbol: string;
  timeframe: string;
  digits?: number | null;
  tick?: { bid?: number | null; ask?: number | null; time?: string | null } | null;
  bars?: Array<{ time?: string; open?: number; high?: number; low?: number; close?: number }>;
  count?: number;
  mode?: string;
  order_submission_enabled?: boolean;
  as_of?: string | null;
};

const hubUrl = (process.env.NEXT_PUBLIC_SYSTEM_HUB_URL || "https://voom-system-hub.suwapat787.workers.dev").replace(/\/$/, "");
const supabase = getSupabaseBrowserClient();

function pendingMessage(connection: HubConnection): string {
  if (connection.recordStatus === "disabled") return "การเชื่อมต่อถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
  if (connection.recordStatus !== "connected" || !connection.bridgeAllocated) {
    return "ระบบรับคำขอแล้ว แต่ยังรอผู้ดูแลจัดสรร Bridge และ Tenant route เฉพาะบัญชีนี้";
  }
  return "";
}

export default function BrokerSettingsPage() {
  const [signedInEmail, setSignedInEmail] = useState("");
  const [account, setAccount] = useState<ReadOnlyAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [connectionStatus, setConnectionStatus] = useState<HubConnection | null>(null);
  const [quote, setQuote] = useState<ReadOnlyQuote | null>(null);

  const requireSignedInSession = useCallback(async (): Promise<string> => {
    if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error("กรุณาเข้าสู่ระบบด้วยอีเมลก่อน");
    return data.session.access_token;
  }, []);

  const getOrCreateOwnConnection = useCallback(async (accessToken: string): Promise<HubConnection> => {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    let response = await fetch(`${hubUrl}/v1/connections`, { headers, cache: "no-store" });
    let payload = await response.json().catch(() => ({})) as {
      connections?: HubConnection[];
      connection?: HubConnection;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || `อ่านรายการการเชื่อมต่อไม่สำเร็จ (HTTP ${response.status})`);
    }
    const existing = payload.connections?.find((item) => item.provider === "exness_mt5" && item.environment === "demo");
    if (existing) return existing;

    response = await fetch(`${hubUrl}/v1/connections`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      cache: "no-store",
    });
    payload = await response.json().catch(() => ({})) as {
      connections?: HubConnection[];
      connection?: HubConnection;
      error?: string;
    };
    if (!response.ok || !payload.connection) {
      throw new Error(payload.error || `สร้างคำขอ Exness Demo ไม่สำเร็จ (HTTP ${response.status})`);
    }
    return payload.connection;
  }, []);

  const loadAccount = useCallback(async () => {
    setError("");
    setNotice("");
    setAccount(null);
    setBusy(true);
    try {
      const accessToken = await requireSignedInSession();
      const connection = await getOrCreateOwnConnection(accessToken);
      setConnectionStatus(connection);
      const pending = pendingMessage(connection);
      if (pending) {
        setAccount(null);
        setNotice(pending);
        return;
      }

      const response = await fetch(`${hubUrl}/v1/connections/${encodeURIComponent(connection.connectionId)}/account`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        account?: ReadOnlyAccount;
        state?: string;
        error?: string;
        detail?: string;
        dataVerified?: boolean;
      };
      if (!response.ok) {
        const message = payload.state === "pending_provisioning" || response.status === 409
          ? "คำขอยังรอการจัดสรร Bridge เฉพาะบัญชี"
          : payload.state === "tenant_guard_rejected" || response.status === 403
            ? "คำขอถูกปฏิเสธโดย Tenant Guard: ตรวจสอบการจัดสรรสิทธิ์บัญชี"
            : payload.error || payload.detail || `อ่านบัญชีผ่าน System Hub ไม่สำเร็จ (HTTP ${response.status})`;
        throw new Error(message);
      }
      if (!payload.dataVerified || !payload.account?.connected) {
        throw new Error("Hub ติดต่อได้ แต่ยังไม่ได้ยืนยันข้อมูลบัญชี MT5 จากการอ่านจริง");
      }
      setAccount(payload.account);
      setNotice("ตรวจยืนยันการอ่านบัญชี Exness Demo ผ่าน NOVA System Integration Hub แล้ว · Read-only");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านสถานะบัญชีไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [getOrCreateOwnConnection, requireSignedInSession]);

  const loadQuote = useCallback(async () => {
    setError("");
    setNotice("");
    setQuote(null);
    setBusy(true);
    try {
      const accessToken = await requireSignedInSession();
      const connection = await getOrCreateOwnConnection(accessToken);
      setConnectionStatus(connection);
      const pending = pendingMessage(connection);
      if (pending) {
        setQuote(null);
        setNotice(pending);
        return;
      }

      const query = new URLSearchParams({ symbol: "XAUUSDm", timeframe: "M1", count: "3" });
      const response = await fetch(
        `${hubUrl}/v1/connections/${encodeURIComponent(connection.connectionId)}/quotes?${query.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({})) as {
        quote?: ReadOnlyQuote;
        state?: string;
        error?: string;
        detail?: string;
        dataVerified?: boolean;
      };
      if (!response.ok) {
        const message = payload.state === "pending_provisioning" || response.status === 409
          ? "คำขอยังรอการจัดสรร Bridge เฉพาะบัญชี"
          : payload.state === "tenant_guard_rejected" || response.status === 403
            ? "คำขออ่านราคาถูกปฏิเสธโดย Tenant Guard"
            : payload.error || payload.detail || `อ่านราคาผ่าน System Hub ไม่สำเร็จ (HTTP ${response.status})`;
        throw new Error(message);
      }
      if (!payload.dataVerified || !payload.quote) {
        throw new Error("Hub ยังไม่ได้ยืนยันข้อมูลราคาจาก MT5");
      }
      setQuote(payload.quote);
      setNotice(`อ่านราคา ${payload.quote.symbol} ${payload.quote.timeframe} ผ่าน NOVA System Integration Hub แล้ว · Read-only`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านราคาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [getOrCreateOwnConnection, requireSignedInSession]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSignedInEmail(data.session?.user.email || ""));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email || "");
      if (!session?.access_token) {
        setAccount(null);
        setQuote(null);
        setConnectionStatus(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedInEmail(""); setAccount(null); setQuote(null); setConnectionStatus(null); setNotice("ออกจากระบบ VOOM แล้ว");
  }

  return (
    <main className="broker-page">
      <style>{`
        .broker-page{max-width:850px;margin:0 auto;padding:38px 20px 70px;min-height:100vh;background:#090b12;color:#eef3fa;font-family:Inter,system-ui,sans-serif}
        .back{color:#c9f36a;text-decoration:none;font-size:13px}.eyebrow{display:block;color:#a99aff;font-size:10px;letter-spacing:2px;font-weight:800;margin-top:34px}
        h1{font-size:clamp(30px,5vw,42px);letter-spacing:-1.2px;margin:10px 0}.intro{color:#a1adbf;line-height:1.8;font-size:14px}
        .card{margin-top:22px;border:1px solid #293142;border-radius:17px;padding:22px;background:#111620}
        .heading{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#c9f36a;color:#10150a;font-weight:900;font-size:18px}
        h2{font-size:17px;margin:0 0 5px}.muted{font-size:12px;color:#9aa6b8;line-height:1.7;margin:0}
        .pill{margin-left:auto;border:1px solid #4d4932;color:#e9ce83;padding:7px 10px;border-radius:99px;font-size:10px;letter-spacing:1px}
        .btn{border:1px solid #3a4354;background:#1a2230;color:#eef3fa;border-radius:9px;padding:11px 15px;cursor:pointer;font-weight:700;font-size:12px;margin:8px 8px 0 0}
        .primary{background:#c9f36a;color:#10150a;border-color:#c9f36a}.btn:disabled{opacity:.5;cursor:not-allowed}
        input{display:block;width:100%;margin-top:7px;background:#090d15;color:#eef3fa;border:1px solid #30394a;border-radius:9px;padding:12px;font-size:14px}
        label{font-size:12px;color:#b9c3d3}.notice,.error,.warning{font-size:12px;line-height:1.7;border-radius:10px;padding:12px;margin-top:15px}
        .notice{background:#14221b;border:1px solid #34533e;color:#a8e5bd}.error{background:#271719;border:1px solid #63383c;color:#ffb8bd}
        .warning{background:#211d14;border:1px solid #51452d;color:#e7d19b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:18px}
        .metric{padding:12px;border:1px solid #2a3342;border-radius:10px}.metric span{display:block;color:#9aa6b8;font-size:11px}.metric strong{display:block;margin-top:7px;font-size:15px;overflow-wrap:anywhere}
        .foot{font-size:11px;color:#8c99ac;line-height:1.8;margin-top:20px}
      `}</style>
      <a className="back" href="/">← กลับหน้า Dashboard</a>
      <span className="eyebrow">CONNECTIONS / EXNESS MT5</span>
      <h1>เชื่อมต่อบัญชี Exness MT5</h1>
      <p className="intro">ระยะแรกใช้ Exness Demo ผ่าน MT5 บนเครื่อง Windows/VPS และอ่านข้อมูลบัญชีกับตลาดเท่านั้น หน้านี้ไม่รับรหัสผ่าน MT5 และไม่มีคำสั่งซื้อขาย</p>
      <section className="card">
        <div className="heading"><span className="mark">MT5</span><div><h2>Exness Demo · Read-only</h2><p className="muted">Windows MT5 Bridge · NOVA System Integration Hub · Supabase Auth</p></div><span className="pill">{account?.connected ? "DATA RECEIVED" : "READ-ONLY"}</span></div>
        {!supabase && <p className="warning">ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key ใน Cloudflare</p>}
        <p className="warning">หน้านี้เรียกข้อมูลผ่าน NOVA System Integration Hub โดยใช้ Supabase session ของผู้ใช้และ Tenant route เฉพาะบัญชี ไม่มีการส่งคำสั่งซื้อขาย</p>
        {connectionStatus && <p className="warning">สถานะคำขอ: {connectionStatus.recordStatus} · {connectionStatus.readiness} · {connectionStatus.bridgeAllocated ? "จัดสรร Bridge แล้ว" : "ยังไม่มี Bridge เฉพาะบัญชี"}</p>}
        {signedInEmail ? (
          <div>
            <p className="muted" style={{marginTop:18}}>เข้าสู่ระบบแล้ว: {signedInEmail}</p>
            <button className="btn primary" disabled={busy} onClick={loadAccount}>{busy ? "กำลังอ่านข้อมูล…" : "อ่านบัญชีผ่าน Hub (Read-only)"}</button>
            <button className="btn" disabled={busy} onClick={loadQuote}>{busy ? "กำลังตรวจราคา…" : "ตรวจราคาทองคำ XAUUSDm"}</button>
            <button className="btn" disabled={busy} onClick={signOut}>ออกจากระบบ VOOM</button>
            {account && <div className="grid">
              <div className="metric"><span>Broker / Platform</span><strong>{account.broker ?? "Exness"} / {account.platform ?? "MT5"}</strong></div>
              <div className="metric"><span>Server</span><strong>{account.server ?? "ยังไม่มีข้อมูล"}</strong></div>
              <div className="metric"><span>Balance</span><strong>{account.balance ?? "—"} {account.currency ?? ""}</strong></div>
              <div className="metric"><span>Equity</span><strong>{account.equity ?? "—"} {account.currency ?? ""}</strong></div>
              <div className="metric"><span>Free margin</span><strong>{account.free_margin ?? account.margin_free ?? "—"} {account.currency ?? ""}</strong></div>
              <div className="metric"><span>Mode</span><strong>{account.mode ?? "Read-only"}</strong></div>
            </div>}
            {quote && <div className="grid">
              <div className="metric"><span>Symbol / Timeframe</span><strong>{quote.symbol} / {quote.timeframe}</strong></div>
              <div className="metric"><span>Bid / Ask</span><strong>{quote.tick?.bid ?? "—"} / {quote.tick?.ask ?? "—"}</strong></div>
              <div className="metric"><span>Last candle close</span><strong>{quote.bars?.[quote.bars.length - 1]?.close ?? "—"}</strong></div>
              <div className="metric"><span>Quote timestamp</span><strong>{quote.as_of ?? quote.tick?.time ?? "—"}</strong></div>
              <div className="metric"><span>Execution</span><strong>{quote.order_submission_enabled ? "Disabled check failed" : "Disabled"}</strong></div>
            </div>}
          </div>
        ) : (
          <div style={{marginTop:22}}>
            <p className="muted">เพื่อให้ Supabase Auth ได้รับ CAPTCHA token ที่ถูกต้อง กรุณาเข้าสู่ระบบผ่านหน้าล็อกอินหลักก่อนกลับมาอ่านข้อมูลบัญชี</p>
            <a className="btn primary" href="/login">เข้าสู่ระบบพร้อม CAPTCHA →</a>
          </div>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="foot">ความปลอดภัย: ไม่มีการส่งคำสั่งซื้อขาย ปรับสถานะ position หรือโอนเงิน ใช้ Exness Demo เท่านั้นในระยะทดสอบ เก็บ bridge token ไว้ฝั่ง server/Worker secret ห้ามใส่ใน frontend หรือ GitHub</p>
      </section>
    </main>
  );
}
