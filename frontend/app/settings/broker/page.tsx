"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

type AccountInfo = {
  connected: boolean;
  environment?: string;
  account?: {
    status?: string;
    currency?: string;
    cash?: string;
    portfolio_value?: string;
    buying_power?: string;
    equity?: string;
  };
  error?: string;
};

const workerUrl = (process.env.NEXT_PUBLIC_ALPACA_WORKER_URL || "").replace(/\/$/, "");
const supabase = getSupabaseBrowserClient();

export default function BrokerSettingsPage() {
  const [email, setEmail] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const getToken = useCallback(async () => {
    if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key ใน Vercel");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error("กรุณาเข้าสู่ระบบด้วยอีเมลก่อน");
    return data.session.access_token;
  }, []);

  const loadAccount = useCallback(async () => {
    setError("");
    if (!workerUrl) {
      setError("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_ALPACA_WORKER_URL ให้ชี้ไปยัง Cloudflare Worker");
      return;
    }
    try {
      const token = await getToken();
      const response = await fetch(`${workerUrl}/api/alpaca/account`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json() as AccountInfo;
      if (!response.ok) throw new Error(data.error || "อ่านสถานะบัญชี Alpaca ไม่สำเร็จ");
      setAccount(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดขณะอ่านบัญชี");
    }
  }, [getToken]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSignedInEmail(data.session?.user.email || "");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email || "");
      if (session?.access_token) void loadAccount();
      else setAccount(null);
    });
    const status = new URLSearchParams(window.location.search).get("alpaca");
    if (status === "connected") {
      setNotice("Alpaca Paper เชื่อมต่อผ่าน OAuth แล้ว กำลังอ่านข้อมูลบัญชี");
    } else if (status === "token_exchange_failed_401") {
      setError("Alpaca ปฏิเสธ OAuth client (HTTP 401): ตรวจว่า ALPACA_CLIENT_ID และ ALPACA_CLIENT_SECRET เป็นคู่จาก OAuth App เดียวกัน ไม่ใช่ API Key/Secret และตรวจว่าแอปยัง Active อยู่");
    } else if (status === "token_exchange_failed_400") {
      setError("Alpaca ปฏิเสธรหัสอนุญาต (HTTP 400): ขอเชื่อมต่อใหม่ แล้วตรวจว่า Redirect URI ใน Alpaca ตรงกับ https://voom-alpaca-oauth.suwapat787.workers.dev/api/alpaca/callback ทุกตัวอักษร");
    } else if (status?.startsWith("token_exchange_failed_")) {
      setError(`แลก OAuth token ไม่สำเร็จ (${status.replace("token_exchange_failed_", "HTTP ")}). ตรวจสถานะ OAuth App และลองเชื่อมใหม่`);
    } else if (status === "invalid_state") {
      setError("คำขอ OAuth หมดอายุหรือไม่ตรงกัน กรุณาเริ่มเชื่อมต่อ Alpaca ใหม่จาก VOOM");
    } else if (status) {
      setError(`การเชื่อมต่อ Alpaca ไม่สำเร็จ: ${status}`);
    }
    return () => listener.subscription.unsubscribe();
  }, [loadAccount]);

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase URL และ publishable/anon key ใน Vercel");
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

  async function connect() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!workerUrl) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_ALPACA_WORKER_URL ใน Vercel");
      const token = await getToken();
      const response = await fetch(`${workerUrl}/api/alpaca/connect`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { authorization_url?: string; error?: string };
      if (!response.ok || !data.authorization_url) throw new Error(data.error || "เริ่ม OAuth ไม่สำเร็จ ตรวจสอบ Worker และ secrets");
      window.location.assign(data.authorization_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เริ่มเชื่อมต่อไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true); setError(""); setNotice("");
    try {
      const token = await getToken();
      const response = await fetch(`${workerUrl}/api/alpaca/disconnect`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
      setAccount({ connected: false, environment: "paper" });
      setNotice("ลบการเชื่อมต่อ Alpaca จาก VOOM_SYSTEM แล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ยกเลิกการเชื่อมต่อไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedInEmail(""); setAccount(null); setNotice("ออกจากระบบแล้ว");
  }

  return (
    <main className="alpaca-page">
      <style>{`
        .alpaca-page{max-width:850px;margin:0 auto;padding:38px 20px 70px;min-height:100vh;background:#090b12;color:#eef3fa;font-family:Inter,system-ui,sans-serif}
        .back{color:#c9f36a;text-decoration:none;font-size:13px}.eyebrow{display:block;color:#a99aff;font-size:10px;letter-spacing:2px;font-weight:800;margin-top:34px}
        h1{font-size:clamp(30px,5vw,42px);letter-spacing:-1.2px;margin:10px 0}.intro{color:#a1adbf;line-height:1.8;font-size:14px}
        .card{margin-top:22px;border:1px solid #293142;border-radius:17px;padding:22px;background:#111620}
        .heading{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#c9f36a;color:#10150a;font-weight:900;font-size:22px}
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
      <a className="back" href="/settings/exness" style={{ marginLeft: 16 }}>เชื่อม Exness MT5 (Read-only) →</a>
      <span className="eyebrow">CONNECTIONS / ALPACA</span>
      <h1>เชื่อมต่อบัญชี Alpaca</h1>
      <p className="intro">เชื่อมบัญชี Alpaca ผ่าน OAuth สำหรับ Paper Trading เท่านั้น ระบบไม่ขอรหัสผ่านโบรกเกอร์ และไม่ส่งคำสั่งซื้อขาย</p>

      <section className="card">
        <div className="heading"><span className="mark">A</span><div><h2>Alpaca Paper Trading</h2><p className="muted">Cloudflare Worker · Supabase · OAuth</p></div><span className="pill">{account?.connected ? "CONNECTED · PAPER" : "PAPER ONLY"}</span></div>
        {!supabase && <p className="warning">ยังขาดค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน Environment Variables ของ Vercel</p>}
        {!workerUrl && <p className="warning">ยังขาด NEXT_PUBLIC_ALPACA_WORKER_URL ซึ่งต้องเป็น URL ของ Cloudflare Worker ที่ deploy แล้ว</p>}
        {signedInEmail ? (
          <div>
            <p className="muted" style={{marginTop:18}}>เข้าสู่ระบบแล้ว: {signedInEmail}</p>
            <button className="btn primary" disabled={busy} onClick={connect}>{busy ? "กำลังดำเนินการ…" : "เชื่อมบัญชี Alpaca (Paper)"}</button>
            <button className="btn" disabled={busy} onClick={loadAccount}>รีเฟรชสถานะบัญชี</button>
            <button className="btn" disabled={busy} onClick={signOut}>ออกจากระบบ VOOM</button>
            {account?.connected && <><div className="grid">
              <div className="metric"><span>สถานะบัญชี</span><strong>{account.account?.status ?? "—"}</strong></div>
              <div className="metric"><span>มูลค่าพอร์ต</span><strong>{account.account?.portfolio_value ?? "—"} {account.account?.currency ?? ""}</strong></div>
              <div className="metric"><span>เงินสด</span><strong>{account.account?.cash ?? "—"} {account.account?.currency ?? ""}</strong></div>
              <div className="metric"><span>Buying power</span><strong>{account.account?.buying_power ?? "—"} {account.account?.currency ?? ""}</strong></div>
            </div><button className="btn" disabled={busy} onClick={disconnect}>ยกเลิกการเชื่อมต่อ Alpaca</button></>}
          </div>
        ) : (
          <form onSubmit={sendMagicLink} style={{marginTop:22}}>
            <label>อีเมลบัญชี VOOM_SYSTEM<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <button className="btn primary" disabled={busy || !supabase} type="submit">{busy ? "กำลังส่ง…" : "ส่งลิงก์เข้าสู่ระบบทางอีเมล"}</button>
          </form>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="foot">เพื่อความปลอดภัย โทเคนถูกเข้ารหัสและเก็บฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มีคำสั่งซื้อขายใน integration นี้ และการเชื่อมต่อจะทำงานได้เมื่อ Worker, OAuth callback และ secrets ตั้งค่าครบแล้ว</p>
      </section>
    </main>
  );
}
