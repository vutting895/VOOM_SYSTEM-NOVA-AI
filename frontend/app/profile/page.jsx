"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("misconfigured");
      return undefined;
    }

    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        setUser(session.user);
        setState("ready");
      } else {
        setUser(null);
        setState("signed-out");
        router.replace("/login");
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError("ตรวจสอบเซสชันไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
        setState("error");
        return;
      }
      if (data.session?.user) {
        setUser(data.session.user);
        setState("ready");
      } else {
        setState("signed-out");
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("ยังไม่ได้ตั้งค่า Supabase สำหรับหน้าเว็บ");
      return;
    }
    setBusy(true);
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) {
      setError("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="nova-login-wrap">
      <section className="nova-login-card">
        <p className="nova-eyebrow">VOOM SYSTEM / NOVA</p>
        <h1>บัญชีผู้ใช้</h1>
        <p>ข้อมูลบัญชีที่ยืนยันจาก Supabase Auth ของคุณ</p>

        {state === "loading" && <p role="status">กำลังตรวจสอบเซสชัน…</p>}
        {state === "misconfigured" && (
          <div className="nova-notice" role="alert">
            <strong>ยังไม่ได้ตั้งค่าระบบยืนยันตัวตน</strong>
            <p>ไม่พบการตั้งค่า Supabase ที่หน้าเว็บต้องใช้ กรุณาให้ผู้ดูแลตรวจ GitHub Actions deployment secrets โดยไม่เปิดเผยค่า Secret</p>
          </div>
        )}
        {state === "error" && <p role="alert">{error}</p>}
        {state === "ready" && user && (
          <>
            <div className="nova-notice">
              <strong>เข้าสู่ระบบแล้ว</strong>
              <p>แสดงเฉพาะข้อมูลผู้ใช้ที่ Supabase Auth ส่งกลับมา หน้านี้ยังไม่ได้เชื่อมตารางโปรไฟล์เพิ่มเติม</p>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.7fr) minmax(0, 1.3fr)", gap: "12px 16px", padding: "18px 0", borderTop: "1px solid #303449", borderBottom: "1px solid #303449" }}>
              <dt style={{ color: "#9ba4ba" }}>อีเมล</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{user.email || "ไม่มีข้อมูล"}</dd>
              <dt style={{ color: "#9ba4ba" }}>วันที่สร้างบัญชี</dt>
              <dd style={{ margin: 0 }}>{user.created_at ? new Date(user.created_at).toLocaleString("th-TH") : "ไม่มีข้อมูล"}</dd>
              <dt style={{ color: "#9ba4ba" }}>ยืนยันอีเมล</dt>
              <dd style={{ margin: 0 }}>{user.email_confirmed_at ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}</dd>
              <dt style={{ color: "#9ba4ba" }}>สถานะการเทรด</dt>
              <dd style={{ margin: 0, color: "#f2c87c" }}>Read-only · Live Trading ปิด</dd>
            </dl>
            <button className="nova-button nova-button-primary" type="button" onClick={signOut} disabled={busy}>
              {busy ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
            </button>
          </>
        )}

        {error && state !== "error" && <p role="alert" style={{ color: "#ffb4a8" }}>{error}</p>}
        <div className="nova-actions">
          <Link className="nova-link-button" href="/">กลับ Dashboard</Link>
          <Link className="nova-link-button" href="/broker">Broker Hub</Link>
          <Link className="nova-link-button" href="/gen-ai">AI Analysis</Link>
        </div>
        <p className="nova-small">ระบบไม่แสดงรหัสผ่าน, API Secret หรือข้อมูลลับ และหน้านี้ไม่มีความสามารถส่งคำสั่งซื้อขาย</p>
      </section>
    </main>
  );
}
