import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../../lib/supabase";

export default function SupabaseLoginView() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const supabase = await getSupabaseClient();
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan-400">NOVA AUTHENTICATION</p>
          <h1 className="mt-2 text-2xl font-bold">เข้าสู่ระบบ NOVA</h1>
          <p className="mt-2 text-sm text-slate-400">ใช้บัญชี Supabase ของ NOVA เพื่ออ่านข้อมูล Exness MT5 Demo แบบ Read-only</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">อีเมล</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-500"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-500"
              required
            />
          </label>
          {error ? <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
        <p className="mt-5 text-xs text-slate-500">การเข้าสู่ระบบนี้ไม่เปิดสิทธิ์ส่งคำสั่งซื้อขาย · Live Trading OFF</p>
      </section>
    </main>
  );
}
