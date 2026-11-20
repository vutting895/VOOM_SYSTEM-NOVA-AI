import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BrainCircuit,
  ChartNoAxesCombined,
  Database,
  FlaskConical,
  Layers3,
  Network,
  RadioTower,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import ReadonlySafetyBadge from './common/ReadonlySafetyBadge';

const modules = [
  {
    title: 'Dashboard',
    subtitle: 'ภาพรวมตลาดและสถานะระบบ',
    detail: 'Market overview, price feed และกราฟ',
    path: '/dashboard',
    icon: Activity,
  },
  {
    title: 'Trading Intelligence',
    subtitle: 'AI และ Market Analysis',
    detail: 'โมเดล สัญญาณ และการวิเคราะห์ตลาด',
    path: '/intelligence',
    icon: BrainCircuit,
  },
  {
    title: 'Backtest Lab',
    subtitle: 'ทดสอบกลยุทธ์',
    detail: 'Simulation และผลประเมินย้อนหลัง',
    path: '/backtest',
    icon: FlaskConical,
  },
  {
    title: 'Market & Strategies',
    subtitle: 'ตลาดและกลยุทธ์',
    detail: 'สินทรัพย์ กลยุทธ์ และ Strategy Performance',
    path: '/markets',
    icon: ChartNoAxesCombined,
  },
  {
    title: 'Portfolio Workspace',
    subtitle: 'พื้นที่จัดการพอร์ต',
    detail: 'เครื่องมือและมุมมองพอร์ต NOVA',
    path: '/pro',
    icon: Wallet,
  },
  {
    title: 'Learning Universe',
    subtitle: 'ข้อมูลและการเรียนรู้',
    detail: 'Dataset, learning status และ worksheet',
    path: '/learning',
    icon: Database,
  },
  {
    title: 'Infrastructure',
    subtitle: 'ระบบเชื่อมต่อและสุขภาพระบบ',
    detail: 'Broker, API และ infrastructure health',
    path: '/infrastructure',
    icon: Network,
  },
  {
    title: 'NOVA AI Workspace',
    subtitle: 'AI Studio และ Chat',
    detail: 'พื้นที่ทำงานด้าน AI และกลยุทธ์',
    path: '/studio',
    icon: Sparkles,
  },
  {
    title: 'Workspace & Audit',
    subtitle: 'เอกสารและหลักฐาน',
    detail: 'Google Workspace export และ independent audit',
    path: '/workspace',
    icon: Layers3,
  },
  {
    title: 'System Settings',
    subtitle: 'การตั้งค่าระบบ',
    detail: 'การตั้งค่าและการเชื่อมต่อบัญชี',
    path: '/settings',
    icon: Settings2,
  },
];

export default function AllInOneNovaHome() {
  return (
    <main className="min-h-screen bg-[#F3F0FF] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-violet-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-600">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              VOOM SYSTEM
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-violet-950 sm:text-4xl">
              NOVA All-in-One
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Unified workspace — แยกโมดูลชัดเจน ใช้ Backend และ API ของ NOVA เดิม
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-64">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              <ShieldCheck className="mr-2 inline h-4 w-4" />
              READ-ONLY · LIVE TRADING OFF
            </div>
            <Link
              to="/dashboard"
              className="rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-violet-700"
            >
              Open NOVA Dashboard
            </Link>
          </div>
        </header>

        <section className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">System Modules</h2>
            <p className="mt-1 text-sm text-slate-500">เลือกเปิดโมดูลที่มีอยู่ใน NOVA</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
            {modules.length} modules
          </span>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ title, subtitle, detail, path, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className="group rounded-2xl border border-violet-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-900/5"
            >
              <div className="mb-5 flex items-start justify-between">
                <span className="rounded-xl bg-violet-50 p-3 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  NOVA Module
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm font-semibold text-violet-700">{subtitle}</p>
              <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-bold text-violet-700">
                <span>Open module</span>
                <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </section>

        <footer className="mt-6 flex flex-col gap-2 rounded-2xl border border-violet-100 bg-white/80 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>NOVA frontend shell · Existing NOVA services and API routes are retained</span>
          <span>Demo account figures from the source AllInOne page are intentionally excluded</span>
        </footer>
      </div>
    </main>
  );
}
