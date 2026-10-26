"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

type ExnessStatus = {
  ok?: boolean;
  broker?: string;
  accountType?: string;
  mode?: string;
  apiAccess?: string;
  credentialsConfigured?: boolean;
  apiHostConfigured?: boolean;
  connectionVerified?: boolean;
  accountDataAvailable?: boolean;
  nextStep?: string;
  error?: string;
};

type ExnessAccountRead = {
  ok?: boolean;
  broker?: string;
  mode?: string;
  accountDataAvailable?: boolean;
  account?: {
    accountId?: string;
    accountName?: string | null;
    createdAt?: string | null;
    currency?: string | null;
    leverage?: string | null;
    tradeMode?: string | null;
    accountStatus?: string | null;
    executionMode?: string | null;
  };
  message?: string;
  error?: string;
  upstreamStatus?: number;
  upstreamCode?: number;
};

const workerUrl = (process.env.NEXT_PUBLIC_EXNESS_WORKER_URL || "").replace(/\/$/, "");
const supabase = getSupabaseBrowserClient();

export default function ExnessSettingsPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ExnessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState<ExnessAccountRead | null>(null);

  const refreshStatus = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase ยังไม่ได้ตั้งค่าใน Vercel");
      if (!workerUrl) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_EXNESS_WORKER_URL ใน Vercel");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session?.access_token) throw new Error("กรุณาเข้าสู่ระบบ VOOM_SYSTEM ก่อนตรวจสถานะ");
      const response = await fetch(`${workerUrl}/api/exness/status`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json() as ExnessStatus;
      if (!response.ok) throw new Error(result.error || "อ่านสถานะ Exness ไม่สำเร็จ");
      setStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ตรวจสถานะ Exness ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  const testReadOnlyAccount = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    setAccount(null);
    try {
      if (!supabase) throw new Error("Supabase ยังไม่ได้ตั้งค่าใน Vercel");
      if (!workerUrl) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_EXNESS_WORKER_URL ใน Vercel");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session?.access_token) throw new Error("กรุณาเข้าสู่ระบบ VOOM_SYSTEM ก่อนทดสอบ");
      const response = await fetch(`${workerUrl}/api/exness/account`, {
        method: "GET",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json() as ExnessAccountRead;
      if (!response.ok || !result.accountDataAvailable) {
        setAccount(result);
        throw new Error(result.message || result.error || "การทดสอบอ่านข้อมูลบัญชีไม่สำเร็จ");
      }
      setAccount(result);
      setStatus((previous) => ({ ...previous, connectionVerified: true, accountDataAvailable: true }));
      setNotice("อ่านข้อมูลบัญชีจาก Exness API สำเร็จแล้ว (Read-only)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทดสอบอ่านข้อมูลบัญชีไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email || ""));
  }, []);

  const badge = status?.connectionVerified ? "VERIFIED READ-ONLY" : "NOT CONNECTED";
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "36px 20px 72px", color: "#edf2fa", background: "#090b12", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <a href="/settings/broker" style={{ color: "#c9f36a", textDecoration: "none" }}>← กลับ Broker Hub</a>
      <p style={{ color: "#a99aff", fontSize: 11, letterSpacing: 2, marginTop: 34 }}>BROKER HUB / EXNESS</p>
      <h1 style={{ fontSize: 38, margin: "8px 0" }}>Exness MT5</h1>
      <p style={{ color: "#a1adbf", lineHeight: 1.8 }}>เชื่อมต่อแบบ Read-only เท่านั้น ตรวจสถานะบัญชีผ่าน API หลังจากยืนยันสิทธิ์ API และวิธีรับรองคำขอจากเอกสารทางการแล้ว ระบบจะไม่ส่งคำสั่งซื้อขายจริง</p>

      <section style={{ marginTop: 22, padding: 22, border: "1px solid #293142", borderRadius: 16, background: "#111620" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>สถานะการเชื่อมต่อ</h2>
          <span style={{ border: "1px solid #51452d", borderRadius: 99, padding: "7px 10px", color: "#e7d19b", fontSize: 11 }}>{badge}</span>
        </div>
        <p style={{ color: "#a1adbf", fontSize: 13 }}>บัญชี VOOM_SYSTEM: {email || "ยังไม่ได้เข้าสู่ระบบ"}</p>
        {!workerUrl && <p style={{ color: "#e7d19b", fontSize: 13 }}>ยังไม่มี NEXT_PUBLIC_EXNESS_WORKER_URL ใน Vercel Preview/Production</p>}
        <button type="button" disabled={busy} onClick={() => void refreshStatus()} style={{ border: 0, borderRadius: 9, background: "#c9f36a", color: "#10150a", padding: "11px 15px", fontWeight: 800, cursor: "pointer" }}>{busy ? "กำลังตรวจสอบ…" : "ตรวจสถานะ API"}</button>
        {status && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 18 }}>
          {([
            ["โหมด", status.mode || "—"],
            ["สิทธิ์ API", status.apiAccess || "ยังไม่ตรวจสอบ"],
            ["ตั้งค่า Credential", status.credentialsConfigured ? "มีค่าใน Worker" : "ยังไม่ได้ตั้งค่า"],
            ["ตั้งค่า API Host", status.apiHostConfigured ? "มีค่าใน Worker" : "ยังไม่ได้ตั้งค่า"],
            ["ยืนยันการเชื่อมต่อ", status.connectionVerified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"],
            ["อ่านข้อมูลบัญชี", status.accountDataAvailable ? "พร้อมใช้งาน" : "ยังไม่พร้อม"],
          ] as Array<[string, string]>).map(([label, value]) => <div key={label} style={{ border: "1px solid #2a3342", borderRadius: 10, padding: 12 }}><span style={{ display: "block", color: "#9aa6b8", fontSize: 11 }}>{label}</span><strong style={{ display: "block", marginTop: 7, fontSize: 14 }}>{value}</strong></div>)}
        </div>}
        <button type="button" disabled={busy} onClick={() => void testReadOnlyAccount()} style={{ marginTop: 14, marginLeft: 8, border: "1px solid #64748b", borderRadius: 9, background: "transparent", color: "#edf2fa", padding: "11px 15px", fontWeight: 700, cursor: "pointer" }}>{busy ? "กำลังทดสอบ…" : "ทดสอบอ่านข้อมูลบัญชี (GET เท่านั้น)"}</button>
        {account?.account && <div style={{ marginTop: 18, border: "1px solid #365344", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>ผลการอ่านข้อมูลบัญชี</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            {([
              ["Account ID", account.account.accountId || "—"],
              ["Account name", account.account.accountName || "—"],
              ["Currency", account.account.currency || "—"],
              ["Leverage", account.account.leverage || "—"],
              ["Trade mode", account.account.tradeMode || "—"],
              ["Account status", account.account.accountStatus || "—"],
            ] as Array<[string, string]>).map(([label, value]) => <div key={label} style={{ border: "1px solid #2a3342", borderRadius: 10, padding: 12 }}><span style={{ display: "block", color: "#9aa6b8", fontSize: 11 }}>{label}</span><strong style={{ display: "block", marginTop: 7, fontSize: 14, overflowWrap: "anywhere" }}>{value}</strong></div>)}
          </div>
        </div>}
        {notice && <p role="status" style={{ color: "#a8e5bd" }}>{notice}</p>}
        {error && <p role="alert" style={{ color: "#ffb8bd", lineHeight: 1.7 }}>{error}</p>}
      </section>

      <section style={{ marginTop: 18, padding: 22, border: "1px solid #293142", borderRadius: 16, background: "#111620" }}>
        <h2 style={{ marginTop: 0 }}>ขั้นตอนถัดไป</h2>
        <ol style={{ color: "#c1cad8", lineHeight: 1.9, paddingLeft: 22 }}>
          <li>เปิด Exness Personal Area แล้วตรวจว่ามีเมนู Key Management / API Key สำหรับผลิตภัณฑ์ Trading API หรือไม่</li>
          <li>หากมี ให้ยืนยันว่าบัญชี MT5 นี้มีสิทธิ์ Trading API และตรวจ host, scopes และวิธีลงนาม Ed25519 ก่อนสร้าง credentials</li>
          <li>เก็บ credentials ใน Cloudflare Worker Secrets เท่านั้น ห้ามใส่ในช่องหน้าเว็บหรือแชต</li>
          <li>ทดสอบอ่านข้อมูลบัญชีอย่างเดียวก่อน แล้วค่อยวางแผน Demo/Paper แยกจากบัญชีจริง</li>
        </ol>
        <p style={{ color: "#e7d19b", fontSize: 12, lineHeight: 1.8 }}>ขณะนี้ยังไม่ถือว่าเชื่อมต่อแล้ว: หน้านี้จะไม่แสดง Connected จนกว่าจะมีผลทดสอบอ่านข้อมูลบัญชีจาก Exness API จริง</p>
        <p style={{ color: "#8c99ac", fontSize: 11, lineHeight: 1.8 }}>Live Trading: ปิด · Order endpoints: ปิด · ไม่มีการส่งคำสั่งซื้อขายหรือถอนเงิน</p>
      </section>
    </main>
  );
}
