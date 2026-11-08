import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Filter,
  KeyRound,
  Layers,
  Lock,
  Play,
  Power,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Square,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import NovaChatOSView from './NovaChatOSView';
import SystemSettingsView from './SystemSettingsView';
import LiveTradingTerminalView from './LiveTradingTerminalView';
import NovaProWorkspaceView from './NovaProWorkspaceView';
import TradingDashboardView from './dashboard/TradingDashboardView';
import TradingIntelligenceView from './intelligence/TradingIntelligenceView';
import BacktestSimulatorView from './backtest/BacktestSimulatorView';
import TradingInfrastructureView from './infrastructure/TradingInfrastructureView';
import LearningUniverseView from './learning/LearningUniverseView';

export type TabId =
  | 'dashboard'
  | 'intelligence'
  | 'backtest'
  | 'infrastructure'
  | 'learning'
  | 'market'
  | 'trading'
  | 'portfolio'
  | 'settings';

export type SubscriptionPlanId = 'free' | 'pro' | 'elite';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  thaiTitle: string;
  badgeText: string;
  priceMonthly: string;
  maxBots: number;
  description: string;
  features: string[];
  accentGradient: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free Starter',
    thaiTitle: 'ระดับเริ่มต้น (ดูสัญญาณตลาด)',
    badgeText: 'FREE PREVIEW',
    priceMonthly: '$0 / เดือน',
    maxBots: 0,
    description:
      'ดูรายชื่อคู่เงินจาก Broker และติดตามสัญญาณตลาดสด ต้องอัปเกรดแพ็คเกจเพื่อกดเลือกคู่เงิน + กลยุทธ์และสั่งรันบอท AI',
    features: [
      'ดึงรายชื่อคู่เงินจริงจากบัญชี Broker ที่ Login อยู่ได้ครบทุกคู่',
      'ดูสัญญาณ FEAT ENGINE (dist / pa / ob / fvg / sweep) แบบเรียลไทม์',
      'ยังไม่สามารถกดผูกกลยุทธ์เข้าพอร์ตหรือสั่งเริ่มเทรดอัตโนมัติได้',
    ],
    accentGradient: 'from-slate-700 to-slate-900',
  },
  {
    id: 'pro',
    name: 'Pro Trader Plan',
    thaiTitle: 'ระดับ 2 โปรเทรดเดอร์ • เลือกได้ 3 บอท',
    badgeText: 'PRO PLAN',
    priceMonthly: '$49 / เดือน',
    maxBots: 3,
    description:
      'ปลดล็อกการเลือกคู่เงินจาก Broker แล้วจับคู่กับกลยุทธ์ AI ได้สูงสุด 3 คู่ พร้อมระบบปรับความเสี่ยงอัตโนมัติ',
    features: [
      'เลือกคู่เงินจาก Broker แล้วผูกกลยุทธ์ AI Auto Trading Fleet ได้สูงสุด 3 บอท',
      'เปิด/ปิด การซื้อขายอัตโนมัติ และปรับความเสี่ยง 0.5% - 1.5% ต่อบอท',
      'เชื่อมต่อ Backend Auto-Train 16 คู่หลักอัตโนมัติ',
    ],
    accentGradient: 'from-[#6D28D9] via-[#9333EA] to-[#EC4899]',
  },
  {
    id: 'elite',
    name: 'Elite Tier 3 Fleet',
    thaiTitle: 'ระดับ 3 เอลีต • การเข้าถึงระดับเอลีต',
    badgeText: 'ELITE TIER 3',
    priceMonthly: '$99 / เดือน',
    maxBots: 99,
    description:
      'ปลดล็อกการเลือกคู่เงินจาก Broker และเลือกกลยุทธ์ AI ได้ไม่จำกัดจำนวน พร้อมปุ่มเริ่มทั้งหมด, หยุดฉุกเฉิน และ RISK SYNC',
    features: [
      'เลือกคู่เงินใน Broker ที่ Login แล้วเลือกกลยุทธ์เทรดได้ไม่จำกัดครบทุกคู่',
      'ควบคุมกองทัพ AI ทั้งหมดในคลิกเดียว (เริ่มทั้งหมด / หยุดฉุกเฉิน / RISK SYNC)',
      'เชื่อมต่อแจ้งเตือน Discord & Telegram (@meanrejection_bot) เต็มรูปแบบ',
    ],
    accentGradient: 'from-emerald-500 via-teal-500 to-cyan-600',
  },
];

export interface BrokerInstrumentItem {
  symbol: string;
  displayName: string;
  group: 'Metals & Commodities' | 'Forex Majors' | 'Crypto Majors';
  price: number;
  decimals: number;
  spreadLabel: string;
  change24h: number;
}

export interface StrategyBlueprintItem {
  id: string;
  shortTitle: string;
  badgeLabel: string;
  rrLabel: string;
  winRatePct: number;
  profitFactor: number;
  tp1HitPct: number;
  tp2HitPct: number;
  confluenceScore: number;
  setupGrade: string;
  featHeadline: string;
  featTags: string[];
  description: string;
  accentColor: 'amber' | 'indigo' | 'emerald' | 'cyan';
}

export const STRATEGY_BLUEPRINTS: StrategyBlueprintItem[] = [
  {
    id: 'smc-mean-rejection',
    shortTitle: 'การปฏิเสธค่าเฉลี่ย',
    badgeLabel: 'ซึ่งอนุรักษนิยม',
    rrLabel: 'RR 1.5 / 3.0',
    winRatePct: 51.0,
    profitFactor: 1.92,
    tp1HitPct: 68,
    tp2HitPct: 42,
    confluenceScore: 5,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: '4H OB + ระยะ 12% + PA แข็งแกร่ง + FVG',
    featTags: [
      'การกระจาย: 12%',
      'pa: การปฏิเสธขาลงอย่างรุนแรง',
      'ob: 4H OB บรรเทาลง 78%',
      'fvg: 5m FVG มีอยู่',
      'กวาดล้าง: คว้าสภาพคล่องต่ำ',
    ],
    description: 'เน้นดักจังหวะราคาปฏิเสธกรอบ Order Block 4 ชั่วโมง ร่วมกับช่องว่าง FVG 5 นาที',
    accentColor: 'amber',
  },
  {
    id: 'momentum-bos-ob',
    shortTitle: 'โมเมนตัม',
    badgeLabel: 'ติดตามเทรนด์',
    rrLabel: 'RR 1.5 / 3.2',
    winRatePct: 46.5,
    profitFactor: 1.76,
    tp1HitPct: 62,
    tp2HitPct: 38,
    confluenceScore: 5,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: '15m BOS + Momentum PA + OB',
    featTags: [
      'การกระจาย: 8%',
      'pa: โมเมนตัมขาขึ้น',
      'ob: 15m CHoCH ยืนยันแล้ว',
      'fvg: ช่องว่างถูกเติมเต็ม 60%',
      'กวาด: ไม่มีการกวาด',
    ],
    description: 'ตามเทรนด์เมื่อเกิด Break of Structure (BOS) และ CHoCH ในไทม์เฟรม 15 นาที',
    accentColor: 'indigo',
  },
  {
    id: 'london-liquidity-sweep',
    shortTitle: 'คลื่นสภาพคล่อง SMC',
    badgeLabel: 'เก็งกำไรสภาพคล่อง',
    rrLabel: 'RR 1.8 / 3.5',
    winRatePct: 54.8,
    profitFactor: 2.18,
    tp1HitPct: 74,
    tp2HitPct: 49,
    confluenceScore: 6,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: 'London Sweep + 1H Order Block + FVG Displacement',
    featTags: [
      'การกระจาย: 14%',
      'pa: แท่งเทียนกลืนกินขาขึ้น',
      'ob: 1H OB แข็งแกร่ง 86%',
      'fvg: 15m FVG ซ้อนทับ',
      'กวาดล้าง: กวาด Low เซสชันเอเชีย',
    ],
    description: 'ดักจังหวะกวาด Stop Loss ช่วงเปิดตลาดลอนดอน/นิวยอร์ก แล้วดึงกลับเข้าโซน FVG',
    accentColor: 'emerald',
  },
  {
    id: 'quantum-dynamic-grid',
    shortTitle: 'ควอนตัมไดนามิกกริด',
    badgeLabel: 'กระจายไม้ตาม ATR',
    rrLabel: 'RR 1.4 / 2.8',
    winRatePct: 58.2,
    profitFactor: 2.05,
    tp1HitPct: 76,
    tp2HitPct: 51,
    confluenceScore: 5,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: 'QAOA Dynamic Grid + Kalman Mean Reversion + ATR Guard',
    featTags: [
      'การกระจาย: 10%',
      'pa: เคลื่อนไหวในกรอบสมดุล',
      'ob: โซนสะสมพลัง 1H',
      'fvg: สมดุลสภาพคล่อง',
      'กวาดล้าง: ป้องกันลากด้วย ATR SL',
    ],
    description: 'คำนวณระยะห่างไม้กริดอัตโนมัติตามค่า ATR และความผันผวน พร้อม SL ป้องกันพอร์ต',
    accentColor: 'cyan',
  },
];

const FALLBACK_BROKER_CATALOGS: Record<
  'exness' | 'icmarkets' | 'binance' | 'bybit',
  {
    brokerName: string;
    serverLabel: string;
    accountId: string;
    protocol: string;
    instruments: BrokerInstrumentItem[];
  }
> = {
  exness: {
    brokerName: 'Exness Trader API / MT5',
    serverLabel: 'Exness-Real14 (Ed25519 Direct API)',
    accountId: '23908764',
    protocol: 'Exness REST v1 / MT5 Bridge',
    instruments: [
      { symbol: 'XAU/USDm', displayName: 'ทองคำสปอต (Gold vs USD)', group: 'Metals & Commodities', price: 2748.6, decimals: 2, spreadLabel: '1.2 pips', change24h: 1.42 },
      { symbol: 'XAG/USDm', displayName: 'แร่เงินสปอต (Silver vs USD)', group: 'Metals & Commodities', price: 33.84, decimals: 2, spreadLabel: '1.8 pips', change24h: 0.95 },
      { symbol: 'EUR/USDm', displayName: 'ยูโร / ดอลลาร์สหรัฐ', group: 'Forex Majors', price: 1.0842, decimals: 4, spreadLabel: '0.6 pips', change24h: 0.38 },
      { symbol: 'GBP/USDm', displayName: 'ปอนด์อังกฤษ / ดอลลาร์สหรัฐ', group: 'Forex Majors', price: 1.2982, decimals: 4, spreadLabel: '0.8 pips', change24h: 0.51 },
      { symbol: 'USD/JPYm', displayName: 'ดอลลาร์สหรัฐ / เยนญี่ปุ่น', group: 'Forex Majors', price: 152.45, decimals: 2, spreadLabel: '0.7 pips', change24h: -0.32 },
      { symbol: 'GBP/JPYm', displayName: 'ปอนด์อังกฤษ / เยนญี่ปุ่น', group: 'Forex Majors', price: 198.45, decimals: 2, spreadLabel: '1.4 pips', change24h: -0.24 },
      { symbol: 'AUD/USDm', displayName: 'ดอลลาร์ออสเตรเลีย / ดอลลาร์สหรัฐ', group: 'Forex Majors', price: 0.6594, decimals: 4, spreadLabel: '0.8 pips', change24h: 0.29 },
      { symbol: 'USD/CADm', displayName: 'ดอลลาร์สหรัฐ / ดอลลาร์แคนาดา', group: 'Forex Majors', price: 1.3892, decimals: 4, spreadLabel: '0.9 pips', change24h: 0.18 },
      { symbol: 'USD/CHFm', displayName: 'ดอลลาร์สหรัฐ / ฟรังก์สวิส', group: 'Forex Majors', price: 0.8648, decimals: 4, spreadLabel: '0.8 pips', change24h: -0.14 },
      { symbol: 'NZD/USDm', displayName: 'ดอลลาร์นิวซีแลนด์ / ดอลลาร์สหรัฐ', group: 'Forex Majors', price: 0.5986, decimals: 4, spreadLabel: '1.0 pips', change24h: 0.22 },
      { symbol: 'BTC/USDm', displayName: 'Bitcoin CFD (Exness Zero Spread)', group: 'Crypto Majors', price: 62931.55, decimals: 2, spreadLabel: '$12.0', change24h: 0.75 },
      { symbol: 'ETH/USDm', displayName: 'Ethereum CFD (Exness Zero Spread)', group: 'Crypto Majors', price: 3098.51, decimals: 2, spreadLabel: '$1.8', change24h: 5.5 },
    ],
  },
  icmarkets: {
    brokerName: 'IC Markets Raw Spread (MT5 / API)',
    serverLabel: 'ICMarketsSC-MT5-4 (Raw Spread)',
    accountId: '51092841',
    protocol: 'MetaTrader 5 / cTrader FIX API',
    instruments: [
      { symbol: 'XAU/USD', displayName: 'Gold Raw Spread (IC Markets)', group: 'Metals & Commodities', price: 2748.55, decimals: 2, spreadLabel: '0.5 pips', change24h: 1.42 },
      { symbol: 'EUR/USD', displayName: 'Euro / US Dollar (Raw Spread)', group: 'Forex Majors', price: 1.0842, decimals: 4, spreadLabel: '0.1 pips', change24h: 0.38 },
      { symbol: 'GBP/USD', displayName: 'British Pound / US Dollar (Raw)', group: 'Forex Majors', price: 1.2982, decimals: 4, spreadLabel: '0.2 pips', change24h: 0.51 },
      { symbol: 'USD/JPY', displayName: 'US Dollar / Japanese Yen (Raw)', group: 'Forex Majors', price: 152.45, decimals: 2, spreadLabel: '0.1 pips', change24h: -0.32 },
      { symbol: 'GBP/JPY', displayName: 'Pound / Yen (Raw Spread)', group: 'Forex Majors', price: 198.45, decimals: 2, spreadLabel: '0.4 pips', change24h: -0.24 },
      { symbol: 'AUD/USD', displayName: 'Australian Dollar / USD (Raw)', group: 'Forex Majors', price: 0.6594, decimals: 4, spreadLabel: '0.2 pips', change24h: 0.29 },
      { symbol: 'USD/CAD', displayName: 'US Dollar / Canadian Dollar', group: 'Forex Majors', price: 1.3892, decimals: 4, spreadLabel: '0.2 pips', change24h: 0.18 },
      { symbol: 'BTC/USD', displayName: 'Bitcoin CFD (IC Markets)', group: 'Crypto Majors', price: 62930.0, decimals: 2, spreadLabel: '$8.5', change24h: 0.75 },
    ],
  },
  binance: {
    brokerName: 'Binance Futures & Spot',
    serverLabel: 'Binance USDⓈ-M Perpetual Mainnet',
    accountId: 'BN-88412',
    protocol: 'Binance HMAC-SHA256 REST v3',
    instruments: [
      { symbol: 'BTC/USDT', displayName: 'Bitcoin Perpetual (BTCUSDT)', group: 'Crypto Majors', price: 62931.55, decimals: 2, spreadLabel: '0.01%', change24h: 0.75 },
      { symbol: 'ETH/USDT', displayName: 'Ethereum Perpetual (ETHUSDT)', group: 'Crypto Majors', price: 3098.51, decimals: 2, spreadLabel: '0.01%', change24h: 5.5 },
      { symbol: 'SOL/USDT', displayName: 'Solana Perpetual (SOLUSDT)', group: 'Crypto Majors', price: 173.29, decimals: 2, spreadLabel: '0.02%', change24h: 2.35 },
      { symbol: 'TON/USDT', displayName: 'Toncoin Perpetual (TONUSDT)', group: 'Crypto Majors', price: 6.43, decimals: 2, spreadLabel: '0.03%', change24h: -3.48 },
      { symbol: 'BNB/USDT', displayName: 'BNB Perpetual (BNBUSDT)', group: 'Crypto Majors', price: 594.8, decimals: 2, spreadLabel: '0.01%', change24h: 1.18 },
      { symbol: 'XRP/USDT', displayName: 'Ripple Perpetual (XRPUSDT)', group: 'Crypto Majors', price: 0.5482, decimals: 4, spreadLabel: '0.02%', change24h: 0.92 },
      { symbol: 'DOGE/USDT', displayName: 'Dogecoin Perpetual (DOGEUSDT)', group: 'Crypto Majors', price: 0.1642, decimals: 4, spreadLabel: '0.02%', change24h: 4.15 },
      { symbol: 'ADA/USDT', displayName: 'Cardano Perpetual (ADAUSDT)', group: 'Crypto Majors', price: 0.3685, decimals: 4, spreadLabel: '0.02%', change24h: -0.65 },
    ],
  },
  bybit: {
    brokerName: 'Bybit Unified Trading',
    serverLabel: 'Bybit V5 Linear & Gold USDT',
    accountId: 'BY-51902',
    protocol: 'Bybit Unified REST V5',
    instruments: [
      { symbol: 'BTCUSDT.P', displayName: 'Bitcoin Linear Perp (Bybit)', group: 'Crypto Majors', price: 62935.0, decimals: 2, spreadLabel: '0.01%', change24h: 0.76 },
      { symbol: 'ETHUSDT.P', displayName: 'Ethereum Linear Perp (Bybit)', group: 'Crypto Majors', price: 3099.1, decimals: 2, spreadLabel: '0.01%', change24h: 5.52 },
      { symbol: 'SOLUSDT.P', displayName: 'Solana Linear Perp (Bybit)', group: 'Crypto Majors', price: 173.35, decimals: 2, spreadLabel: '0.02%', change24h: 2.38 },
      { symbol: 'TONUSDT.P', displayName: 'Toncoin Linear Perp (Bybit)', group: 'Crypto Majors', price: 6.43, decimals: 2, spreadLabel: '0.03%', change24h: -3.48 },
      { symbol: 'PAXG/USDT', displayName: 'Gold Tokenized (PAXG/USDT)', group: 'Metals & Commodities', price: 2751.2, decimals: 2, spreadLabel: '0.03%', change24h: 1.44 },
      { symbol: 'EUR/USDT', displayName: 'Euro Spot / Perp (Bybit)', group: 'Forex Majors', price: 1.0845, decimals: 4, spreadLabel: '0.02%', change24h: 0.39 },
    ],
  },
};

function computePriceLevels(price: number, decimals: number) {
  const slDist = price > 1000 ? price * 0.005 : price > 10 ? price * 0.008 : price * 0.0035;
  const entry = price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sl = (price - slDist).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const tp1 = (price + slDist * 1.5).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const tp2 = (price + slDist * 3.0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return { entry, sl, tp1, tp2 };
}

interface TopAssetCardData {
  id: string;
  symbol: string;
  name: string;
  consensusLabel: string;
  category: 'crypto' | 'forex';
  price: number;
  decimals: number;
  growth24h: number;
  iconBg: string;
  iconSymbol: string;
  sparkline: number[];
}

const TOP_ASSETS_DATA: TopAssetCardData[] = [
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Etherium (ETH)',
    consensusLabel: 'Proof of Stake',
    category: 'crypto',
    price: 3098.51,
    decimals: 2,
    growth24h: 5.5,
    iconBg: 'bg-[#3B82F6]/20 text-[#60A5FA] border-[#3B82F6]/40',
    iconSymbol: 'Ξ',
    sparkline: [28, 32, 30, 39, 44, 41, 49, 58, 54, 66, 75, 82],
  },
  {
    id: 'sol',
    symbol: 'SOL',
    name: 'Solana (SOL)',
    consensusLabel: 'Proof of Stake',
    category: 'crypto',
    price: 173.29,
    decimals: 2,
    growth24h: 2.35,
    iconBg: 'bg-[#10B981]/20 text-[#34D399] border-[#10B981]/40',
    iconSymbol: '≡',
    sparkline: [25, 29, 34, 31, 37, 45, 42, 48, 55, 59, 64, 70],
  },
  {
    id: 'ton',
    symbol: 'TON',
    name: 'Toncoin (TON)',
    consensusLabel: 'Proof of Stake',
    category: 'crypto',
    price: 6.43,
    decimals: 2,
    growth24h: -3.48,
    iconBg: 'bg-[#06B6D4]/20 text-[#38BDF8] border-[#06B6D4]/40',
    iconSymbol: '▽',
    sparkline: [68, 65, 69, 60, 56, 58, 49, 44, 46, 39, 34, 28],
  },
  {
    id: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin (BTC)',
    consensusLabel: 'Proof of Work',
    category: 'crypto',
    price: 62931.55,
    decimals: 2,
    growth24h: 0.75,
    iconBg: 'bg-[#F59E0B]/20 text-[#FBBF24] border-[#F59E0B]/40',
    iconSymbol: '₿',
    sparkline: [42, 44, 43, 47, 51, 49, 54, 57, 56, 61, 65, 68],
  },
  {
    id: 'xau',
    symbol: 'XAU/USDm',
    name: 'Gold Spot (XAU)',
    consensusLabel: 'Major Safe Haven',
    category: 'forex',
    price: 2748.6,
    decimals: 2,
    growth24h: 1.42,
    iconBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    iconSymbol: 'Au',
    sparkline: [30, 35, 38, 36, 44, 50, 53, 58, 62, 69, 74, 80],
  },
  {
    id: 'eurusd',
    symbol: 'EUR/USDm',
    name: 'Euro / US Dollar',
    consensusLabel: 'Forex Major',
    category: 'forex',
    price: 1.0842,
    decimals: 4,
    growth24h: 0.38,
    iconBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    iconSymbol: '€',
    sparkline: [40, 39, 42, 45, 44, 48, 52, 50, 55, 58, 60, 64],
  },
  {
    id: 'gbpjpy',
    symbol: 'GBP/JPYm',
    name: 'Pound / Yen',
    consensusLabel: 'Forex Major',
    category: 'forex',
    price: 198.45,
    decimals: 2,
    growth24h: -0.24,
    iconBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    iconSymbol: '£',
    sparkline: [62, 60, 58, 61, 55, 52, 50, 53, 48, 45, 43, 41],
  },
];

export interface FleetBotConfig {
  id: string;
  strategyId: string;
  name: string;
  strategyBadge: string;
  pair: string;
  brokerSource: string;
  connectionMode?: 'mt5' | 'api';
  category: 'crypto' | 'forex';
  timeframe: string;
  rrLabel: string;
  requiredPlan: 'pro' | 'elite';
  selectedInPackage: boolean;
  running: boolean;
  autoTradeEnabled: boolean;
  riskPct: number;
  todayPnlBaht: number;
  winRatePct: number;
  profitFactor: number;
  totalTrades: number;
  tp1HitPct: number;
  tp2HitPct: number;
  positionStateLabel: string;
  positionIsLong: boolean;
  entryPrice: string;
  stopLossPrice: string;
  tp1Price: string;
  tp2Price: string;
  confluenceScore: number;
  setupGrade: string;
  featHeadline: string;
  featTags: string[];
  liveScanningBanner?: string;
  logs: string[];
  accentColor: 'amber' | 'indigo' | 'emerald' | 'cyan';
}

const INITIAL_FLEET_BOTS: FleetBotConfig[] = [
  {
    id: 'bot-ai-btc',
    strategyId: 'smc-mean-rejection',
    name: 'การปฏิเสธค่าเฉลี่ย AI-BTC',
    strategyBadge: 'ซึ่งอนุรักษนิยม',
    pair: 'BTC/USDm',
    brokerSource: 'Exness #23908764',
    category: 'crypto',
    timeframe: '15 นาที',
    rrLabel: 'RR 1.5 / 3.0',
    requiredPlan: 'pro',
    selectedInPackage: true,
    running: false,
    autoTradeEnabled: true,
    riskPct: 1.0,
    todayPnlBaht: 343,
    winRatePct: 51.0,
    profitFactor: 1.92,
    totalTrades: 84,
    tp1HitPct: 68,
    tp2HitPct: 42,
    positionStateLabel: 'แฟลต +0.0R',
    positionIsLong: false,
    entryPrice: '66,842.20',
    stopLossPrice: '66,510.00',
    tp1Price: '67,340.50',
    tp2Price: '68,120.00',
    confluenceScore: 5,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: '4H OB + ระยะ 12% + PA แข็งแกร่ง + FVG',
    featTags: [
      'การกระจาย: 12%',
      'pa: การปฏิเสธขาลงอย่างรุนแรง',
      'ob: 4H OB บรรเทาลง 78%',
      'fvg: 5m FVG มีอยู่',
      'กวาดล้าง: คว้าสภาพคล่องต่ำ',
    ],
    logs: [
      'คำสั่งทำงาน - คำสั่ง Start',
      '[09:12] ระบบเริ่มต้นทำงานแล้ว',
      '[09:14] กำลังรอโครงสร้าง 4H',
    ],
    accentColor: 'amber',
  },
  {
    id: 'bot-ai-eth',
    strategyId: 'momentum-bos-ob',
    name: 'โมเมนตัม AI-ETH',
    strategyBadge: 'ติดตามเทรนด์',
    pair: 'ETH/USDm',
    brokerSource: 'Exness #23908764',
    category: 'crypto',
    timeframe: '15 นาที',
    rrLabel: 'RR 1.5 / 3.2',
    requiredPlan: 'pro',
    selectedInPackage: true,
    running: true,
    autoTradeEnabled: true,
    riskPct: 1.0,
    todayPnlBaht: -52,
    winRatePct: 46.5,
    profitFactor: 1.76,
    totalTrades: 112,
    tp1HitPct: 62,
    tp2HitPct: 38,
    positionStateLabel: 'ซื้อ +0.4R',
    positionIsLong: true,
    entryPrice: '2,641.80',
    stopLossPrice: '2,618.40',
    tp1Price: '2,678.20',
    tp2Price: '2,721.00',
    confluenceScore: 5,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: '15m BOS + Momentum PA + OB',
    featTags: [
      'การกระจาย: 8%',
      'pa: โมเมนตัมขาขึ้น',
      'ob: 15m CHoCH ยืนยันแล้ว',
      'fvg: ช่องว่างถูกเติมเต็ม 60%',
      'กวาด: ไม่มีการกวาด',
    ],
    liveScanningBanner:
      'AI กำลังสแกนคลื่น 4 ชั่วโมง + โซน SMC... ETH/USDm 15 นาที • ซื้อ +0.4R • คะแนน 5/6',
    logs: [
      '[08:44] TP1 อัตราความแม่นยำในการสแกน 62%',
      '[14:27] PnL -16.4 • Confluence 5/6',
    ],
    accentColor: 'indigo',
  },
  {
    id: 'bot-ai-xau',
    strategyId: 'london-liquidity-sweep',
    name: 'คลื่นสภาพคล่อง SMC AI-XAU/USDm',
    strategyBadge: 'เก็งกำไรสภาพคล่อง',
    pair: 'XAU/USDm',
    brokerSource: 'Exness #23908764',
    category: 'forex',
    timeframe: '15 นาที',
    rrLabel: 'RR 1.8 / 3.5',
    requiredPlan: 'pro',
    selectedInPackage: true,
    running: false,
    autoTradeEnabled: true,
    riskPct: 1.0,
    todayPnlBaht: 895,
    winRatePct: 54.8,
    profitFactor: 2.18,
    totalTrades: 64,
    tp1HitPct: 74,
    tp2HitPct: 49,
    positionStateLabel: 'ซื้อ +1.2R',
    positionIsLong: true,
    entryPrice: '2,742.50',
    stopLossPrice: '2,734.00',
    tp1Price: '2,756.00',
    tp2Price: '2,768.50',
    confluenceScore: 6,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: 'London Sweep + 1H Order Block + FVG Displacement',
    featTags: [
      'การกระจาย: 14%',
      'pa: แท่งเทียนกลืนกินขาขึ้น',
      'ob: 1H OB แข็งแกร่ง 86%',
      'fvg: 15m FVG ซ้อนทับ',
      'กวาดล้าง: กวาด Low เซสชันเอเชีย',
    ],
    liveScanningBanner:
      'AI ยืนยันโครงสร้างทองคำ XAU/USDm 15 นาที • ถือสถานะซื้อ +1.2R • คะแนน 6/6',
    logs: [
      '[10:05] ตรวจพบ Liquidity Sweep โซน 2,738.00',
      '[10:15] เปิดสถานะซื้ออัตโนมัติ SL 2,734.00 / TP1 2,756.00',
    ],
    accentColor: 'emerald',
  },
  {
    id: 'bot-ai-eurusd',
    strategyId: 'smc-mean-rejection',
    name: 'การปฏิเสธค่าเฉลี่ย AI-EUR/USDm',
    strategyBadge: 'ซึ่งอนุรักษนิยม',
    pair: 'EUR/USDm',
    brokerSource: 'Exness #23908764',
    category: 'forex',
    timeframe: '15 นาที',
    rrLabel: 'RR 1.5 / 3.0',
    requiredPlan: 'elite',
    selectedInPackage: true,
    running: false,
    autoTradeEnabled: false,
    riskPct: 0.8,
    todayPnlBaht: 134,
    winRatePct: 49.2,
    profitFactor: 1.85,
    totalTrades: 76,
    tp1HitPct: 65,
    tp2HitPct: 40,
    positionStateLabel: 'แฟลต +0.0R',
    positionIsLong: false,
    entryPrice: '1.0842',
    stopLossPrice: '1.0818',
    tp1Price: '1.0878',
    tp2Price: '1.0915',
    confluenceScore: 5,
    setupGrade: 'การจัดเตรียมระดับ A+',
    featHeadline: '4H OB + ระยะ 12% + PA แข็งแกร่ง + FVG',
    featTags: [
      'การกระจาย: 9%',
      'pa: ปฏิเสธแนวต้าน 4H',
      'ob: 30m OB บรรเทา 72%',
      'fvg: 15m FVG พร้อมใช้งาน',
      'กวาดล้าง: รอกวาด High ลอนดอน',
    ],
    logs: [
      '[11:20] สแกนคู่เงินหลัก EUR/USDm เสร็จสมบูรณ์',
      '[11:22] รอสัญญาณยืนยัน CHoCH ในกรอบ 15 นาที',
    ],
    accentColor: 'cyan',
  },
];

const ANALYTICS_SERIES: Record<'5D' | '7D' | '1M' | '1Y' | 'All', { points: number[]; labels: string[] }> = {
  '5D': {
    points: [
      48900, 49200, 48850, 49400, 49100, 49850, 50200, 49900, 50600, 50450,
      51100, 50800, 51400, 51950, 51500, 52100, 51750, 52300, 51850, 51695.58,
    ],
    labels: [
      'Jan 1, 2024',
      'Jan 5, 2024',
      'Jan 10, 2024',
      'Jan 15, 2024',
      'Jan 20, 2024',
      'Jan 25, 2024',
      'Jan 30, 2024',
      'Feb 5, 2024',
      'Feb 10, 2024',
      'Feb 15, 2024',
    ],
  },
  '7D': {
    points: [
      48600, 49100, 49500, 49200, 49900, 50300, 50100, 50800, 51200, 50950,
      51550, 51900, 51600, 52200, 51695.58,
    ],
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
  },
  '1M': {
    points: [
      47500, 48100, 47900, 48800, 49400, 49100, 50050, 50700, 50400, 51300,
      51850, 51695.58,
    ],
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
  },
  '1Y': {
    points: [
      36200, 38400, 40100, 39500, 42300, 44800, 43900, 46700, 48900, 50200,
      51100, 51695.58,
    ],
    labels: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'],
  },
  All: {
    points: [
      28000, 32500, 35800, 39200, 41600, 44900, 47300, 49800, 51695.58,
    ],
    labels: ['2022', '2023', '2024', '2025', '2026'],
  },
};

export default function QuickitMarketFleetView({
  initialTab = 'dashboard',
}: {
  initialTab?: TabId;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<'all' | 'crypto' | 'forex'>('crypto');
  const [analyticsRange, setAnalyticsRange] = useState<'5D' | '7D' | '1M' | '1Y' | 'All'>('5D');

  // Package Subscription State ("ให้ผู้ใช้กดเลือกได้เมื่อสมัครแพ็คเกต")
  const [currentPlanId, setCurrentPlanId] = useState<SubscriptionPlanId>('elite');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // =========================================================================
  // LOGGED-IN BROKER ACCOUNT -> CHOOSE MT5 OR API (FOR FOREX) -> FETCH PAIRS -> SELECT PAIR -> SELECT STRATEGY
  // ("ทำให้เลือกได้ระหว่างใช้mt5 หรือ api ในโบรกเกอร์forex")
  // =========================================================================
  const [loggedInBroker, setLoggedInBroker] = useState<'exness' | 'icmarkets' | 'binance' | 'bybit'>('exness');
  const [forexConnectionMode, setForexConnectionMode] = useState<'mt5' | 'api'>('api');
  const [mt5Server, setMt5Server] = useState<string>('Exness-MT5Real14');
  const [brokerAccountId, setBrokerAccountId] = useState<string>('23908764');
  const [brokerServerName, setBrokerServerName] = useState<string>(
    FALLBACK_BROKER_CATALOGS.exness.serverLabel
  );
  const [brokerProtocolLabel, setBrokerProtocolLabel] = useState<string>(
    'Exness REST API v1 (Ed25519 Signed · No MT5)'
  );
  const [brokerInstruments, setBrokerInstruments] = useState<BrokerInstrumentItem[]>(
    FALLBACK_BROKER_CATALOGS.exness.instruments
  );
  const [loadingBrokerPairs, setLoadingBrokerPairs] = useState<boolean>(false);
  const [pairGroupFilter, setPairGroupFilter] = useState<
    'ALL' | 'Metals & Commodities' | 'Forex Majors' | 'Crypto Majors'
  >('ALL');

  // Step 1: User selects the currency/crypto pair from their logged-in broker
  const [selectedBrokerPair, setSelectedBrokerPair] = useState<BrokerInstrumentItem>(
    FALLBACK_BROKER_CATALOGS.exness.instruments[0]
  );
  // Step 2: User selects the AI Strategy + Timeframe + Risk for the chosen pair
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(STRATEGY_BLUEPRINTS[0].id);
  const [selectedBuilderTimeframe, setSelectedBuilderTimeframe] = useState<string>('15 นาที');
  const [selectedBuilderRisk, setSelectedBuilderRisk] = useState<number>(1.0);

  // Market Fleet State (Image 2)
  const [fleetBots, setFleetBots] = useState<FleetBotConfig[]>(INITIAL_FLEET_BOTS);
  const [marketFilter, setMarketFilter] = useState<'all' | 'running' | 'crypto' | 'forex'>('all');

  // Backend Auto-Train compact status
  const [autoTrainTick, setAutoTrainTick] = useState(0);

  const isForexBrokerSelected =
    loggedInBroker === 'exness' || loggedInBroker === 'icmarkets';

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Fetch tradable pairs from the logged-in broker account via Backend API (passing connectionMode=mt5 or api)
  async function syncBrokerInstruments(
    targetBroker: 'exness' | 'icmarkets' | 'binance' | 'bybit',
    customAccountId?: string,
    customConnMode?: 'mt5' | 'api',
    customMt5Server?: string
  ) {
    setLoadingBrokerPairs(true);
    const mode = customConnMode || forexConnectionMode;
    const serverParam = customMt5Server || mt5Server;
    const accId =
      customAccountId ||
      (targetBroker === 'exness'
        ? '23908764'
        : targetBroker === 'icmarkets'
        ? '51092841'
        : targetBroker === 'binance'
        ? 'BN-88412'
        : 'BY-51902');
    try {
      const res = await fetch(
        `/api/broker/instruments?broker=${targetBroker}&accountId=${encodeURIComponent(
          accId
        )}&connectionMode=${mode}&mt5Server=${encodeURIComponent(serverParam)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.instruments) && data.instruments.length > 0) {
          setBrokerInstruments(data.instruments);
          setBrokerServerName(
            data.serverLabel || FALLBACK_BROKER_CATALOGS[targetBroker].serverLabel
          );
          setBrokerProtocolLabel(
            data.protocol || FALLBACK_BROKER_CATALOGS[targetBroker].protocol
          );
          setBrokerAccountId(data.accountId || accId);
          setSelectedBrokerPair(data.instruments[0]);
          setLoadingBrokerPairs(false);
          return;
        }
      }
    } catch {
      // Fallback to local broker catalog if offline
    }
    const fallback = FALLBACK_BROKER_CATALOGS[targetBroker];
    setBrokerInstruments(fallback.instruments);
    setBrokerServerName(
      mode === 'mt5' && (targetBroker === 'exness' || targetBroker === 'icmarkets')
        ? `${serverParam} (MT5 Terminal / EA Bridge)`
        : fallback.serverLabel
    );
    setBrokerProtocolLabel(
      mode === 'mt5' && (targetBroker === 'exness' || targetBroker === 'icmarkets')
        ? 'MetaTrader 5 (MT5 Python Worker Bridge)'
        : fallback.protocol
    );
    setBrokerAccountId(accId);
    setSelectedBrokerPair(fallback.instruments[0]);
    setLoadingBrokerPairs(false);
  }

  useEffect(() => {
    syncBrokerInstruments(loggedInBroker, undefined, forexConnectionMode, mt5Server);
  }, [loggedInBroker, forexConnectionMode, mt5Server]);

  // Simulate 2-second memory tick for running bots & backend auto-train status
  useEffect(() => {
    const timer = setInterval(() => {
      setAutoTrainTick((t) => t + 1);
      setFleetBots((prev) =>
        prev.map((bot) => {
          if (!bot.running) return bot;
          const delta = Math.round((Math.random() - 0.44) * 18);
          return {
            ...bot,
            todayPnlBaht: bot.todayPnlBaht + delta,
          };
        })
      );
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const currentPlan = useMemo(
    () => SUBSCRIPTION_PLANS.find((p) => p.id === currentPlanId) || SUBSCRIPTION_PLANS[2],
    [currentPlanId]
  );

  const selectedStrategyObj = useMemo(
    () =>
      STRATEGY_BLUEPRINTS.find((s) => s.id === selectedStrategyId) || STRATEGY_BLUEPRINTS[0],
    [selectedStrategyId]
  );

  const filteredBrokerInstruments = useMemo(() => {
    return brokerInstruments.filter((inst) => {
      const matchGroup = pairGroupFilter === 'ALL' || inst.group === pairGroupFilter;
      const matchQuery =
        !searchQuery.trim() ||
        inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.displayName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchGroup && matchQuery;
    });
  }, [brokerInstruments, pairGroupFilter, searchQuery]);

  function showNotification(msg: string) {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  // Handler when user finishes Step 1 (Select Pair from Broker) + Step 2 (Select Strategy)
  function handleDeployPairWithStrategy(startImmediately: boolean) {
    if (currentPlanId === 'free') {
      setShowPlanModal(true);
      showNotification(
        'กรุณาสมัครแพ็คเกจ Pro หรือ ระดับ 3 เอลีต ก่อนนำคู่เงินและกลยุทธ์เข้ากองทัพ AI'
      );
      return;
    }

    const levels = computePriceLevels(selectedBrokerPair.price, selectedBrokerPair.decimals);
    const isCrypto = selectedBrokerPair.group === 'Crypto Majors';
    const connBadge = isForexBrokerSelected
      ? forexConnectionMode === 'mt5'
        ? `MT5 (${mt5Server})`
        : 'Direct API'
      : 'REST API';
    const brokerLabel = `${loggedInBroker.toUpperCase()} #${brokerAccountId} · ${connBadge}`;
    const newBotName = `${selectedStrategyObj.shortTitle} AI-${selectedBrokerPair.symbol}`;

    setFleetBots((prev) => {
      const existingIdx = prev.findIndex((b) => b.pair === selectedBrokerPair.symbol);
      const nowStr = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const configuredBot: FleetBotConfig = {
        id: existingIdx >= 0 ? prev[existingIdx].id : `bot-${Date.now()}`,
        strategyId: selectedStrategyObj.id,
        name: newBotName,
        strategyBadge: selectedStrategyObj.badgeLabel,
        pair: selectedBrokerPair.symbol,
        brokerSource: brokerLabel,
        connectionMode: isForexBrokerSelected ? forexConnectionMode : 'api',
        category: isCrypto ? 'crypto' : 'forex',
        timeframe: selectedBuilderTimeframe,
        rrLabel: selectedStrategyObj.rrLabel,
        requiredPlan: 'pro',
        selectedInPackage: true,
        running: startImmediately,
        autoTradeEnabled: true,
        riskPct: selectedBuilderRisk,
        todayPnlBaht: existingIdx >= 0 ? prev[existingIdx].todayPnlBaht : 0,
        winRatePct: selectedStrategyObj.winRatePct,
        profitFactor: selectedStrategyObj.profitFactor,
        totalTrades: existingIdx >= 0 ? prev[existingIdx].totalTrades : 42,
        tp1HitPct: selectedStrategyObj.tp1HitPct,
        tp2HitPct: selectedStrategyObj.tp2HitPct,
        positionStateLabel: startImmediately ? 'ซื้อ +0.2R' : 'แฟลต +0.0R',
        positionIsLong: startImmediately,
        entryPrice: levels.entry,
        stopLossPrice: levels.sl,
        tp1Price: levels.tp1,
        tp2Price: levels.tp2,
        confluenceScore: selectedStrategyObj.confluenceScore,
        setupGrade: selectedStrategyObj.setupGrade,
        featHeadline: selectedStrategyObj.featHeadline,
        featTags: selectedStrategyObj.featTags,
        liveScanningBanner: startImmediately
          ? `AI กำลังสแกน ${selectedBrokerPair.symbol} (${brokerLabel}) • กลยุทธ์ ${selectedStrategyObj.shortTitle} • ${selectedBuilderTimeframe}`
          : undefined,
        logs: [
          `[${nowStr}] ดึงคู่เงิน ${selectedBrokerPair.symbol} ผ่านโหมด ${connBadge} (Spread ${selectedBrokerPair.spreadLabel})`,
          `[${nowStr}] ผูกกลยุทธ์ "${selectedStrategyObj.shortTitle}" (${selectedStrategyObj.featHeadline}) สำเร็จ`,
        ],
        accentColor: selectedStrategyObj.accentColor,
      };

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = configuredBot;
        return updated;
      }
      return [configuredBot, ...prev];
    });

    showNotification(
      `✓ เลือกคู่เงิน "${selectedBrokerPair.symbol}" (${connBadge}) และผูกกลยุทธ์ "${selectedStrategyObj.shortTitle}" เข้ากองทัพ AI เรียบร้อยแล้ว`
    );
  }

  // Allow changing Pair or Strategy directly inside any Bot Card in the Fleet
  function handleUpdateBotPairOrStrategy(
    botId: string,
    newSymbol: string,
    newStrategyId: string
  ) {
    const inst =
      brokerInstruments.find((i) => i.symbol === newSymbol) || selectedBrokerPair;
    const strat =
      STRATEGY_BLUEPRINTS.find((s) => s.id === newStrategyId) || STRATEGY_BLUEPRINTS[0];
    const levels = computePriceLevels(inst.price, inst.decimals);
    const nowStr = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setFleetBots((prev) =>
      prev.map((bot) => {
        if (bot.id !== botId) return bot;
        return {
          ...bot,
          strategyId: strat.id,
          name: `${strat.shortTitle} AI-${inst.symbol}`,
          strategyBadge: strat.badgeLabel,
          pair: inst.symbol,
          brokerSource: `${loggedInBroker.toUpperCase()} #${brokerAccountId}`,
          category: inst.group === 'Crypto Majors' ? 'crypto' : 'forex',
          rrLabel: strat.rrLabel,
          winRatePct: strat.winRatePct,
          profitFactor: strat.profitFactor,
          tp1HitPct: strat.tp1HitPct,
          tp2HitPct: strat.tp2HitPct,
          entryPrice: levels.entry,
          stopLossPrice: levels.sl,
          tp1Price: levels.tp1,
          tp2Price: levels.tp2,
          confluenceScore: strat.confluenceScore,
          setupGrade: strat.setupGrade,
          featHeadline: strat.featHeadline,
          featTags: strat.featTags,
          accentColor: strat.accentColor,
          logs: [
            `[${nowStr}] เปลี่ยนคู่เทรดเป็น ${inst.symbol} • กลยุทธ์ ${strat.shortTitle}`,
            ...bot.logs.slice(0, 2),
          ],
        };
      })
    );

    showNotification(
      `✓ อัปเดตบอทเป็นคู่เงิน ${inst.symbol} + กลยุทธ์ "${strat.shortTitle}" เรียบร้อยแล้ว`
    );
  }

  // Filter Top Assets on Dashboard (Image 1)
  const visibleTopAssets = useMemo(() => {
    return TOP_ASSETS_DATA.filter((item) => {
      const matchCategory =
        assetCategoryFilter === 'all' ? true : item.category === assetCategoryFilter;
      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.symbol.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    }).slice(0, 3);
  }, [assetCategoryFilter, searchQuery]);

  // Filter Market Bots (Image 2)
  const filteredFleetBots = useMemo(() => {
    return fleetBots.filter((bot) => {
      if (marketFilter === 'running' && !bot.running) return false;
      if (marketFilter === 'crypto' && bot.category !== 'crypto') return false;
      if (marketFilter === 'forex' && bot.category !== 'forex') return false;
      if (
        searchQuery.trim() &&
        !bot.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !bot.pair.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [fleetBots, marketFilter, searchQuery]);

  const runningBotsCount = useMemo(
    () => fleetBots.filter((b) => b.running).length,
    [fleetBots]
  );

  const selectedBotsCount = useMemo(
    () => fleetBots.filter((b) => b.selectedInPackage).length,
    [fleetBots]
  );

  const totalFleetPnlToday = useMemo(
    () => fleetBots.reduce((acc, b) => acc + b.todayPnlBaht, 0),
    [fleetBots]
  );

  const avgWinRate = useMemo(() => {
    if (fleetBots.length === 0) return 0;
    const sum = fleetBots.reduce((acc, b) => acc + b.winRatePct, 0);
    return (sum / fleetBots.length).toFixed(1);
  }, [fleetBots]);

  function handleSelectBotInPackage(botId: string) {
    if (currentPlanId === 'free') {
      setShowPlanModal(true);
      showNotification('กรุณาสมัครแพ็คเกจ Pro หรือ ระดับ 3 เอลีต เพื่อกดเลือกใช้งานบอท AI');
      return;
    }

    setFleetBots((prev) => {
      const target = prev.find((b) => b.id === botId);
      if (!target) return prev;

      if (!target.selectedInPackage) {
        const currentSelected = prev.filter((b) => b.selectedInPackage).length;
        if (currentSelected >= currentPlan.maxBots) {
          setShowPlanModal(true);
          showNotification(
            `แพ็คเกจ ${currentPlan.name} เลือกได้สูงสุด ${currentPlan.maxBots} บอท — อัปเกรดเป็น ระดับ 3 เอลีต เพื่อเลือกไม่จำกัด`
          );
          return prev;
        }
      }

      const nextSelected = !target.selectedInPackage;
      showNotification(
        nextSelected
          ? `✓ เลือกบอท "${target.name}" เข้าพอร์ตแพ็คเกจเรียบร้อยแล้ว`
          : `นำบอท "${target.name}" ออกจากรายการที่เลือกแล้ว`
      );

      return prev.map((b) =>
        b.id === botId
          ? {
              ...b,
              selectedInPackage: nextSelected,
              running: nextSelected ? b.running : false,
            }
          : b
      );
    });
  }

  function handleToggleBotRun(botId: string, shouldRun: boolean) {
    if (currentPlanId === 'free') {
      setShowPlanModal(true);
      showNotification('กรุณาสมัครแพ็คเกจก่อนสั่งเริ่มทำงานบอท AI');
      return;
    }

    setFleetBots((prev) =>
      prev.map((bot) => {
        if (bot.id !== botId) return bot;
        if (shouldRun && !bot.selectedInPackage) {
          showNotification(`ระบบเลือกบอท "${bot.name}" เข้าแพ็คเกจและเริ่มทำงานทันที`);
        }
        const nowStr = new Date().toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
        });
        return {
          ...bot,
          selectedInPackage: shouldRun ? true : bot.selectedInPackage,
          running: shouldRun,
          logs: shouldRun
            ? [
                `[${nowStr}] เริ่มทำงานบอท ${bot.pair} (ความเสี่ยง ${bot.riskPct.toFixed(1)}%)`,
                ...bot.logs.slice(0, 2),
              ]
            : [`[${nowStr}] หยุดการทำงานบอทชั่วคราว`, ...bot.logs.slice(0, 2)],
        };
      })
    );
  }

  function handleStartAllFleet() {
    if (currentPlanId === 'free') {
      setShowPlanModal(true);
      showNotification('กรุณาสมัครแพ็คเกจ Pro หรือ เอลีต เพื่อสั่งเริ่มกองทัพ AI ทั้งหมด');
      return;
    }
    setFleetBots((prev) =>
      prev.map((bot, idx) => {
        const canRun = idx < currentPlan.maxBots;
        return canRun ? { ...bot, selectedInPackage: true, running: true } : bot;
      })
    );
    showNotification('▷ เริ่มการทำงานกองทัพ AI Auto Trading Fleet ทั้งหมดในแพ็คเกจแล้ว');
  }

  function handleEmergencyStopAll() {
    setFleetBots((prev) => prev.map((bot) => ({ ...bot, running: false })));
    showNotification('🔇 หยุดฉุกเฉินบอท AI ทุกตัวเรียบร้อยแล้ว (Emergency Stop Executed)');
  }

  function handleRiskSyncAll() {
    setFleetBots((prev) => prev.map((bot) => ({ ...bot, riskPct: 1.0 })));
    showNotification('🎚️ RISK SYNC: ปรับความเสี่ยงทุกบอทในกองทัพเป็น 1.0% (ซึ่งอนุรักษนิยม) สำเร็จ');
  }

  // Compute Portfolio Analytics SVG coordinates (Image 1 middle-right chart)
  const analyticsChart = useMemo(() => {
    const data = ANALYTICS_SERIES[analyticsRange];
    const pts = data.points;
    const min = 47000;
    const max = 53500;
    const width = 760;
    const height = 220;
    const padLeft = 18;
    const padRight = 58;
    const padTop = 18;
    const padBottom = 28;

    const coords = pts.map((val, i) => {
      const x = padLeft + (i / (pts.length - 1)) * (width - padLeft - padRight);
      const clamped = Math.max(min, Math.min(max, val));
      const y =
        height -
        padBottom -
        ((clamped - min) / (max - min)) * (height - padTop - padBottom);
      return { x, y, val };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${
      height - padBottom
    } L ${coords[0].x.toFixed(1)} ${height - padBottom} Z`;

    return { coords, linePath, areaPath, labels: data.labels, width, height };
  }, [analyticsRange]);

  return (
    <div className="min-h-screen bg-[#090912] text-slate-100 relative overflow-x-hidden selection:bg-purple-500/30 selection:text-white">
      {/* Ambient Purple / Magenta Glow Behind Main Window (Matches Image 1 Outer Frame) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-[760px] h-[280px] rounded-full bg-gradient-to-r from-purple-600/30 via-fuchsia-500/25 to-indigo-600/30 blur-[120px]" />
        <div className="absolute bottom-[-120px] left-[-80px] w-[460px] h-[360px] rounded-full bg-gradient-to-tr from-fuchsia-600/20 via-purple-600/15 to-transparent blur-[130px]" />
      </div>

      {/* Main Window Shell (Image 1 Rounded Dark Glass Container) */}
      <div className="relative z-10 max-w-[1440px] mx-auto my-3 sm:my-5 px-3 sm:px-5">
        <div className="rounded-[30px] bg-[#141522]/95 border border-white/[0.08] shadow-[0_25px_90px_rgba(0,0,0,0.75)] backdrop-blur-2xl p-4 sm:p-6">
          {/* Top Navigation Bar (Matches Image 1 Header) */}
          <header className="flex flex-wrap items-center justify-between gap-4 pb-5">
            {/* Left: Quickit Logo + Capsule Navigation */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2.5 group text-left"
              >
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-indigo-600 flex items-center justify-center shadow-md shadow-orange-500/20">
                  <Zap className="w-4 h-4 text-white fill-white" />
                </span>
                <span className="text-lg font-extrabold tracking-tight text-white">
                  Quickit
                </span>
              </button>

              {/* Capsule Tabs: Dashboard | Market | Trading | Portfolio | Settings */}
              <nav
                aria-label="Primary Navigation"
                className="flex items-center gap-1 p-1.5 rounded-full bg-[#0C0D16] border border-white/[0.06] overflow-x-auto"
              >
                {(
                  [
                    { id: 'dashboard', label: '1. Dashboard' },
                    { id: 'intelligence', label: '2. Intelligence' },
                    { id: 'backtest', label: '3. Backtest' },
                    { id: 'infrastructure', label: '4. Infrastructure' },
                    { id: 'learning', label: '5. Learning Universe' },
                    { id: 'market', label: 'Fleet Market', badge: `Fleet (${runningBotsCount}/${fleetBots.length})` },
                    { id: 'trading', label: 'Research Chat' },
                    { id: 'settings', label: 'Settings' },
                  ] as const
                ).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-white text-[#11121D] shadow-sm font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {'badge' in tab && tab.badge && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-800 font-bold'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: Search Bar + Logged-in Broker Status + Package Status + Bell + Avatar */}
            <div className="flex items-center gap-2.5 flex-1 sm:flex-initial justify-end">
              {/* Dark Capsule Search Input */}
              <div className="relative w-full sm:w-56 md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type to search pair..."
                  className="w-full pl-9 pr-4 py-2 rounded-full bg-[#0B0C14] border border-white/[0.06] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
                />
              </div>

              {/* Logged-in Broker Badge (Click to go to Market Pair Selector) */}
              <button
                type="button"
                onClick={() => setActiveTab('market')}
                title="คลิกเพื่อเลือกคู่เงินจาก Broker ที่ Login และเลือกกลยุทธ์"
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#0B0C14] border border-emerald-500/35 text-[11px] font-mono text-emerald-300 hover:border-emerald-400 transition-colors whitespace-nowrap"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {loggedInBroker.toUpperCase()} #{brokerAccountId} ({brokerInstruments.length} คู่เงิน)
                </span>
              </button>

              {/* Active Subscription Package Pill */}
              <button
                type="button"
                onClick={() => setShowPlanModal(true)}
                className="hidden xl:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-r from-purple-600/25 via-fuchsia-600/25 to-emerald-500/20 border border-purple-400/30 text-xs font-semibold text-purple-200 hover:border-purple-400/60 transition-all whitespace-nowrap"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>{currentPlan.badgeText}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  showNotification(
                    `เชื่อมต่อ ${loggedInBroker.toUpperCase()} #${brokerAccountId} • ดึงข้อมูลคู่เงินสด ${brokerInstruments.length} คู่ • เทรนหลังบ้านรอบที่ #${142 + autoTrainTick}`
                  )
                }
                aria-label="Notifications"
                className="w-9 h-9 rounded-full bg-[#0B0C14] border border-white/[0.06] flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
              >
                <Bell className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowPlanModal(true)}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-0.5 shrink-0"
                title="ข้อมูลแพ็คเกจสมาชิก"
              >
                <div className="w-full h-full rounded-full bg-[#151624] flex items-center justify-center text-xs font-bold text-white">
                  ต้น
                </div>
              </button>
            </div>
          </header>

          {/* Toast Notification Banner */}
          {toastBanner && (
            <div className="mb-4 px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{toastBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastBanner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* =====================================================================
              TAB 1: TRADING DASHBOARD (Market Overview, XAUUSDm/BTCUSD, Candlestick Chart, Signals, AI Analysis)
             ===================================================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <TradingDashboardView />

              <div className="pt-6 border-t border-white/[0.08]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white tracking-wide font-mono uppercase">
                    Portfolio & Multi-Asset Monitor (Quickit Luxury Overview)
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Portfolio Assets</span>
                </div>
              </div>
              {/* TOP ROW: Top Trading Assets (Left 8 cols) + Portfolio Overview Donut (Right 4 cols) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Card: Top Trading Assets */}
                <div className="lg:col-span-8 rounded-[24px] bg-[#1B1C2B] border border-white/[0.06] p-5 flex flex-col justify-between">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-base font-bold text-white tracking-tight">
                        Top Trading Assets
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Recommended coins & Broker pairs ({loggedInBroker.toUpperCase()} #{brokerAccountId})
                      </p>
                    </div>

                    {/* Filter Pills matching Image 1 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setAssetCategoryFilter((prev) =>
                            prev === 'crypto' ? 'forex' : prev === 'forex' ? 'all' : 'crypto'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#242638] border border-white/[0.07] text-[11px] font-medium text-slate-200 hover:bg-[#2C2E44] transition-colors"
                      >
                        <Filter className="w-3 h-3 text-slate-400" />
                        <span>
                          {assetCategoryFilter === 'crypto'
                            ? 'Proof of Stake'
                            : assetCategoryFilter === 'forex'
                            ? 'Major Forex & Gold'
                            : 'All Assets'}
                        </span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#242638] border border-white/[0.07] text-[11px] font-medium text-slate-200"
                      >
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>24h</span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('market')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#242638] hover:bg-[#2E3047] border border-white/[0.07] text-[11px] font-semibold text-white transition-colors"
                      >
                        <span>เลือกคู่เงิน & กลยุทธ์</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 3 Inner Asset Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {visibleTopAssets.map((asset) => {
                      const isPositive = asset.growth24h >= 0;
                      const strokeColor = isPositive ? '#10B981' : '#F43F5E';
                      const gradId = `spark-${asset.id}`;
                      const min = Math.min(...asset.sparkline);
                      const max = Math.max(...asset.sparkline);
                      const range = Math.max(max - min, 1);
                      const w = 220;
                      const h = 58;
                      const pts = asset.sparkline.map((v, i) => {
                        const x = (i / (asset.sparkline.length - 1)) * w;
                        const y = h - 8 - ((v - min) / range) * (h - 16);
                        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                      });
                      const lineD = pts.join(' ');
                      const areaD = `${lineD} L ${w} ${h} L 0 ${h} Z`;

                      return (
                        <div
                          key={asset.id}
                          onClick={() => setActiveTab('market')}
                          className="cursor-pointer group rounded-[20px] bg-[#222334]/90 hover:bg-[#27293D] border border-white/[0.06] p-4 flex flex-col justify-between transition-all"
                        >
                          {/* Top Row: Icon + Name + Arrow */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold ${asset.iconBg}`}
                              >
                                {asset.iconSymbol}
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-400">
                                  {asset.consensusLabel}
                                </div>
                                <div className="text-xs font-bold text-white">
                                  {asset.name}
                                </div>
                              </div>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                          </div>

                          {/* Price & 24h Growth */}
                          <div className="mt-4">
                            <div className="text-2xl font-extrabold text-white font-mono tracking-tight">
                              $
                              {asset.price.toLocaleString('en-US', {
                                minimumFractionDigits: asset.decimals,
                                maximumFractionDigits: asset.decimals,
                              })}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                              <span
                                className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                  isPositive
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {isPositive ? (
                                  <ArrowUpRight className="w-3 h-3" />
                                ) : (
                                  <ArrowDownRight className="w-3 h-3" />
                                )}
                              </span>
                              <span
                                className={`font-semibold font-mono ${
                                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isPositive ? '+' : ''}
                                {asset.growth24h.toFixed(2)}%
                              </span>
                              <span className="text-slate-400 text-[11px]">growth</span>
                            </div>
                          </div>

                          {/* Smooth Sparkline Wave */}
                          <div className="mt-3 pt-1">
                            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 overflow-visible">
                              <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
                                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path d={areaD} fill={`url(#${gradId})`} />
                              <path
                                d={lineD}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="2.2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Card: Portfolio Overview Donut (Matches Image 1 Top-Right) */}
                <div className="lg:col-span-4 rounded-[24px] bg-[#1B1C2B] border border-white/[0.06] p-5 flex flex-col justify-between relative">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-full bg-[#25273A] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-white">
                      {brokerInstruments.length}
                    </span>
                    <div className="text-center">
                      <h2 className="text-sm font-bold text-white">Portfolio Overview</h2>
                      <p className="text-[11px] text-slate-400">Value in USD</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('portfolio')}
                      className="w-8 h-8 rounded-full bg-[#25273A] hover:bg-[#2F324A] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Center Multi-Segment Glowing Ring + 4 Corner Callouts */}
                  <div className="relative my-3 flex items-center justify-center py-2">
                    <div className="absolute top-1 left-1 text-left">
                      <div className="text-[11px] text-slate-300 font-medium">Other (5)</div>
                      <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25273A] border border-white/[0.06] text-[11px] font-mono text-slate-200">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        19%
                      </span>
                    </div>

                    <div className="absolute top-1 right-1 text-right">
                      <div className="text-[11px] text-slate-300 font-medium">Bitcoin</div>
                      <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25273A] border border-white/[0.06] text-[11px] font-mono text-slate-200">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        33%
                      </span>
                    </div>

                    <div className="absolute bottom-1 left-1 text-left">
                      <div className="text-[11px] text-slate-300 font-medium">Toncoin</div>
                      <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25273A] border border-white/[0.06] text-[11px] font-mono text-slate-200">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        22%
                      </span>
                    </div>

                    <div className="absolute bottom-1 right-1 text-right">
                      <div className="text-[11px] text-slate-300 font-medium">Etherium</div>
                      <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#25273A] border border-white/[0.06] text-[11px] font-mono text-slate-200">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        26%
                      </span>
                    </div>

                    <div className="relative w-48 h-48 flex items-center justify-center">
                      <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
                        <circle
                          cx="90"
                          cy="90"
                          r="68"
                          fill="none"
                          stroke="#25273A"
                          strokeWidth="12"
                        />
                        <circle
                          cx="90"
                          cy="90"
                          r="68"
                          fill="none"
                          stroke="#8B5CF6"
                          strokeWidth="12"
                          strokeDasharray="135 427"
                          strokeDashoffset="0"
                          strokeLinecap="round"
                        />
                        <circle
                          cx="90"
                          cy="90"
                          r="68"
                          fill="none"
                          stroke="#22D3EE"
                          strokeWidth="12"
                          strokeDasharray="105 427"
                          strokeDashoffset="-145"
                          strokeLinecap="round"
                        />
                        <circle
                          cx="90"
                          cy="90"
                          r="68"
                          fill="none"
                          stroke="#F43F5E"
                          strokeWidth="12"
                          strokeDasharray="88 427"
                          strokeDashoffset="-260"
                          strokeLinecap="round"
                        />
                        <circle
                          cx="90"
                          cy="90"
                          r="68"
                          fill="none"
                          stroke="#FACC15"
                          strokeWidth="12"
                          strokeDasharray="72 427"
                          strokeDashoffset="-356"
                          strokeLinecap="round"
                        />
                      </svg>

                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <div className="text-xl font-extrabold text-white font-mono">
                          $51,695.58
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">All Portfolio</div>
                        <div className="text-[11px] font-mono font-semibold text-emerald-400 mt-1">
                          +5.50% ↗
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* MIDDLE ROW: PRO Package Promo Card (Left 3 cols) + Portfolio Analytics Chart (Right 9 cols) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-3 rounded-[24px] bg-gradient-to-b from-[#251E42] via-[#6B21A8] to-[#EC4899] border border-white/15 p-5 flex flex-col justify-between relative overflow-hidden shadow-xl">
                  <div className="pointer-events-none absolute right-[-12px] top-24 w-20 h-20 rounded-full bg-white/10 blur-xl" />
                  <div className="pointer-events-none absolute right-4 bottom-28 w-8 h-8 rounded-full bg-emerald-400/30 border border-emerald-300/50 flex items-center justify-center text-xs font-bold text-white rotate-12 shadow-lg">
                    $
                  </div>
                  <div className="pointer-events-none absolute left-6 bottom-24 w-7 h-7 rounded-full bg-fuchsia-400/30 border border-white/40 flex items-center justify-center text-[11px] font-bold text-white -rotate-12">
                    ₿
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-bold uppercase tracking-wider text-white">
                        PRO
                      </span>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-black/30 text-emerald-300 border border-emerald-400/30">
                        Active: {currentPlan.badgeText}
                      </span>
                    </div>

                    <h3 className="mt-4 text-xl font-extrabold text-white leading-snug">
                      Become a Pro Trader
                    </h3>
                    <p className="mt-2 text-xs text-purple-100/90 leading-relaxed">
                      Maximize your returns in the crypto & forex market with our comprehensive AI investment portfolio solution!
                    </p>
                    <p className="mt-2 text-[11px] text-white/90 bg-black/25 rounded-xl px-3 py-2 border border-white/10">
                      ✨ ดึงรายชื่อคู่เงินจาก <strong>{loggedInBroker.toUpperCase()} #{brokerAccountId}</strong> แล้วเลือกกลยุทธ์ AI ในหน้า <strong>Market</strong> ได้ทันที
                    </p>
                  </div>

                  <div className="mt-6 space-y-2.5 relative z-10">
                    <button
                      type="button"
                      onClick={() => setShowPlanModal(true)}
                      className="w-full py-2.5 px-4 rounded-full bg-white text-[#141522] hover:bg-slate-100 text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.99]"
                    >
                      <span>Upgrade to Pro Plan</span>
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('market')}
                      className="w-full py-2.5 px-4 rounded-full bg-black/25 hover:bg-black/40 border border-white/20 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <span>เลือกคู่เงินจาก Broker & กลยุทธ์ →</span>
                    </button>
                  </div>
                </div>

                {/* Right Card: Portfolio Analytics */}
                <div className="lg:col-span-9 rounded-[24px] bg-[#1B1C2B] border border-white/[0.06] p-5 flex flex-col justify-between">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div>
                      <h2 className="text-base font-bold text-white">Portfolio Analytics</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        January 1, 2024 - February 28, 2024 · AI Fleet Equity Curve
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#242638] border border-white/[0.07] text-xs font-medium text-slate-200"
                      >
                        <span>Profit / Loss over time</span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      </button>

                      <div className="flex items-center gap-1 p-1 rounded-full bg-[#12131F] border border-white/[0.06]">
                        {(['5D', '7D', '1M', '1Y', 'All'] as const).map((tf) => (
                          <button
                            key={tf}
                            type="button"
                            onClick={() => setAnalyticsRange(tf)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                              analyticsRange === tf
                                ? 'bg-white text-[#12131F] font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {tf}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-2">
                    <svg
                      viewBox={`0 0 ${analyticsChart.width} ${analyticsChart.height}`}
                      className="w-full h-56 overflow-visible"
                    >
                      <defs>
                        <linearGradient id="quickitAnalyticsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818CF8" stopOpacity="0.28" />
                          <stop offset="100%" stopColor="#818CF8" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {[
                        { y: 28, label: '53.00K' },
                        { y: 78, label: '51.50K' },
                        { y: 128, label: '50.00K' },
                        { y: 178, label: '48.50K' },
                      ].map((row) => (
                        <g key={row.label}>
                          <line
                            x1="18"
                            x2={analyticsChart.width - 58}
                            y1={row.y}
                            y2={row.y}
                            stroke="rgba(255,255,255,0.07)"
                            strokeDasharray="4 4"
                            strokeWidth="1"
                          />
                          <text
                            x={analyticsChart.width - 48}
                            y={row.y + 4}
                            className="fill-slate-400 text-[10px] font-mono"
                          >
                            {row.label}
                          </text>
                        </g>
                      ))}

                      <path d={analyticsChart.areaPath} fill="url(#quickitAnalyticsGrad)" />
                      <path
                        d={analyticsChart.linePath}
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      <g transform={`translate(${analyticsChart.width - 54}, 54)`}>
                        <rect x="0" y="0" width="48" height="20" rx="10" fill="#FFFFFF" />
                        <text
                          x="24"
                          y="13"
                          textAnchor="middle"
                          className="fill-[#141522] text-[10px] font-bold font-mono"
                        >
                          51.69K
                        </text>
                      </g>
                    </svg>

                    <div className="flex items-center justify-between px-4 pt-1 text-[10px] text-slate-500 font-mono">
                      {analyticsChart.labels.map((lbl) => (
                        <span key={lbl}>{lbl}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* BOTTOM ROW: 4 Coin Ticker Cards + "See all coins" Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {[
                  TOP_ASSETS_DATA[3],
                  TOP_ASSETS_DATA[0],
                  TOP_ASSETS_DATA[1],
                  TOP_ASSETS_DATA[2],
                ].map((coin) => {
                  const up = coin.growth24h >= 0;
                  return (
                    <div
                      key={coin.id}
                      onClick={() => setActiveTab('market')}
                      className="cursor-pointer rounded-[20px] bg-[#1B1C2B] hover:bg-[#232538] border border-white/[0.06] p-4 flex flex-col justify-between transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${coin.iconBg}`}
                        >
                          {coin.iconSymbol}
                        </div>
                        <div className="text-lg font-extrabold text-white font-mono">
                          $
                          {coin.price.toLocaleString('en-US', {
                            minimumFractionDigits: coin.decimals,
                            maximumFractionDigits: coin.decimals,
                          })}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-medium text-slate-300">{coin.name}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono">
                          <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                            {up ? '+' : ''}
                            {coin.growth24h.toFixed(2)}% {up ? '↗' : '↘'}
                          </span>
                          <span className="text-slate-400 font-sans">24h growth</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setActiveTab('market')}
                  className="rounded-[20px] bg-[#1B1C2B] hover:bg-[#25273C] border border-white/[0.06] p-4 flex flex-col items-center justify-center text-center group transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-[#25273A] group-hover:bg-white group-hover:text-[#141522] flex items-center justify-center text-slate-200 transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <div className="mt-2.5 text-xs font-bold text-white">
                    See all coins & Broker Pairs
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    ดึงคู่เงินจาก Broker → เลือกกลยุทธ์
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 2: TRADING INTELLIGENCE (Elliott Wave 3, XGBoost, LSTM, SMC, Auto-Learning, Neural Net)
             ===================================================================== */}
          {activeTab === 'intelligence' && <TradingIntelligenceView />}

          {/* =====================================================================
              TAB 3: BACKTEST (Historical Data, Strategy Testing, Equity Curve, Drawdown, Out-of-Sample)
             ===================================================================== */}
          {activeTab === 'backtest' && <BacktestSimulatorView />}

          {/* =====================================================================
              TAB 4: TRADING INFRASTRUCTURE (MT5 Status, Exness Demo, Connector, Risk Engine, Pipeline)
             ===================================================================== */}
          {activeTab === 'infrastructure' && <TradingInfrastructureView />}

          {/* =====================================================================
              TAB 5: LEARNING UNIVERSE (Dataset Management, Model Performance, Training History, Daily Update)
             ===================================================================== */}
          {activeTab === 'learning' && <LearningUniverseView />}

          {/* =====================================================================
              TAB: FLEET MARKET (Matches Image 2 — AI Auto Trading Fleet SMC WAVE v6.2)
             ===================================================================== */}
          {activeTab === 'market' && (
            <div className="rounded-[24px] bg-[#0B0C0E] border border-white/[0.08] p-4 sm:p-6 space-y-5 text-slate-100">
              {/* Top Sub-Header from Image 2: SMC WAVE v6.2 + London Session + Dashboard Link */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">การปฏิเสธค่าเฉลี่ย</div>
                    <div className="text-sm font-extrabold text-amber-400 tracking-wide">
                      SMC WAVE เวอร์ชัน 6.2
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#14181D] border border-emerald-500/30 text-xs font-medium text-slate-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>แสดงสด • เซสชันลอนดอน</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setShowPlanModal(true)}
                    className="px-3.5 py-1.5 rounded-full bg-[#171920] hover:bg-[#222530] border border-white/10 text-xs font-medium text-slate-300 transition-colors"
                  >
                    ผู้ดูแลระบบ / แพ็คเกจ
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#F3E8D2] hover:bg-white text-[#14151A] text-xs font-bold transition-colors"
                  >
                    <span>แดชบอร์ด</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Customer Tier & Package Banner */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2">
                <div className="flex items-start sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="w-9 h-9 rounded-full bg-[#15171E] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white shrink-0"
                  >
                    ‹
                  </button>
                  <div>
                    <div className="text-xs font-semibold text-amber-400">
                      แดชบอร์ดลูกค้า • {currentPlan.thaiTitle}
                    </div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
                      ติดตามคุณต้น — กองทัพ AI พร้อมเทรด
                    </h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    เชื่อมต่อ Discord แล้ว
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#15171E] border border-white/10 text-xs font-mono text-slate-300">
                    Telegram: @meanrejection_bot ✓
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPlanModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-bold text-amber-300 transition-colors"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>สลับ/สมัครแพ็คเกจ ({currentPlan.badgeText})</span>
                  </button>
                </div>
              </div>

              {/* =====================================================================
                  NEW WORKFLOW CARD:
                  0. เลือกวิธีเชื่อมต่อโบรกเกอร์ Forex (ใช้ MT5 หรือ ใช้ Direct API)
                  1. ดึงชื่อคู่เงินที่มีใน Broker ที่ผู้ใช้ Login มาแสดง
                  2. ให้ผู้ใช้เลือกคู่เงินที่จะเทรด
                  3. ค่อยเลือกกลยุทธ์ AI ที่จะใช้เทรดกับคู่นั้น
                 ===================================================================== */}
              <div className="rounded-[24px] bg-[#111319] border border-amber-500/30 p-5 space-y-5 shadow-xl">
                {/* Broker Session Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          Broker Session Connected
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-[11px] font-mono text-emerald-300">
                          🟢 Login: {loggedInBroker.toUpperCase()} #{brokerAccountId}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-[11px] font-mono text-amber-300">
                          {isForexBrokerSelected
                            ? forexConnectionMode === 'mt5'
                              ? `🖥️ โหมด: MT5 (${mt5Server})`
                              : '⚡ โหมด: Direct API (ไม่ต้องเปิด MT5)'
                            : '⚡ โหมด: Exchange REST API'}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-extrabold text-white mt-1">
                        ขั้นตอนตั้งค่าเทรด: เลือกโหมด MT5 / API → 1. เลือกคู่เงินจาก Broker → 2. เลือกกลยุทธ์ AI
                      </h2>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        โปรโตคอลปัจจุบัน: {brokerProtocolLabel} • เซิร์ฟเวอร์: {brokerServerName}
                      </div>
                    </div>
                  </div>

                  {/* Switch Logged-In Broker Account & Sync Symbols Button */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 mr-1">บัญชี Broker ที่ Login:</span>
                    {(
                      [
                        { id: 'exness', label: 'Exness Forex (#23908764)' },
                        { id: 'icmarkets', label: 'IC Markets Forex (#51092841)' },
                        { id: 'binance', label: 'Binance Crypto (#BN-88412)' },
                        { id: 'bybit', label: 'Bybit Crypto (#BY-51902)' },
                      ] as const
                    ).map((brk) => (
                      <button
                        key={brk.id}
                        type="button"
                        onClick={() => {
                          setLoggedInBroker(brk.id);
                          if (brk.id === 'icmarkets') setMt5Server('ICMarketsSC-MT5-4');
                          if (brk.id === 'exness') setMt5Server('Exness-MT5Real14');
                          showNotification(
                            `สลับบัญชีที่ Login เป็น ${brk.label} และดึงรายชื่อคู่เงินทั้งหมดเรียบร้อยแล้ว`
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          loggedInBroker === brk.id
                            ? 'bg-amber-400 text-[#111318] shadow-sm'
                            : 'bg-[#191C26] text-slate-300 hover:text-white border border-white/10'
                        }`}
                      >
                        {brk.label}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        syncBrokerInstruments(
                          loggedInBroker,
                          brokerAccountId,
                          forexConnectionMode,
                          mt5Server
                        );
                        showNotification(
                          `🔄 ซิงค์รายชื่อคู่เงินล่าสุดจาก ${loggedInBroker.toUpperCase()} (${
                            forexConnectionMode === 'mt5' ? `MT5: ${mt5Server}` : 'Direct API'
                          }) สำเร็จ (${brokerInstruments.length} คู่เงิน)`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1C202B] hover:bg-[#252A38] border border-white/10 text-xs font-semibold text-cyan-300 transition-colors cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${loadingBrokerPairs ? 'animate-spin' : ''}`}
                      />
                      <span>ดึงคู่เงินใหม่</span>
                    </button>
                  </div>
                </div>

                {/* FOREX CONNECTION MODE SELECTOR: Choose between MT5 or Direct API */}
                {isForexBrokerSelected && (
                  <div className="rounded-2xl bg-[#161923] border border-white/10 p-4 space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-extrabold text-amber-400 uppercase tracking-wide">
                          ตัวเลือกการเชื่อมต่อโบรกเกอร์ Forex ({loggedInBroker.toUpperCase()})
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          เลือกว่าจะดึงคู่เงินและส่งคำสั่งเทรดผ่าน <strong>โปรแกรม MT5 (MetaTrader 5)</strong> หรือผ่าน <strong>Direct API ของโบรกเกอร์โดยตรง</strong>
                        </p>
                      </div>

                      {/* 2 Mode Toggle Buttons: MT5 vs Direct API */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setForexConnectionMode('mt5');
                            fetch('/api/mt5-bridge/toggle', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ enabled: true }),
                            }).catch(() => {});
                            showNotification(
                              `🖥️ เปลี่ยนโหมดโบรกเกอร์ ${loggedInBroker.toUpperCase()} เป็น "ใช้ MT5 (${mt5Server})" สำเร็จ — ดึงคู่เงินจาก MT5 Market Watch`
                            );
                          }}
                          className={`px-4 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            forexConnectionMode === 'mt5'
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-lg'
                              : 'bg-[#10121A] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold">
                              🖥️ ใช้ MT5 (MetaTrader 5)
                            </span>
                            {forexConnectionMode === 'mt5' && (
                              <Check className="w-4 h-4 text-amber-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] opacity-85 mt-0.5">
                            ดึงคู่เงินจาก MT5 Market Watch & ส่งคำสั่งผ่าน EA/Bridge
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setForexConnectionMode('api');
                            fetch('/api/mt5-bridge/toggle', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ enabled: false }),
                            }).catch(() => {});
                            showNotification(
                              `⚡ เปลี่ยนโหมดโบรกเกอร์ ${loggedInBroker.toUpperCase()} เป็น "ใช้ Direct API (REST / Ed25519)" สำเร็จ — ไม่ต้องเปิดโปรแกรม MT5`
                            );
                          }}
                          className={`px-4 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            forexConnectionMode === 'api'
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-lg'
                              : 'bg-[#10121A] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold">
                              ⚡ ใช้ Direct API (REST / Ed25519)
                            </span>
                            {forexConnectionMode === 'api' && (
                              <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] opacity-85 mt-0.5">
                            ยิงออเดอร์ตรงผ่าน API โบรกเกอร์ ไม่ต้องเปิดโปรแกรม MT5
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Configuration Row depending on MT5 vs API */}
                    <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs">
                      {forexConnectionMode === 'mt5' ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-amber-300 font-semibold">
                            ⚙️ ตั้งค่า MT5 Terminal:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">MT5 Login:</span>
                            <input
                              type="text"
                              value={brokerAccountId}
                              onChange={(e) => setBrokerAccountId(e.target.value)}
                              className="w-28 px-2.5 py-1 rounded-lg bg-[#0D0F16] border border-white/15 text-white font-mono text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">MT5 Server:</span>
                            <select
                              value={mt5Server}
                              onChange={(e) => setMt5Server(e.target.value)}
                              className="px-2.5 py-1 rounded-lg bg-[#0D0F16] border border-white/15 text-amber-300 font-mono text-xs"
                            >
                              <option value="Exness-MT5Real14">Exness-MT5Real14 (Real)</option>
                              <option value="Exness-MT5Trial8">Exness-MT5Trial8 (Demo)</option>
                              <option value="ICMarketsSC-MT5-4">ICMarketsSC-MT5-4 (Raw)</option>
                              <option value="XMGlobal-MT5 2">XMGlobal-MT5 2</option>
                            </select>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400">
                            ● MT5 Python Bridge Connected (Latency 18ms)
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-cyan-300 font-semibold">
                            ⚙️ ตั้งค่า Direct API:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Account ID:</span>
                            <input
                              type="text"
                              value={brokerAccountId}
                              onChange={(e) => setBrokerAccountId(e.target.value)}
                              className="w-28 px-2.5 py-1 rounded-lg bg-[#0D0F16] border border-white/15 text-white font-mono text-xs"
                            />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-[#0D0F16] border border-white/10 font-mono text-[11px] text-slate-300">
                            Key: EXN-ED25519-9F8A••••••1B0C
                          </span>
                          <span className="text-[11px] font-mono text-emerald-400">
                            ● Direct Ed25519 REST v1 Verified (No MT5 Required · 21ms)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 1: Select Trading Pair from Logged-In Broker */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-400 text-[#111318] text-xs font-extrabold flex items-center justify-center">
                        1
                      </span>
                      <h3 className="text-sm font-extrabold text-white">
                        เลือกคู่เงินที่มีในโบรกเกอร์ {loggedInBroker.toUpperCase()} (#{brokerAccountId})
                      </h3>
                      <span className="text-xs text-slate-400">
                        (พบ {filteredBrokerInstruments.length} คู่เงินที่พร้อมเทรด)
                      </span>
                    </div>

                    {/* Group Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'ALL', label: 'ทั้งหมด' },
                          { id: 'Metals & Commodities', label: 'ทองคำ & โลหะ' },
                          { id: 'Forex Majors', label: 'Forex คู่หลัก' },
                          { id: 'Crypto Majors', label: 'Crypto คู่หลัก' },
                        ] as const
                      ).map((grp) => (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => setPairGroupFilter(grp.id)}
                          className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                            pairGroupFilter === grp.id
                              ? 'bg-white text-[#111318] font-bold'
                              : 'bg-[#181B24] text-slate-400 hover:text-white border border-white/[0.06]'
                          }`}
                        >
                          {grp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grid of Broker Instruments */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {filteredBrokerInstruments.map((inst) => {
                      const isSelected = selectedBrokerPair.symbol === inst.symbol;
                      const up = inst.change24h >= 0;
                      return (
                        <button
                          key={inst.symbol}
                          type="button"
                          onClick={() => setSelectedBrokerPair(inst)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
                              : 'bg-[#161922] hover:bg-[#1D212D] border-white/[0.07]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-extrabold text-white font-mono">
                              {inst.symbol}
                            </span>
                            {isSelected && (
                              <span className="w-4 h-4 rounded-full bg-amber-400 text-[#111318] flex items-center justify-center">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {inst.displayName}
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-1 font-mono">
                            <span className="text-xs font-bold text-slate-100">
                              {inst.price.toLocaleString('en-US', {
                                minimumFractionDigits: inst.decimals,
                                maximumFractionDigits: inst.decimals,
                              })}
                            </span>
                            <span
                              className={`text-[10px] font-semibold ${
                                up ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {up ? '+' : ''}
                              {inst.change24h.toFixed(2)}%
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500 font-mono">
                            Spread: {inst.spreadLabel}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* STEP 2: Choose AI Strategy for the Selected Broker Pair */}
                <div className="pt-4 border-t border-white/[0.07] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-400 text-[#062219] text-xs font-extrabold flex items-center justify-center">
                        2
                      </span>
                      <h3 className="text-sm font-extrabold text-white">
                        เลือกกลยุทธ์ AI สำหรับคู่เงิน{' '}
                        <span className="text-amber-400 font-mono">
                          {selectedBrokerPair.symbol}
                        </span>{' '}
                        ({selectedBrokerPair.displayName})
                      </h3>
                    </div>

                    {/* Timeframe & Risk quick selectors */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">Timeframe:</span>
                      {(['5 นาที', '15 นาที', '1 ชั่วโมง', '4 ชั่วโมง'] as const).map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setSelectedBuilderTimeframe(tf)}
                          className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-colors ${
                            selectedBuilderTimeframe === tf
                              ? 'bg-emerald-500 text-[#062219] font-bold'
                              : 'bg-[#181B24] text-slate-300 border border-white/10'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4 Strategy Cards to Pick From */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {STRATEGY_BLUEPRINTS.map((strat) => {
                      const active = selectedStrategyId === strat.id;
                      return (
                        <button
                          key={strat.id}
                          type="button"
                          onClick={() => setSelectedStrategyId(strat.id)}
                          className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
                            active
                              ? 'bg-emerald-950/40 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.15)]'
                              : 'bg-[#161922] hover:bg-[#1C202C] border-white/[0.07]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-[10px] font-semibold text-amber-300">
                                {strat.badgeLabel}
                              </span>
                              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                                {strat.rrLabel}
                              </span>
                            </div>

                            <div className="mt-2 text-sm font-extrabold text-white flex items-center justify-between">
                              <span>{strat.shortTitle}</span>
                              {active && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                            </div>

                            <div className="mt-1 text-[11px] font-mono text-slate-300">
                              {strat.featHeadline}
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                              {strat.description}
                            </p>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-300">
                            <span>Win Rate: {strat.winRatePct}%</span>
                            <span>PF: {strat.profitFactor}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Step 2 Summary & Deploy Buttons */}
                  <div className="rounded-2xl bg-[#161922] border border-white/10 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">
                        สรุปการตั้งค่าบอทที่จะนำไปเทรดในกองทัพ AI:
                      </div>
                      <div className="text-sm font-extrabold text-white flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 font-mono">
                          คู่เงิน: {selectedBrokerPair.symbol} ({loggedInBroker.toUpperCase()} #
                          {brokerAccountId})
                        </span>
                        <span>→</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                          กลยุทธ์: {selectedStrategyObj.shortTitle} ({selectedStrategyObj.featHeadline})
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          • กรอบเวลา {selectedBuilderTimeframe} • {selectedStrategyObj.rrLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeployPairWithStrategy(false)}
                        className="px-4 py-2.5 rounded-full bg-[#232736] hover:bg-[#2C3144] border border-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
                      >
                        + เพิ่มคู่เงิน & กลยุทธ์นี้เข้ากองทัพ
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeployPairWithStrategy(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#10B981] hover:bg-[#059669] text-[#052016] text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>เริ่มเทรดคู่นี้ด้วยกลยุทธ์ที่เลือกทันที</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Fleet Control Card (Matches Image 2 "AI Auto Trading Fleet" Header Box) */}
              <div className="rounded-[22px] bg-[#111318] border border-white/[0.08] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-extrabold text-white tracking-tight">
                          AI Auto Trading Fleet
                        </h2>
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-xs font-mono font-semibold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          วิ่ง {runningBotsCount}/{fleetBots.length}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        กองทัพ AI เทรดอัตโนมัติ • {fleetBots.length} บอท • 3 Pillars Engine
                      </p>
                    </div>
                  </div>
                </div>

                {/* KPI Pills Row */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <div className="px-3.5 py-1.5 rounded-full bg-[#171A21] border border-white/[0.07] text-slate-300">
                    กำไรขาดทุนรวมวันนี้:{' '}
                    <span
                      className={`font-mono font-bold ${
                        totalFleetPnlToday >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      ฿{totalFleetPnlToday.toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="px-3.5 py-1.5 rounded-full bg-[#171A21] border border-white/[0.07] text-slate-300">
                    อัตราการชนะเฉลี่ย:{' '}
                    <span className="font-mono font-bold text-white">{avgWinRate}%</span>
                  </div>
                  <div className="px-3.5 py-1.5 rounded-full bg-[#171A21] border border-white/[0.07] text-slate-400">
                    โหมด: การจำลองในหน่วยความจำ • จังหวะการทำงาน 2 วินาที
                  </div>
                </div>

                {/* Master Action Buttons Row: เริ่มทั้งหมด | หยุดฉุกเฉินทั้งหมด | RISK SYNC */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleStartAllFleet}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#10B981] hover:bg-[#059669] text-[#062219] font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>เริ่มทั้งหมด</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEmergencyStopAll}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#EF4444] hover:bg-[#DC2626] text-white font-extrabold text-xs shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                  >
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>หยุดฉุกเฉินทั้งหมด</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRiskSyncAll}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#171A21] hover:bg-[#222631] border border-white/10 text-slate-200 font-mono font-bold text-xs transition-colors cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    <span>RISK SYNC</span>
                  </button>
                </div>

                {/* Filter Tabs Row + LIVE ENGINE Label */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMarketFilter('all')}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        marketFilter === 'all'
                          ? 'bg-[#D4AF37] text-[#111318]'
                          : 'bg-[#171A21] text-slate-300 hover:text-white border border-white/[0.07]'
                      }`}
                    >
                      บอททั้งหมด ({fleetBots.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarketFilter('running')}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        marketFilter === 'running'
                          ? 'bg-[#D4AF37] text-[#111318] font-bold'
                          : 'bg-[#171A21] text-slate-300 hover:text-white border border-white/[0.07]'
                      }`}
                    >
                      การวิ่ง • {runningBotsCount}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarketFilter('crypto')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        marketFilter === 'crypto'
                          ? 'bg-[#D4AF37] text-[#111318] font-bold'
                          : 'bg-[#171A21] text-slate-300 hover:text-white border border-white/[0.07]'
                      }`}
                    >
                      คริปโตหลัก (Crypto)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarketFilter('forex')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        marketFilter === 'forex'
                          ? 'bg-[#D4AF37] text-[#111318] font-bold'
                          : 'bg-[#171A21] text-slate-300 hover:text-white border border-white/[0.07]'
                      }`}
                    >
                      คู่เงินหลัก & ทองคำ (Forex)
                    </button>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500">
                    ⛶ LIVE ENGINE • Pine v6.2 • SMC + Wave
                  </div>
                </div>
              </div>

              {/* Individual Bot Cards List (Matches Image 2 Detailed Bot Cards + Inline Pair & Strategy Switchers) */}
              <div className="space-y-5">
                {filteredFleetBots.map((bot) => {
                  const isLockedByPlan =
                    currentPlanId === 'free' ||
                    (currentPlanId === 'pro' &&
                      bot.requiredPlan === 'elite' &&
                      !bot.selectedInPackage);
                  const pnlUp = bot.todayPnlBaht >= 0;

                  return (
                    <div
                      key={bot.id}
                      className={`rounded-[24px] bg-[#111318] border p-5 space-y-4 transition-all ${
                        bot.running
                          ? 'border-emerald-500/40 shadow-[0_0_35px_rgba(16,185,129,0.08)]'
                          : bot.selectedInPackage
                          ? 'border-amber-500/30'
                          : 'border-white/[0.08]'
                      }`}
                    >
                      {/* Bot Header Row */}
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-base font-bold shrink-0 ${
                              bot.accentColor === 'amber'
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                                : bot.accentColor === 'indigo'
                                ? 'bg-indigo-500/15 border-indigo-500/35 text-indigo-400'
                                : bot.accentColor === 'emerald'
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-400'
                            }`}
                          >
                            {bot.category === 'crypto' ? '◈' : 'FX'}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-extrabold text-white">{bot.name}</h3>
                              <span className="px-2.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[11px] text-slate-300">
                                {bot.strategyBadge}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                                {bot.brokerSource}
                              </span>
                            </div>

                            <div className="text-xs text-slate-400 mt-0.5 font-mono">
                              {bot.pair} • {bot.timeframe} • ความเสี่ยง {bot.riskPct.toFixed(1)}%{' '}
                              {bot.rrLabel}
                            </div>

                            {/* Inline Pair Selector (from Broker) -> Strategy Selector on each Bot Card */}
                            <div className="flex flex-wrap items-center gap-2 mt-2.5 bg-[#161922] p-2 rounded-xl border border-white/[0.06]">
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-amber-400 font-bold">1. คู่เงิน Broker:</span>
                                <select
                                  aria-label="เลือกคู่เงินจาก Broker"
                                  value={bot.pair}
                                  onChange={(e) =>
                                    handleUpdateBotPairOrStrategy(
                                      bot.id,
                                      e.target.value,
                                      bot.strategyId
                                    )
                                  }
                                  className="bg-[#0E1016] text-white font-mono text-xs px-2.5 py-1 rounded-lg border border-white/10 focus:outline-none focus:border-amber-400"
                                >
                                  {brokerInstruments.map((inst) => (
                                    <option key={inst.symbol} value={inst.symbol}>
                                      {inst.symbol} ({inst.displayName})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <span className="text-slate-500 text-xs">→</span>

                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-emerald-400 font-bold">2. กลยุทธ์:</span>
                                <select
                                  aria-label="เลือกกลยุทธ์ AI"
                                  value={bot.strategyId}
                                  onChange={(e) =>
                                    handleUpdateBotPairOrStrategy(
                                      bot.id,
                                      bot.pair,
                                      e.target.value
                                    )
                                  }
                                  className="bg-[#0E1016] text-white text-xs px-2.5 py-1 rounded-lg border border-white/10 focus:outline-none focus:border-emerald-400"
                                >
                                  {STRATEGY_BLUEPRINTS.map((st) => (
                                    <option key={st.id} value={st.id}>
                                      {st.shortTitle} ({st.badgeLabel} · {st.rrLabel})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Inline MT5 vs Direct API Switcher for Forex Bots */}
                              {bot.category === 'forex' && (
                                <>
                                  <span className="text-slate-500 text-xs">•</span>
                                  <div className="flex items-center gap-1 text-[11px]">
                                    <span className="text-cyan-400 font-bold">โหมด Forex:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextMode =
                                          bot.connectionMode === 'mt5' ? 'api' : 'mt5';
                                        setFleetBots((prev) =>
                                          prev.map((b) =>
                                            b.id === bot.id
                                              ? {
                                                  ...b,
                                                  connectionMode: nextMode,
                                                  brokerSource:
                                                    nextMode === 'mt5'
                                                      ? `Exness #${brokerAccountId} · MT5 (${mt5Server})`
                                                      : `Exness #${brokerAccountId} · Direct API`,
                                                }
                                              : b
                                          )
                                        );
                                        showNotification(
                                          `สลับบอท "${bot.name}" ไปใช้โหมด ${
                                            nextMode === 'mt5'
                                              ? `🖥️ MT5 (${mt5Server})`
                                              : '⚡ Direct API (Ed25519)'
                                          } เรียบร้อยแล้ว`
                                        );
                                      }}
                                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
                                        bot.connectionMode === 'mt5'
                                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                                          : 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                                      }`}
                                    >
                                      {bot.connectionMode === 'mt5'
                                        ? '🖥️ ใช้ MT5 (คลิกเพื่อสลับเป็น API)'
                                        : '⚡ ใช้ Direct API (คลิกเพื่อสลับเป็น MT5)'}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Status Pill + RR Pill + Package Selection Toggle Button */}
                            <div className="flex flex-wrap items-center gap-2 mt-2.5">
                              {bot.running ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-xs font-bold text-emerald-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  วิ่ง
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-500/30 text-xs font-bold text-rose-300">
                                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                                  หยุด
                                </span>
                              )}

                              <span className="px-3 py-1 rounded-full bg-[#181B22] border border-white/[0.07] text-xs font-mono text-slate-400">
                                {bot.rrLabel}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleSelectBotInPackage(bot.id)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                  isLockedByPlan
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30'
                                    : bot.selectedInPackage
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-[#1D202A] text-slate-300 border border-white/10 hover:text-white'
                                }`}
                              >
                                {isLockedByPlan ? (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span>สมัครแพ็คเกจเพื่อเลือกบอทนี้</span>
                                  </>
                                ) : bot.selectedInPackage ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>เลือกใช้งานในแพ็คเกจแล้ว</span>
                                  </>
                                ) : (
                                  <span>+ กดเลือกเข้าแพ็คเกจ</span>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Right: Today's PnL in Baht + Mini Bar */}
                        <div className="text-right">
                          <div
                            className={`text-lg font-extrabold font-mono ${
                              pnlUp ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pnlUp ? `+ ฿${bot.todayPnlBaht}` : `฿${bot.todayPnlBaht}`}
                          </div>
                          <div className="text-[11px] text-slate-400">วันนี้</div>
                          <div
                            className={`mt-2 w-24 h-5 rounded-md border-t-2 ${
                              pnlUp
                                ? 'bg-amber-500/10 border-amber-500/70'
                                : 'bg-indigo-500/10 border-indigo-400/70'
                            }`}
                          />
                        </div>
                      </div>

                      {/* 6-Box KPI Grid (2 rows x 3 columns matching Image 2) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div className="rounded-2xl bg-[#16181F] border border-white/[0.06] p-3.5">
                          <div className="text-[11px] text-slate-400">อัตราการชนะ</div>
                          <div className="mt-1 text-base font-extrabold text-white font-mono">
                            {bot.winRatePct.toFixed(1)}%
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#16181F] border border-white/[0.06] p-3.5">
                          <div className="text-[11px] text-slate-400">พีเอฟ</div>
                          <div className="mt-1 text-base font-extrabold text-white font-mono">
                            {bot.profitFactor.toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#16181F] border border-white/[0.06] p-3.5">
                          <div className="text-[11px] text-slate-400">การค้า</div>
                          <div className="mt-1 text-base font-extrabold text-white font-mono">
                            {bot.totalTrades}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#16181F] border border-white/[0.06] p-3.5">
                          <div className="text-[11px] text-slate-400">TP1 ฮิต</div>
                          <div className="mt-1 text-base font-extrabold text-white font-mono">
                            {bot.tp1HitPct}%
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#16181F] border border-white/[0.06] p-3.5">
                          <div className="text-[11px] text-slate-400">TP2 ฮิต</div>
                          <div className="mt-1 text-base font-extrabold text-white font-mono">
                            {bot.tp2HitPct}%
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#16181F] border border-white/[0.06] p-3.5">
                          <div className="text-[11px] text-slate-400">เสี่ยง</div>
                          <div className="mt-1 text-base font-extrabold text-white font-mono">
                            {bot.riskPct.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* Current Position Section (ตำแหน่งปัจจุบัน) */}
                      <div className="rounded-2xl bg-[#14161D] border border-white/[0.06] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400">
                            ตำแหน่งปัจจุบัน ({bot.pair})
                          </span>
                          <span
                            className={`px-3 py-0.5 rounded-full text-xs font-bold ${
                              bot.positionIsLong
                                ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-400'
                                : 'bg-[#1E212B] border border-white/10 text-slate-300'
                            }`}
                          >
                            {bot.positionStateLabel}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div className="rounded-xl bg-[#191C24] border border-white/[0.05] p-3">
                            <div className="text-[11px] text-slate-400">รายการ</div>
                            <div className="mt-1 text-sm font-bold text-white font-mono">
                              {bot.entryPrice}
                            </div>
                          </div>
                          <div className="rounded-xl bg-[#191C24] border border-white/[0.05] p-3">
                            <div className="text-[11px] text-slate-400">ส.ล.</div>
                            <div className="mt-1 text-sm font-bold text-white font-mono">
                              {bot.stopLossPrice}
                            </div>
                          </div>
                          <div className="rounded-xl bg-[#191C24] border border-white/[0.05] p-3">
                            <div className="text-[11px] text-slate-400">ทีพี1</div>
                            <div className="mt-1 text-sm font-bold text-white font-mono">
                              {bot.tp1Price}
                            </div>
                          </div>
                          <div className="rounded-xl bg-[#191C24] border border-white/[0.05] p-3">
                            <div className="text-[11px] text-slate-400">ทีพี2</div>
                            <div className="mt-1 text-sm font-bold text-white font-mono">
                              {bot.tp2Price}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs text-slate-400">การบรรจบกัน</span>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5, 6].map((seg) => (
                                <span
                                  key={seg}
                                  className={`w-5 h-1.5 rounded-full ${
                                    seg <= bot.confluenceScore
                                      ? 'bg-amber-400'
                                      : 'bg-slate-700'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-xs font-mono font-bold text-amber-400">
                              {bot.confluenceScore}/6
                            </span>
                          </div>

                          <span className="px-3 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/35 text-[11px] font-bold text-emerald-400">
                            {bot.setupGrade}
                          </span>
                        </div>
                      </div>

                      {/* FEAT ENGINE Box (>_ FEAT ENGINE • dist / pa / ob / fvg / sweep) */}
                      <div className="rounded-2xl bg-[#14161D] border border-white/[0.06] p-4 space-y-3">
                        <div className="text-[11px] font-mono text-slate-400">
                          &gt;_ FEAT ENGINE • dist / pa / ob / fvg / sweep
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          {bot.featHeadline}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {bot.featTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2.5 py-1 rounded-lg bg-[#1C1F28] border border-white/[0.06] text-[11px] text-slate-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="rounded-xl bg-[#0D0F14] border border-white/[0.06] p-3 space-y-1 font-mono text-xs">
                          {bot.liveScanningBanner ? (
                            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span>{bot.liveScanningBanner}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-amber-300">
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              <span>{bot.logs[0]}</span>
                            </div>
                          )}
                          {bot.logs.slice(bot.liveScanningBanner ? 0 : 1).map((line, idx) => (
                            <div key={idx} className="text-slate-400 text-[11px]">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Controls Section: เริ่ม (Start) | หยุด (Stop) + Auto-Trading Toggle + Risk Slider */}
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleBotRun(bot.id, true)}
                            className="py-3 rounded-full bg-[#10B981] hover:bg-[#059669] text-[#052016] font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 transition-all cursor-pointer"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>เริ่ม</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleBotRun(bot.id, false)}
                            className="py-3 rounded-full bg-[#171A22] hover:bg-[#222632] border border-white/10 text-slate-300 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>หยุด</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="text-slate-400">การซื้อขายอัตโนมัติ</span>
                            <button
                              type="button"
                              onClick={() =>
                                setFleetBots((prev) =>
                                  prev.map((b) =>
                                    b.id === bot.id
                                      ? { ...b, autoTradeEnabled: !b.autoTradeEnabled }
                                      : b
                                  )
                                )
                              }
                              className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                                bot.autoTradeEnabled
                                  ? 'bg-emerald-500 justify-end'
                                  : 'bg-slate-700 justify-start'
                              }`}
                            >
                              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                            </button>
                            <span className="text-slate-300 font-semibold">
                              {bot.autoTradeEnabled ? 'บน' : 'ปิด'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleBotRun(bot.id, false)}
                            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>หยุดชั่วคราว</span>
                          </button>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">ความเสี่ยง / การซื้อขาย</span>
                            <span className="font-mono font-bold text-amber-400">
                              {bot.riskPct.toFixed(1)} %
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="1.5"
                            step="0.1"
                            value={bot.riskPct}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setFleetBots((prev) =>
                                prev.map((b) => (b.id === bot.id ? { ...b, riskPct: val } : b))
                              );
                            }}
                            className="w-full accent-amber-400 cursor-pointer h-1.5 bg-[#232733] rounded-lg"
                          />
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>0.5%</span>
                            <span className="font-sans">ซึ่งอนุรักษนิยม</span>
                            <span>1.5%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 3: TRADING (AI Command Layer Zero-Menu Chat + Live Desk)
             ===================================================================== */}
          {activeTab === 'trading' && (
            <div className="space-y-6">
              <NovaChatOSView />
              <LiveTradingTerminalView />
            </div>
          )}

          {/* =====================================================================
              TAB 4: PORTFOLIO (VOOM Portfolio & Dynamic Grid Calendar)
             ===================================================================== */}
          {activeTab === 'portfolio' && (
            <div>
              <NovaProWorkspaceView />
            </div>
          )}

          {/* =====================================================================
              TAB 5: SETTINGS (Unified Settings Hub — 16 Pairs + Backend Auto-Train)
             ===================================================================== */}
          {activeTab === 'settings' && (
            <div>
              <SystemSettingsView />
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          PACKAGE SUBSCRIPTION MODAL ("ให้ผู้ใช้กดเลือกได้เมื่อสมัครแพ็คเกต")
         ===================================================================== */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-4xl w-full rounded-[28px] bg-[#161726] border border-white/15 p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-xs font-bold text-purple-300">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  Subscription Packages • เลือกแพ็คเกจเพื่อปลดล็อกกองทัพ AI
                </span>
                <h2 className="mt-2 text-2xl font-extrabold text-white">
                  เลือกแพ็คเกจสำหรับใช้งาน AI Auto Trading Fleet ในตลาด
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  เมื่อสมัครแพ็คเกจแล้ว คุณสามารถเลือกคู่เงินจาก Broker ที่ Login แล้วเลือกกลยุทธ์ AI เพื่อสั่งเทรดอัตโนมัติได้ทันที
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const isCurrent = currentPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`rounded-[22px] p-5 border flex flex-col justify-between transition-all ${
                      isCurrent
                        ? 'bg-[#212338] border-amber-400/60 shadow-xl'
                        : 'bg-[#1B1C2E] border-white/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-white uppercase">
                          {plan.badgeText}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-bold text-emerald-400">
                            ✓ แพ็คเกจปัจจุบัน
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 text-lg font-extrabold text-white">{plan.name}</h3>
                      <div className="text-xs text-amber-300 font-semibold mt-0.5">
                        {plan.thaiTitle}
                      </div>
                      <div className="mt-3 text-2xl font-extrabold text-white font-mono">
                        {plan.priceMonthly}
                      </div>
                      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                        {plan.description}
                      </p>

                      <ul className="mt-4 space-y-2 border-t border-white/10 pt-3">
                        {plan.features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2 text-xs text-slate-200">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPlanId(plan.id);
                        setShowPlanModal(false);
                        setActiveTab('market');
                        showNotification(
                          `🎉 สมัครและเปิดใช้งาน "${plan.name}" สำเร็จ! เลือกคู่เงินจาก Broker และกลยุทธ์ในหน้า Market ได้เลย`
                        );
                      }}
                      className={`mt-6 w-full py-2.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-emerald-500 text-[#072118]'
                          : 'bg-white text-[#141522] hover:bg-slate-200'
                      }`}
                    >
                      {isCurrent ? 'ใช้งานแพ็คเกจนี้ต่อในหน้า Market →' : `สมัคร ${plan.name} →`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
