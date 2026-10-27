"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

type ReadOnlyAccount = {
  connected?: boolean;
  broker?: string;
  platform?: string;
  mode?: string;
  server?: string;
  currency?: string;
  balance?: number | string;
  equity?: number | string;
  margin?: number | string;
  margin_free?: number | string;
  free_margin?: number | string;
  error?: string;
};

const proxyUrl = (process.env.NEXT_PUBLIC_MT5_READONLY_PROXY_URL || "https://voom-mt5-readonly-proxy.suwapat787.workers.dev").replace(/\/$/, "");
const supabase = getSupabaseBrowserClient();

export default function BrokerSettingsPage() {
  const [email, setEmail] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [account, setAccount] = useState<ReadOnlyAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const requireSignedInSession = useCallback(async () => {
    if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key ใน Cloudflare");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error("กรุณาเข้าสู่ระบบด้วยอีเมลก่อน");
    return true;
  }, []);

  const loadAccount = useCallback(async () => {
    setError("");
    if (!proxyUrl) {
      setError("ยังไม่ได้ตั้งค่า URL ของ MT5 read-only proxy");
      return;
    }
    setBusy(true);
    try {
      await requireSignedInSession();
      const response = await fetch(`${proxyUrl}/api/account`, {
        credentials: "include",
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Cloudflare Access ยังไม่ได้ยืนยันเซสชันสำหรับ Proxy กรุณากด “เปิดการยืนยันสิทธิ์ Cloudflare Access” แล้วเข้าสู่ระบบก่อนลองอีกครั้ง");
      }
      const data = await response.json() as ReadOnlyAccount;
      if (!response.ok) {
        const message = data.error === "access_login_required" || data.error === "invalid_access_assertion"
          ? "กรุณายืนยัน Cloudflare Access ก่อนอ่านข้อมูลบัญชี"
          : data.error === "user_not_allowed"
            ? "อีเมลนี้ไม่มีสิทธิ์เข้าถึงบัญชี Broker"
            : data.error || `อ่านสถานะ Exness MT5 ไม่สำเร็จ (HTTP ${response.status})`;
        throw new Error(message);
      }
      if (!data.connected) throw new Error("Proxy ติดต่อได้ แต่ MT5 terminal ยังไม่ยืนยันการเชื่อมต่อบัญชี");
      setAccount(data);
      setNotice("ได้รับข้อมูลบัญชีจาก Exness MT5 ผ่าน Proxy และตรวจสิทธิ์ผู้ใช้แล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านสถานะบัญชีไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [requireSignedInSession]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSignedInEmail(data.session?.user.email || ""));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email || "");
      if (!session?.access_token) setAccount(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key ใน Cloudflare");
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/settings/broker` },
      });
      if (authError) throw authError;
      setNotice("ส่งลิงก์เข้าสู่ระบบไปยังอีเมลแล้ว กรุณาเปิดลิงก์จากอุปกรณ์นี้");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งลิงก์เข้าสู่ระบบไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedInEmail(""); setAccount(null); setNotice("ออกจากระบบ VOOM แล้ว");
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
        <div className="heading"><span className="mark">MT5</span><div><h2>Exness Demo · Read-only</h2><p className="muted">Windows MT5 Bridge · Protected Cloudflare Proxy · Supabase Auth</p></div><span className="pill">{account?.connected ? "DATA RECEIVED" : "READ-ONLY"}</span></div>
        {!supabase && <p className="warning">ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key ใน Cloudflare</p>}
        <p className="warning">ต้องเข้าสู่ระบบ VOOM ด้วยอีเมล และยืนยัน Cloudflare Access สำหรับ proxy ก่อนอ่านข้อมูลบัญชี</p>
        <a className="btn" href={`${proxyUrl}/health`} target="_blank" rel="noopener noreferrer">เปิดการยืนยันสิทธิ์ Cloudflare Access</a>
        <p className="warning">Proxy endpoint ถูก Deploy แล้ว แต่สถานะบัญชีจะยืนยันได้เมื่อ Windows MT5 Bridge และบัญชี Exness Demo ออนไลน์</p>
        {signedInEmail ? (
          <div>
            <p className="muted" style={{marginTop:18}}>เข้าสู่ระบบแล้ว: {signedInEmail}</p>
            <button className="btn primary" disabled={busy} onClick={loadAccount}>{busy ? "กำลังอ่านข้อมูล…" : "ตรวจสถานะบัญชี (Read-only)"}</button>
            <button className="btn" disabled={busy} onClick={signOut}>ออกจากระบบ VOOM</button>
            {account && <div className="grid">
              <div className="metric"><span>Broker / Platform</span><strong>{account.broker ?? "Exness"} / {account.platform ?? "MT5"}</strong></div>
              <div className="metric"><span>Server</span><strong>{account.server ?? "ยังไม่มีข้อมูล"}</strong></div>
              <div className="metric"><span>Balance</span><strong>{account.balance ?? "—"} {account.currency ?? ""}</strong></div>
              <div className="metric"><span>Equity</span><strong>{account.equity ?? "—"} {account.currency ?? ""}</strong></div>
              <div className="metric"><span>Free margin</span><strong>{account.free_margin ?? account.margin_free ?? "—"} {account.currency ?? ""}</strong></div>
              <div className="metric"><span>Mode</span><strong>{account.mode ?? "Read-only"}</strong></div>
            </div>}
          </div>
        ) : (
          <form onSubmit={sendMagicLink} style={{marginTop:22}}>
            <label>อีเมลบัญชี VOOM_SYSTEM<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <button className="btn primary" disabled={busy || !supabase} type="submit">{busy ? "กำลังส่ง…" : "ส่งลิงก์เข้าสู่ระบบทางอีเมล"}</button>
          </form>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="foot">ความปลอดภัย: ไม่มีการส่งคำสั่งซื้อขาย ปรับสถานะ position หรือโอนเงิน ใช้ Exness Demo เท่านั้นในระยะทดสอบ เก็บ bridge token ไว้ฝั่ง server/Worker secret ห้ามใส่ใน frontend หรือ GitHub</p>
      </section>
    </main>
  );
}
