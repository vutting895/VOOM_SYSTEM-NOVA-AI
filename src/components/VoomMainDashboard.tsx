import React, { useEffect, useState } from 'react';
import { Activity, BrainCircuit, ChartNoAxesCombined, Database, ShieldCheck, Settings, Radio, RefreshCw, ArrowUpRight, CircleHelp } from 'lucide-react';

type Check = { state: 'checking' | 'online' | 'error'; detail: string };
const services = [
  { id: 'hub', label: 'VOOM Control Hub', url: 'https://voom-system-hub-staging.suwapat787.workers.dev/health' },
  { id: 'ai', label: 'NOVA AI Runtime', url: 'https://voom-system-nova-ai-staging.suwapat787.workers.dev/health' },
] as const;

const nav = [
  { label: 'Market Monitor', detail: 'ติดตามตลาดและสัญญาณ', href: '/markets', icon: Activity },
  { label: 'AI Intelligence', detail: 'สมองวิเคราะห์และโมเดล', href: '/intelligence', icon: BrainCircuit },
  { label: 'Backtest', detail: 'ทดสอบกลยุทธ์ย้อนหลัง', href: '/backtest', icon: ChartNoAxesCombined },
  { label: 'Infrastructure', detail: 'Bridge และสถานะระบบ', href: '/infrastructure', icon: Radio },
  { label: 'Learning Universe', detail: 'ข้อมูลและการเรียนรู้', href: '/learning', icon: Database },
  { label: 'Settings', detail: 'การตั้งค่า VOOM AI', href: '/settings', icon: Settings },
];

export default function VoomMainDashboard() {
  const [checks, setChecks] = useState<Record<string, Check>>({
    hub: { state: 'checking', detail: 'กำลังตรวจสอบ' },
    ai: { state: 'checking', detail: 'กำลังตรวจสอบ' },
  });
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    const next: Record<string, Check> = {};
    await Promise.all(services.map(async (service) => {
      try {
        const response = await fetch(service.url, { method: 'GET', cache: 'no-store' });
        const data = await response.json();
        const healthy = response.ok && data?.ok === true;
        next[service.id] = {
          state: healthy ? 'online' : 'error',
          detail: healthy ? (data.status || data.version || 'ตอบสนองแล้ว') : `HTTP ${response.status}`,
        };
      } catch {
        next[service.id] = { state: 'error', detail: 'เชื่อมต่อไม่ได้' };
      }
    }));
    setChecks(next);
    setUpdatedAt(new Date().toLocaleTimeString('th-TH'));
    setBusy(false);
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineCount = Object.values(checks).filter((item) => item.state === 'online').length;
  const statusStyle = (state: Check['state']) =>
    state === 'online' ? 'bg-emerald-400' : state === 'error' ? 'bg-rose-400' : 'bg-amber-400';

  return (
    <main className="min-h-screen bg-[#080d18] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300"><BrainCircuit size={24}/></div>
            <div><p className="text-lg font-black tracking-wide">VOOM <span className="text-cyan-300">AI</span></p><p className="text-xs text-slate-400">ศูนย์ควบคุมระบบเทรดอัจฉริยะ</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300"><ShieldCheck size={15}/> DEMO / READ-ONLY</div>
        </header>

        <section className="py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[.22em] text-cyan-300">Main Dashboard</p><h1 className="text-3xl font-black sm:text-4xl">ภาพรวมระบบ</h1><p className="mt-2 text-sm text-slate-400">ทุกส่วนสำคัญของ VOOM AI อยู่ในหน้าเดียว</p></div>
            <button onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50"><RefreshCw size={16} className={busy ? 'animate-spin' : ''}/> ตรวจสอบอีกครั้ง</button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const check = checks[service.id];
            return <article key={service.id} className="rounded-2xl border border-white/10 bg-[#111a2a] p-5">
              <div className="flex items-center justify-between"><span className="text-sm text-slate-300">{service.label}</span><span className={`h-2.5 w-2.5 rounded-full ${statusStyle(check.state)}`}/></div>
              <p className="mt-3 text-xl font-bold">{check.state === 'online' ? 'ตอบสนองแล้ว' : check.state === 'error' ? 'ตรวจไม่ผ่าน' : 'กำลังตรวจสอบ'}</p>
              <p className="mt-1 text-xs text-slate-400">{check.detail}</p>
            </article>;
          })}
          <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-5">
            <div className="flex items-center gap-2 text-amber-300"><ShieldCheck size={17}/><span className="text-sm">ความปลอดภัยการเทรด</span></div>
            <p className="mt-3 text-xl font-bold text-amber-200">ปิดการส่งคำสั่ง</p>
            <p className="mt-1 text-xs text-slate-400">Execution OFF · Live Trading OFF</p>
          </article>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-[#111a2a] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">สถานะการเชื่อมต่อ</h2><span className="text-xs text-slate-500">ตรวจล่าสุด {updatedAt || '—'} · {onlineCount}/2 บริการตอบสนอง</span></div>
          <p className="mt-2 text-xs leading-6 text-slate-400">สถานะนี้ตรวจจาก Health Endpoint ของ Staging เท่านั้น ไม่ใช่ผลยืนยันการ Login, การเรียกโมเดล AI หรือการเชื่อมต่อบัญชี MT5</p>
        </section>

        <section className="mt-8">
          <div className="mb-4"><h2 className="text-xl font-bold">เมนูระบบ</h2><p className="mt-1 text-sm text-slate-400">เลือกส่วนที่ต้องการได้โดยตรง ไม่ต้องเปิดหลาย Dashboard</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nav.map((item) => {
              const Icon = item.icon;
              return <a key={item.href} href={item.href} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-[#111a2a] p-5 transition hover:border-cyan-300/40 hover:bg-[#152238]">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><Icon size={21}/></div>
                <div className="min-w-0 flex-1"><p className="font-bold">{item.label}</p><p className="mt-1 text-xs text-slate-400">{item.detail}</p></div><ArrowUpRight size={17} className="text-slate-500 transition group-hover:text-cyan-300"/>
              </a>;
            })}
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 py-5 text-xs text-slate-500"><span>VOOM AI · Intraday workflow · ไม่ถือสถานะข้ามวัน</span><span className="inline-flex items-center gap-1"><CircleHelp size={13}/> Health status ไม่ใช่การรับรองความพร้อมเทรด</span></footer>
      </div>
    </main>
  );
}
