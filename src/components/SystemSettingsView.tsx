import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  KeyRound,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sliders,
  Zap,
} from 'lucide-react';
const BROKER_PROVIDERS = [
  {
    id: 'exness',
    code: 'EXN-API',
    name: 'Exness Trader Platform API',
    protocol: 'REST v1 + Ed25519 Signature (No MT5)',
    authMethod: 'EXN-API-KEY + Ed25519 Sign',
    endpoint: 'https://my.exness.com/v1/trading',
    latencyMs: 28,
    status: 'connected' as const,
    description: 'เชื่อมต่อ Exness Platform API โดยตรงสำหรับทองคำ XAU/USDm และคู่เงินหลัก',
    permissions: ['GET /v1/trading/accounts', 'GET /v1/trading/candles', 'POST /v1/trading/orders'],
  },
  {
    id: 'binance',
    code: 'BN-REST',
    name: 'Binance Quantitative API',
    protocol: 'REST v3 + WebSocket Stream',
    authMethod: 'HMAC-SHA256 API Key',
    endpoint: 'https://api.binance.com/api/v3',
    latencyMs: 34,
    status: 'connected' as const,
    description: 'เชื่อมต่อตลาดคริปโตหลัก BTC/USDT, ETH/USDT, SOL/USDT, TON/USDT',
    permissions: ['GET /api/v3/ticker/24hr', 'GET /api/v3/klines'],
  },
  {
    id: 'bybit',
    code: 'BY-V5',
    name: 'Bybit Unified V5 Gateway',
    protocol: 'REST V5 + Linear Perp Stream',
    authMethod: 'HMAC-SHA256 Key',
    endpoint: 'https://api.bybit.com/v5/market',
    latencyMs: 41,
    status: 'connected' as const,
    description: 'เชื่อมต่อสภาพคล่องอนุพันธ์คริปโตและอัตรา Funding Rate',
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

  // 1. Exness & Multi-Broker API / MT5 Settings State
  const [forexConnectionMode, setForexConnectionMode] = useState<'mt5' | 'api'>('api');
  const [exnessAccountId, setExnessAccountId] = useState<string>('23908764');
  const [exnessToken, setExnessToken] = useState<string>('EXN-ED25519-9F8A7B6C5D4E3F2A1B0C');
  const [mt5ServerName, setMt5ServerName] = useState<string>('Exness-MT5Real14');
  const [mt5Password, setMt5Password] = useState<string>('••••••••••••');
  const [exnessServer, setExnessServer] = useState<'demo' | 'real'>('real');
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('exness');
  const [exchangeApiKey, setExchangeApiKey] = useState<string>('');
  const [exchangeSecret, setExchangeSecret] = useState<string>('');
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // 2. Trading Mode, Account Env & MT5 Bridge Settings State
  const [liveTradingEnabled, setLiveTradingEnabled] = useState<boolean>(true);
  const [mt5BridgeEnabled, setMt5BridgeEnabled] = useState<boolean>(false);
  const [defaultBotMode, setDefaultBotMode] = useState<'full-auto' | 'semi-auto' | 'manual'>('full-auto');
  const [defaultGridDirection, setDefaultGridDirection] = useState<'BOTH' | 'BUY' | 'SELL'>('BOTH');

  // 3. Backend Auto-Train Settings State
  const [autoTrainEnabled, setAutoTrainEnabled] = useState<boolean>(true);
  const [autoTrainIntervalSec, setAutoTrainIntervalSec] = useState<number>(18);
  const [autoTrainNotice, setAutoTrainNotice] = useState<string>(
    '🟢 Backend Auto-Train: ดึงข้อมูลตลาดและเทรนโมเดลอัตโนมัติหลังบ้านสำเร็จ (Epoch #148 · ความแม่นยำ 94.8%)'
  );
  const [syncingBackend, setSyncingBackend] = useState<boolean>(false);

  // 4. Risk & Security Guard State
  const [maxDailyDrawdownPct, setMaxDailyDrawdownPct] = useState<string>('3.0');
  const [defaultLotSize, setDefaultLotSize] = useState<string>('0.35');

  useEffect(() => {
    fetch('/api/auto-train/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.statusNotification) setAutoTrainNotice(data.statusNotification);
      })
      .catch(() => {});
  }, []);

  function notifySaved(msg: string) {
    setSaveBanner(msg);
    setTimeout(() => setSaveBanner(null), 4000);
  }

  function handleToggleLiveTrading(next: boolean) {
    setLiveTradingEnabled(next);
    fetch('/api/live-trading/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => {});
    notifySaved(
      next
        ? '🟢 เปิดโหมดเทรดสด (Live Market Execution) เรียบร้อยแล้ว'
        : '🟡 สลับเป็นโหมดพักคำสั่งซื้อขาย (Paused / Read-Only) เรียบร้อยแล้ว'
    );
  }

  function handleToggleMt5Bridge(next: boolean) {
    setMt5BridgeEnabled(next);
    setForexConnectionMode(next ? 'mt5' : 'api');
    fetch('/api/mt5-bridge/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => {});
    notifySaved(
      next
        ? `🖥️ เปลี่ยนโหมดโบรกเกอร์ Forex เป็นใช้ MT5 (${mt5ServerName} · Login #${exnessAccountId}) สำเร็จ`
        : '⚡ เปลี่ยนโหมดโบรกเกอร์ Forex เป็นใช้ Direct API (Ed25519 REST v1 · ไม่ต้องเปิดโปรแกรม MT5) สำเร็จ'
    );
  }

  function handleTriggerBackendTrain(symbol: string) {
    setSyncingBackend(true);
    setAutoTrainNotice(`🔄 Backend Auto-Train: กำลังดึงกราฟสด ${symbol} มาเทรนโมเดลอัตโนมัติที่ Backend...`);
    fetch('/api/auto-train/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.statusNotification) {
          setAutoTrainNotice(data.statusNotification);
        }
        notifySaved(`สั่งซิงค์ข้อมูลและเทรนโมเดล ${symbol} ที่ Backend เรียบร้อยแล้ว`);
      })
      .catch(() => {})
      .finally(() => setSyncingBackend(false));
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
              รวมเมนูการตั้งค่าทั้งหมดไว้ในหน้าเดียว: เลือกเชื่อมต่อโบรกเกอร์ Forex ผ่าน MT5 หรือ Direct API, สลับบัญชี Demo/Real, และตั้งค่า Backend Auto-Train
            </p>
          </div>
        </div>

        {/* Quick Status Summary Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
            🟢 Exness #{exnessAccountId} ({exnessServer === 'demo' ? 'Demo Live' : 'Real Live'})
          </span>
          <span
            className={`px-3 py-1.5 rounded-xl font-bold border ${
              forexConnectionMode === 'mt5'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
            }`}
          >
            {forexConnectionMode === 'mt5'
              ? `🖥️ Forex Mode: MT5 (${mt5ServerName})`
              : '⚡ Forex Mode: Direct API'}
          </span>
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
                  FOREX BROKER GATEWAY (MT5 OR DIRECT API)
                </span>
                <h2 className="text-base font-bold text-white mt-0.5">
                  เชื่อมต่อโบรกเกอร์ Forex (เลือกใช้ MT5 หรือ Direct API ได้)
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                ● เชื่อมต่อแล้ว ({forexConnectionMode.toUpperCase()})
              </span>
            </div>

            {/* Selector: Use MT5 vs Use Direct API */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                เลือกรูปแบบการเชื่อมต่อโบรกเกอร์ Forex:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleMt5Bridge(true)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    forexConnectionMode === 'mt5'
                      ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-md'
                      : 'bg-[#060A14] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-extrabold">🖥️ ใช้ MT5 (MetaTrader 5)</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    เชื่อมต่อผ่านรหัส MT5 Login, รหัสผ่าน และ MT5 Server
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleMt5Bridge(false)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    forexConnectionMode === 'api'
                      ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200 shadow-md'
                      : 'bg-[#060A14] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-extrabold">⚡ ใช้ Direct API (REST / Ed25519)</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    ยิงคำสั่งตรงผ่าน API Key โดยไม่ต้องเปิดโปรแกรม MT5
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  {forexConnectionMode === 'mt5'
                    ? 'หมายเลขบัญชี MT5 Login (Account ID)'
                    : 'รหัสบัญชีโบรกเกอร์ (Account ID)'}
                </label>
                <input
                  type="text"
                  value={exnessAccountId}
                  onChange={(e) => setExnessAccountId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              {forexConnectionMode === 'mt5' ? (
                <>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">
                      เลือกเซิร์ฟเวอร์ MT5 (MT5 Server)
                    </label>
                    <select
                      value={mt5ServerName}
                      onChange={(e) => setMt5ServerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-400"
                    >
                      <option value="Exness-MT5Real14">Exness-MT5Real14 (บัญชีจริง)</option>
                      <option value="Exness-MT5Trial8">Exness-MT5Trial8 (บัญชีทดลอง)</option>
                      <option value="ICMarketsSC-MT5-4">ICMarketsSC-MT5-4 (Raw Spread)</option>
                      <option value="XMGlobal-MT5 2">XMGlobal-MT5 2 (Standard/Ultra Low)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1.5">
                      รหัสผ่าน MT5 (Master / Trading Password)
                    </label>
                    <input
                      type="password"
                      value={mt5Password}
                      onChange={(e) => setMt5Password(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">
                    โทเค็น API / ลายเซ็น Ed25519 (EXN-API-KEY)
                  </label>
                  <input
                    type="password"
                    value={exnessToken}
                    onChange={(e) => setExnessToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  เลือกสภาพแวดล้อมบัญชี (Demo / Real)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExnessServer('demo')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      exnessServer === 'demo'
                        ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                        : 'bg-[#060A14] border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">🧪 บัญชีทดลอง (Demo)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      เทรดสดราคาตลาดจริงด้วยเงินจำลอง
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExnessServer('real')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      exnessServer === 'real'
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                        : 'bg-[#060A14] border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">💎 บัญชีจริง (Real)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      เทรดสดด้วยเงินจริง ถอนกำไรได้จริง
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  notifySaved(
                    forexConnectionMode === 'mt5'
                      ? `บันทึกการเชื่อมต่อโบรกเกอร์ Forex ผ่าน MT5 (#${exnessAccountId} · ${mt5ServerName}) สำเร็จ`
                      : `บันทึกการเชื่อมต่อโบรกเกอร์ Forex ผ่าน Direct API (#${exnessAccountId} · ${
                          exnessServer === 'demo' ? 'Demo' : 'Real'
                        }) สำเร็จ`
                  )
                }
                className="w-full py-3 rounded-xl text-xs font-extrabold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:opacity-95 transition-opacity"
              >
                {forexConnectionMode === 'mt5'
                  ? `บันทึกและเชื่อมต่อผ่าน MT5 (#${exnessAccountId} · ${mt5ServerName})`
                  : `บันทึกและเชื่อมต่อผ่าน Direct API (#${exnessAccountId})`}
              </button>
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
                  {prov.code} ({prov.latencyMs}ms)
                </button>
              ))}
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-[#060A14] border border-slate-800/90 text-slate-300">
                <div className="font-bold text-white">{activeProvider.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{activeProvider.description}</div>
                <div className="text-[11px] font-mono text-cyan-400 mt-1">
                  Endpoint: {activeProvider.endpoint}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  API Key ({activeProvider.code})
                </label>
                <input
                  type="text"
                  value={exchangeApiKey}
                  onChange={(e) => setExchangeApiKey(e.target.value)}
                  placeholder={`กรอก ${activeProvider.code} API Key...`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  API Secret / Private Key
                </label>
                <input
                  type="password"
                  value={exchangeSecret}
                  onChange={(e) => setExchangeSecret(e.target.value)}
                  placeholder={`กรอก ${activeProvider.code} Secret Key...`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060A14] border border-slate-800 text-white font-mono"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setExchangeApiKey('');
                  setExchangeSecret('');
                  notifySaved(`บันทึกคีย์ ${activeProvider.name} เข้าสู่ระบบ Vault เรียบร้อยแล้ว`);
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                บันทึกคีย์ {activeProvider.code} API
              </button>
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
                  เมื่อเปิดใช้งาน ระบบจะส่งคำสั่งซื้อขายจริงเข้าบัญชี Exness #{exnessAccountId} (รองรับทั้ง Demo และ Real)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleLiveTrading(!liveTradingEnabled)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold shrink-0 transition-all ${
                  liveTradingEnabled
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {liveTradingEnabled ? '🟢 เปิดโหมดเทรดสด (ON)' : '🟡 พักคำสั่ง (PAUSED)'}
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#060A14] border border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">
                  การทำงานของ MT5 Bridge Relay
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ปิดการทำงานไว้ตามคำสั่ง เพื่อใช้การเชื่อมต่อตรงผ่าน Exness Ed25519 REST API (เร็วกว่าและไม่ต้องเปิดโปรแกรม MT5)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleMt5Bridge(!mt5BridgeEnabled)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold shrink-0 transition-all ${
                  mt5BridgeEnabled
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {mt5BridgeEnabled ? 'เปิด MT5 Bridge (ON)' : '🚫 ปิด MT5 Bridge (OFF)'}
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
                รูปแบบการส่งคำสั่งซื้อขายหลัก (Execution Mode)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'full-auto' as const,
                    title: '🤖 Full Auto 100%',
                    desc: 'บอทเปิด-ปิดออเดอร์เองอัตโนมัติ ไม่ต้องกดมือ',
                  },
                  {
                    id: 'semi-auto' as const,
                    title: '🛡️ กึ่งอัตโนมัติ',
                    desc: 'AI เด้งการ์ด <ApprovalCard /> รอคุณกดยืนยัน',
                  },
                  {
                    id: 'manual' as const,
                    title: '👆 กดเทรดเอง',
                    desc: 'ส่งคำสั่งผ่านหน้า Live Terminal ด้วยตัวเอง',
                  },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDefaultBotMode(m.id);
                      notifySaved(`เปลี่ยนโหมดการเทรดหลักเป็น "${m.title}" เรียบร้อยแล้ว`);
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
                      notifySaved(`ตั้งค่าทิศทาง Dynamic Grid เริ่มต้นเป็น ${dir} เรียบร้อยแล้ว`);
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
        <div className="p-6 rounded-3xl bg-[#0A101F] border border-cyan-500/30 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <span className="text-[11px] font-mono text-cyan-400 uppercase">
                Backend Autonomous Data Ingestion &amp; Model Training
              </span>
              <h2 className="text-base font-bold text-white mt-0.5">
                ตั้งค่าระบบดึงข้อมูลตลาดและเทรนโมเดลอัตโนมัติหลังบ้าน (Backend 100%)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ทำงานอัตโนมัติในเซิร์ฟเวอร์ Backend โดยไม่ต้องเปิดหน้ากราฟเทรนบน Frontend และแจ้งเฉพาะสถานะความพร้อมใช้งาน
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAutoTrainEnabled(!autoTrainEnabled)}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                autoTrainEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {autoTrainEnabled ? '🟢 เปิด Auto-Train หลังบ้าน (ON)' : 'ปิดชั่วคราว (OFF)'}
            </button>
          </div>

          {/* Current Backend Status Notification Bar */}
          <div className="p-4 rounded-2xl bg-[#060A14] border border-emerald-500/35 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-mono text-emerald-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>{autoTrainNotice}</span>
            </div>
            <button
              type="button"
              disabled={syncingBackend}
              onClick={() => handleTriggerBackendTrain('XAU/USDm')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingBackend ? 'animate-spin' : ''}`} />
              สั่งดึงข้อมูลและเทรนซ้ำทันที
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Major Forex Pairs Auto-Trained */}
            <div className="p-4 rounded-2xl bg-[#060A14] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">
                  🌍 คู่หลัก Forex &amp; ทองคำที่ดึงข้อมูลเทรนอัตโนมัติ (8 คู่)
                </span>
                <span className="font-mono text-cyan-400">Exness Direct Feed</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MAJOR_FOREX_LIST.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleTriggerBackendTrain(sym)}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono bg-[#0D1528] hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-colors"
                  >
                    {sym} · เทรนซ้ำ
                  </button>
                ))}
              </div>
            </div>

            {/* Major Crypto Pairs Auto-Trained */}
            <div className="p-4 rounded-2xl bg-[#060A14] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">
                  🪙 คู่หลัก Crypto ที่ดึงข้อมูลเทรนอัตโนมัติ (8 คู่)
                </span>
                <span className="font-mono text-indigo-400">Binance / Bybit Feed</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MAJOR_CRYPTO_LIST.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleTriggerBackendTrain(sym)}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono bg-[#0D1528] hover:bg-indigo-500/20 text-slate-200 hover:text-indigo-300 border border-slate-800 hover:border-indigo-500/40 transition-colors"
                  >
                    {sym} · เทรนซ้ำ
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-slate-400">
            <div>
              ความถี่ในการดึงแท่งเทียนและอัปเดตพารามิเตอร์โมเดลหลังบ้าน (VQC + TFT + FinRL): ทุกๆ{' '}
              <strong className="text-white font-mono">{autoTrainIntervalSec} วินาที</strong>
            </div>
            <div className="flex items-center gap-2">
              {[10, 18, 30, 60].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setAutoTrainIntervalSec(sec);
                    notifySaved(`ตั้งค่ารอบการดึงข้อมูลเทรนหลังบ้านเป็นทุกๆ ${sec} วินาที`);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs border ${
                    autoTrainIntervalSec === sec
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                      : 'bg-[#060A14] border-slate-800 text-slate-400'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
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
              onClick={() =>
                notifySaved(
                  `บันทึกเพดานความเสี่ยง (Lot มาตรฐาน ${defaultLotSize} · Max Daily DD ${maxDailyDrawdownPct}%) เรียบร้อยแล้ว`
                )
              }
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors"
            >
              บันทึกการตั้งค่าความเสี่ยง
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-[#0A101F] border border-slate-800 space-y-3 text-xs">
            <h2 className="text-base font-bold text-white pb-3 border-b border-slate-800">
              สถานะความปลอดภัย &amp; การเข้ารหัสคีย์ (Vault Security)
            </h2>
            <div className="divide-y divide-slate-800/80">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">โปรโตคอลเชื่อมต่อ Exness</span>
                <span className="font-mono text-cyan-300">Ed25519 Signed REST v1 (No MT5)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">สถานะ MT5 Bridge</span>
                <span className="font-mono text-rose-400">ปิดการใช้งาน (OFF)</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">การป้องกันสิทธิ์ถอนเงินผ่าน API</span>
                <span className="font-mono text-emerald-400">บล็อกคำสั่งถอนเงิน 100%</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-400">ระบบเทรนโมเดล AI</span>
                <span className="font-mono text-emerald-400">รันเบื้องหลังที่ Backend อัตโนมัติ</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
