import React, { useState } from 'react';
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import QuickitMarketFleetView from './components/QuickitMarketFleetView';
import QuantumEngineView from './components/QuantumEngineView';
import { useAuth } from './auth/AuthProvider';

function LoginPage() {
  const { configured, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requestedPath = location.state?.from;
  const returnPath = typeof requestedPath === 'string' &&
    requestedPath.startsWith('/') &&
    !requestedPath.startsWith('//') ? requestedPath : '/';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      navigate(returnPath, { replace: true });
    } catch {
      setError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบบัญชี หรือการตั้งค่า Supabase Auth');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070711] text-slate-100 grid place-items-center p-5">
      <section className="w-full max-w-md rounded-2xl border border-violet-400/20 bg-[#11111f] p-7 shadow-2xl shadow-violet-950/30">
        <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-cyan-300">VOOM SYSTEM / NOVA IDENTITY</p>
        <h1 className="mt-3 text-2xl font-bold">เข้าสู่ระบบ NOVA</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">ยืนยันตัวตนผ่าน Supabase Auth ก่อนเข้าถึงพื้นที่ทำงานและบริการที่ป้องกันไว้</p>
        {!configured ? (
          <div role="alert" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <strong>ยังไม่ได้ตั้งค่า Supabase Auth</strong>
            <p className="mt-2">ผู้ดูแลระบบต้องกำหนด VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY ใน Environment ของ Netlify ก่อนใช้งาน ห้ามใช้ Service Role Key ใน Browser</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              อีเมล
              <input
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-cyan-400"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              รหัสผ่าน
              <input
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-cyan-400"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <button
              className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={busy || !email.trim() || !password}
            >
              {busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}
        <p className="mt-5 text-xs leading-5 text-slate-500">ระบบไม่รับ Broker Password, API Secret หรือ Service Role Key ผ่านหน้า Login นี้</p>
      </section>
    </main>
  );
}

function ProtectedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/overview" element={<QuickitMarketFleetView initialTab="dashboard" />} />
      <Route path="/markets" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/marketplace" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/strategies" element={<QuickitMarketFleetView initialTab="market" />} />
      <Route path="/live" element={<QuickitMarketFleetView initialTab="trading" />} />
      <Route path="/chat" element={<QuickitMarketFleetView initialTab="trading" />} />
      <Route path="/pro" element={<QuickitMarketFleetView initialTab="portfolio" />} />
      <Route path="/settings" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/broker" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route path="/profile" element={<QuickitMarketFleetView initialTab="settings" />} />
      <Route
        path="/quantum"
        element={
          <div className="min-h-screen bg-[#090912] text-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
              <QuantumEngineView />
            </div>
          </div>
        }
      />
      <Route path="*" element={<QuickitMarketFleetView initialTab="dashboard" />} />
    </Routes>
  );
}

export default function App() {
  const { configured, loading, session } = useAuth();
  const location = useLocation();

  if (location.pathname === '/login') {
    return session ? <Navigate to="/" replace /> : <LoginPage />;
  }

  if (!configured) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (loading) {
    return <main className="min-h-screen bg-[#070711] text-slate-300 grid place-items-center" role="status">กำลังตรวจสอบ Supabase session...</main>;
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <ProtectedRoutes />;
}
