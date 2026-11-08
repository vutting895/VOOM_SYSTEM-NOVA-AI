import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Cpu,
  ExternalLink,
  Globe,
  KeyRound,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
const BROKER_PROVIDERS = [
  {
    id: 'exness',
    code: 'EXNESS-DEMO',
    name: 'Exness MT5 Demo',
    protocol: 'MT5 Demo read-only (unverified)',
    authMethod: 'not_configured',
    endpoint: 'not_configured',
    status: 'not_configured' as const,
    description: 'Read-only catalogue only; no authenticated Demo session is connected.',
    permissions: ['market.instruments.read', 'market.candles.read'],
  },
  {
    id: 'binance',
    code: 'BN-REST',
    name: 'Binance Quantitative API',
    protocol: 'REST v3 + WebSocket Stream',
    authMethod: 'not_configured',
    endpoint: 'not_configured',
    status: 'not_configured' as const,
    description: 'Read-only catalogue only; no authenticated exchange session is connected.',
    permissions: ['GET /api/v3/ticker/24hr', 'GET /api/v3/klines'],
  },
  {
    id: 'bybit',
    code: 'BY-V5',
    name: 'Bybit Unified V5 Gateway',
    protocol: 'REST V5 + Linear Perp Stream',
    authMethod: 'not_configured',
    endpoint: 'not_configured',
    status: 'not_configured' as const,
    description: 'Read-only catalogue only; no authenticated exchange session is connected.',
    permissions: ['GET /v5/market/tickers', 'GET /v5/market/kline'],
  },
];

type SettingsTab = 'broker-api' | 'trading-execution' | 'backend-autotrain' | 'security-risk';

const MAJOR_FOREX_LIST = [
  'XAU/USDm',
  'EUR/USDm',
  'GBP/USDm',
  'USD/JPYm',
  'USD/CHFm',
  'AUD/USDm',
  'USD/CADm',
  'NZD/USDm',
];

const MAJOR_CRYPTO_LIST = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'XRP/USDT',
  'ADA/USDT',
  'DOGE/USDT',
  'TON/USDT',
];

export default function SystemSettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('broker-api');

  // Broker account IDs and credentials are intentionally not collected by this component.
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('exness');
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [defaultBotMode, setDefaultBotMode] = useState<'full-auto' | 'semi-auto' | 'manual'>('full-auto');
  const [defaultGridDirection, setDefaultGridDirection] = useState<'BOTH' | 'BUY' | 'SELL'>('BOTH');

  // 3. Backend Auto-Train Settings State
  const [autoTrainNotice, setAutoTrainNotice] = useState<string>(
    'BLOCKED: ยังไม่มีหลักฐานยืนยัน Dataset และ Training Run จริง จึงปิด Auto-Train ไว้ก่อน'
  );

  // 4. Risk & Security Guard State
  const [maxDailyDrawdownPct, setMaxDailyDrawdownPct] = useState<string>('3.0');
  const [defaultLotSize, setDefaultLotSize] = useState<string>('0.35');

  const [activeConfigTab, setActiveConfigTab] = useState<'gemini' | 'claude' | 'vscode' | 'windsurf'>('gemini');
  const [configCopied, setConfigCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auto-train/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.statusNotification) setAutoTrainNotice(data.statusNotification);
      })
      .catch(() => {});

  }, []);

  function copyConfigText(text: string) {
    navigator.clipboard?.writeText(text);
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }

  function notifySaved(msg: string) {
    setSaveBanner(msg);
    setTimeout(() => setSaveBanner(null), 4000);
  }


  const activeProvider =
    BROKER_PROVIDERS.find((b) => b.id === selectedBrokerId) || BROKER_PROVIDERS[0];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#0A1122] via-[#0D162C] to-[#0A1122] border border-cyan-500/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                ศูนย์รวมการตั้งค่าระบบ (VOOM · NOVA OS Settings Hub)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                All Settings in One Place
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              ตรวจสอบสถานะระบบและการวิเคราะห์ Demo แบบ Read-only โดยยังไม่รับรหัสผ่านหรือ API Secret ผ่านหน้าเว็บ
            </p>
          </div>
        </div>

        {/* Quick Status Summary Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">Exness Demo · Read-only · Unverified</span>
          <span className="px-3 py-1.5 rounded-xl bg-slate-500/15 text-slate-300 border border-slate-500/30 font-bold">MT5 Bridge OFF · Live Trading OFF</span>
        </div>
      </div>

      {/* Feedback Banner */}
      {saveBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveBanner}</span>
        </div>
      )}

      {/* 4 Unified Settings Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-[#080D1A] border border-slate-800">
        {[
          {
            id: 'broker-api' as const,
            label: '🔑 1. เชื่อมต่อโบรกเกอร์ Forex (เลือก MT5 หรือ API) & Crypto',
            icon: KeyRound,
          },
          {
            id: 'trading-execution' as const,
            label: '⚡ 2. โหมดเทรดสด (Demo/Real) · บอทอัตโนมัติ · MT5 Bridge',
            icon: Zap,
          },
          {
            id: 'backend-autotrain' as const,
            label: '🧠 3. ตั้งค่าดึงข้อมูล & เทรนอัตโนมัติ (Backend Auto-Train)',
            icon: Cpu,
          },
          {
            id: 'security-risk' as const,
            label: '🛡️ 4. ความปลอดภัย & คุมความเสี่ยงพอร์ต',
            icon: ShieldCheck,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                active
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          TAB 1: FOREX BROKER (CHOOSE MT5 OR DIRECT API) & CRYPTO API SETTINGS
         ===================================================================== */}
      {activeTab === 'broker-api' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Forex Broker Connect Card (Selectable between MT5 or Direct API) */}
          <div className="lg:col-span-6 p-6 rounded-3xl bg-[#0A101F] border border-cyan-500/30 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-mono text-cyan-400 uppercase">
                  EXNESS DEMO BROKER GATEWAY
                </span>
                <h2 className="text-base font-bold text-white mt-0.5">
                  สถานะโบรกเกอร์ Exness Demo (Read-only)
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35">
                ● ยังไม่ยืนยัน · Read-only
              </span>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs">
              <div className="font-bold text-amber-200">Exness Demo · Read-only · ยังไม่ยืนยัน session</div>
              <p className="text-slate-300">หน้า Settings นี้ไม่รับ MT5 password, API token, private key หรือ account ID และจะไม่แสดงสถานะ Connected จนกว่าจะผ่านการตรวจสอบ session แบบ authenticated และ tenant-scoped</p>
              <p className="text-slate-400">ใช้เฉพาะขั้นตอนเชื่อมต่อที่ได้รับอนุมัติจาก Broker/Bridge ในภายหลัง ห้ามวาง credential ในช่องแชตหรือหน้าเว็บนี้</p>
            </div>
          </div>

          {/* Right: Multi-Exchange Crypto API Settings (Binance, Bybit, OKX, Coinbase) */}
          <div className="lg:col-span-6 p-6 rounded-3xl bg-[#0A101F] border border-slate-800 space-y-4">
            <div className="pb-3 border-b border-slate-800">
              <span className="text-[11px] font-mono text-indigo-400 uppercase">
                Multi-Exchange Crypto Gateway
              </span>
              <h2 className="text-base font-bold text-white mt-0.5">
                ตั้งค่า API กระดานเทรดคริปโต (Binance · Bybit · OKX · Coinbase)
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {BROKER_PROVIDERS.map((prov) => (
                <button
                  key={prov.id}
                  type="button"
                  onClick={() => setSelectedBrokerId(prov.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all ${
                    selectedBrokerId === prov.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-[#060A14] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {prov.code}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-slate-700 bg-[#060A14] p-4 space-y-2 text-xs">
              <div className="font-bold text-white">{activeProvider.name}</div>
              <div className="text-slate-400">{activeProvider.description}</div>
              <div className="font-mono text-cyan-400">สถานะการเชื่อมต่อ: ยังไม่ได้ยืนยัน (not configured)</div>
              <p className="text-amber-300 font-semibold">ปิดรับ API Key / Secret ชั่วคราว</p>
              <p className="text-slate-400">ยังไม่มี approved customer-secret runtime ที่ผ่านการตรวจสอบในระบบนี้ จึงไม่แสดงช่องกรอกหรืออ้างว่าบันทึกลง Vault แล้ว</p>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: TRADING MODE (DEMO/REAL), FULL-AUTO BOT & MT5 BRIDGE SETTINGS
         ===================================================================== */}
      {activeTab === 'trading-execution' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Trading & MT5 Bridge Controls */}
          <div className="p-6 rounded-3xl bg-[#0A101F] border border-cyan-500/30 space-y-4">
            <h2 className="text-base font-bold text-white pb-3 border-b border-slate-800">
              ตั้งค่าสถานะโหมดเทรดสด &amp; MT5 Bridge
            </h2>

            <div className="p-4 rounded-2xl bg-[#060A14] border border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">
                  โหมดเทรดสด (Live Market Execution)
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ระบบทำงานในโหมดวิเคราะห์เท่านั้น ไม่เชื่อมบัญชีจริงและไม่ส่งคำสั่งซื้อขาย
                </p>
              </div>
              <button type="button" disabled aria-disabled="true" className="px-4 py-2 rounded-xl text-xs font-mono font-bold shrink-0 bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-not-allowed">
                🔒 Live Trading OFF · Read-only
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#060A14] border border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">
                  การทำงานของ MT5 Bridge Relay
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  MT5 Bridge ยังปิดอยู่ จนกว่าจะผ่าน authenticated Demo read-only และ tenant-isolation checks
                </p>
              </div>
              <button type="button" disabled aria-disabled="true" className="px-4 py-2 rounded-xl text-xs font-mono font-bold shrink-0 bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-not-allowed">
                🚫 MT5 Bridge OFF
              </button>
            </div>
          </div>

          {/* Bot Execution Mode & Dynamic Grid Direction */}
          <div className="p-6 rounded-3xl bg-[#0A101F] border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white pb-3 border-b border-slate-800">
              ตั้งค่าโหมดการทำงานของบอท AI &amp; Dynamic Grid
            </h2>

            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-semibold">
                รูปแบบการสร้างแผนวิเคราะห์ (Research Mode)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'full-auto' as const,
                    title: '🤖 Auto Research',
                    desc: 'สร้างแผนวิเคราะห์เท่านั้น ไม่ส่งคำสั่งซื้อขาย',
                  },
                  {
                    id: 'semi-auto' as const,
                    title: '🛡️ Review Draft',
                    desc: 'AI สร้าง Draft เพื่อทบทวน ไม่มีสิทธิ์อนุมัติคำสั่งซื้อขาย',
                  },
                  {
                    id: 'manual' as const,
                    title: '👆 Manual Research',
                    desc: 'ตรวจสอบข้อมูลและผลวิเคราะห์ด้วยตนเอง',
                  },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDefaultBotMode(m.id);
                      notifySaved(`เลือก ${m.title} เฉพาะหน้าจอชั่วคราว · ยังไม่ได้บันทึกลงระบบ`);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      defaultBotMode === m.id
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                        : 'bg-[#060A14] border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">{m.title}</div>
                    <div className="text-[11px] opacity-80 mt-1">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-xs pt-2">
              <label className="block text-slate-300 font-semibold">
                ทิศทางเริ่มต้นของระบบ Dynamic Grid v15.0
              </label>
              <div className="grid grid-cols-3 gap-2.5 font-mono">
                {(['BOTH', 'BUY', 'SELL'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setDefaultGridDirection(dir);
                      notifySaved(`เลือกทิศทาง ${dir} เฉพาะหน้าจอชั่วคราว · ยังไม่ได้บันทึกลงระบบ`);
                    }}
                    className={`py-2.5 rounded-xl font-bold border transition-all ${
                      defaultGridDirection === dir
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                        : 'bg-[#060A14] text-slate-400 border-slate-800'
                    }`}
                  >
                    {dir === 'BOTH' ? 'BOTH (สองฝั่ง)' : dir === 'BUY' ? 'BUY ONLY' : 'SELL ONLY'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: BACKEND AUTO-TRAIN DAEMON SETTINGS
         ===================================================================== */}
      {activeTab === 'backend-autotrain' && (
        <div className="p-6 rounded-3xl bg-[#0A101F] border border-amber-500/30 space-y-4">
          <div>
            <span className="text-[11px] font-mono text-amber-300 uppercase">Backend Data &amp; Model Training</span>
            <h2 className="text-base font-bold text-white mt-1">Auto-Train ถูกปิดไว้จนกว่าจะมีหลักฐานที่ตรวจสอบได้</h2>
            <p className="text-xs text-slate-400 mt-2">
              ขณะนี้ยังไม่มีการยืนยัน Dataset Exness XAUUSDm H1 ที่ผ่านการตรวจสอบ gap, UTC, provenance
              และยังไม่มี Training Run พร้อม Evaluation Artifact ที่ทำซ้ำได้
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
            <strong>BLOCKED · NOT CONFIGURED</strong>
            <p className="mt-1">ระบบจะไม่เพิ่ม Epoch/Sample, ไม่แสดง Accuracy และไม่อ้างว่าดึงข้อมูลหรือฝึกโมเดลสำเร็จจากตัวเลขจำลอง</p>
          </div>
          <div className="text-xs text-slate-400">
            Next gate: ตรวจสอบไฟล์ OHLC ต้นทาง → ตรวจ gap/timezone/provenance → รัน pipeline ที่บันทึก run ID,
            dataset fingerprint, model artifact และ OOS metrics → จึงค่อยเปิดตารางเวลาอัตโนมัติ
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SECURITY, VAULT ENCRYPTION & RISK GUARD SETTINGS
         ===================================================================== */}
      {activeTab === 'security-risk' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-3xl bg-[#0A101F] border border-cyan-500/30 space-y-4">
            <h2 className="text-base font-bold text-white pb-3 border-b border-slate-800">
              ตั้งค่าเพดานความเสี่ยง &amp; ขนาด Lot มาตรฐาน
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  ขนาด Lot เริ่มต้นต่อไม้ (Default Lot)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={defaultLotSize}
                  onChange={(e) => setDefaultLotSize(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  จุดตัดพักบอทเมื่อ Drawdown รายวันเกิน (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={maxDailyDrawdownPct}
                  onChange={(e) => setMaxDailyDrawdownPct(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-800 border border-slate-700 cursor-not-allowed"
            >
              บันทึกไม่ได้ · ยังไม่มี Backend Persistence
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-[#0A101F] border border-slate-800 space-y-3 text-xs">
            <h2 className="text-base font-bold text-white pb-3 border-b border-slate-800">
              สถานะความปลอดภัย &amp; การเข้ารหัสคีย์ (Vault Security)
            </h2>
            <div className="divide-y divide-slate-800/80">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">โปรโตคอลเชื่อมต่อ Exness</span>
                <span className="font-mono text-cyan-300">Not verified · no authenticated broker data path</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">สถานะ MT5 Bridge</span>
                <span className="font-mono text-rose-400">ปิดการใช้งาน (OFF)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">การป้องกันสิทธิ์ถอนเงินผ่าน API</span>
                <span className="font-mono text-emerald-400">No broker-write API enabled · runtime not independently audited</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">ระบบเทรนโมเดล AI</span>
                <span className="font-mono text-emerald-400">BLOCKED · รอ Dataset และ Training Evidence</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
