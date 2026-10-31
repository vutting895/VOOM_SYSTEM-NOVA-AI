"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

const ALLOWED_DESTINATIONS = new Set(["/profile", "/"]);

export default function AuthCallbackPage() {
  const [state, setState] = useState("checking");

  useEffect(() => {
    let active = true;

    async function completeSignIn() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("auth_configuration_missing");

      // Supabase JS is configured with detectSessionInUrl=true; wait for it to
      // consume the PKCE callback, then verify the resulting session and user.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("callback_session_missing");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("callback_user_verification_failed");

      const requestedNext = new URL(window.location.href).searchParams.get("next");
      const destination = ALLOWED_DESTINATIONS.has(requestedNext) ? requestedNext : "/profile";
      if (!active) return;

      setState("success");
      window.location.replace(destination);
    }

    void completeSignIn().catch(() => {
      if (active) setState("error");
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#080d18", color: "#eef3ff" }}>
      <section style={{ width: "100%", maxWidth: 540, padding: 32, border: "1px solid #26334b", borderRadius: 20, background: "#101827" }}>
        <p style={{ color: "#77e3c2", fontSize: 12, letterSpacing: "0.12em" }}>VOOM SYSTEM / NOVA</p>
        {state === "checking" && (
          <>
            <h1 style={{ fontSize: 24, margin: "12px 0" }}>กำลังยืนยันการเข้าสู่ระบบ</h1>
            <p>กำลังตรวจสอบ session กับ Supabase ก่อนเปิดหน้าโปรไฟล์</p>
          </>
        )}
        {state === "success" && (
          <>
            <h1 style={{ fontSize: 24, margin: "12px 0" }}>ยืนยันแล้ว</h1>
            <p>กำลังเปิดหน้าโปรไฟล์…</p>
          </>
        )}
        {state === "error" && (
          <>
            <h1 style={{ fontSize: 24, margin: "12px 0" }}>ลิงก์ยืนยันใช้ไม่ได้หรือหมดอายุ</h1>
            <p>ไม่พบ session ที่ยืนยันแล้ว กรุณากลับไปขอลิงก์เข้าสู่ระบบใหม่ และตรวจสอบ Supabase Auth Redirect URL configuration</p>
            <p style={{ marginTop: 20 }}>
              <Link href="/login" style={{ color: "#77e3c2" }}>กลับหน้าเข้าสู่ระบบ</Link>
            </p>
          </>
        )}
        <p style={{ marginTop: 24, fontSize: 12, color: "#a8b4c8" }}>READ-ONLY · LIVE TRADING OFF · ไม่มีการส่งคำสั่งซื้อขาย</p>
      </section>
    </main>
  );
}
