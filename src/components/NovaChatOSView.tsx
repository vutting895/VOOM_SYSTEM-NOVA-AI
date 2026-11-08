import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Edit3,
  FileText,
  HelpCircle,
  Inbox,
  KeyRound,
  Layers,
  Pause,
  Play,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  User,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

export type ChatWidgetType =
  | 'welcome-overview'
  | 'balance-summary-card'
  | 'market-analysis-card'
  | 'langgraph-interrupt-approval-card'
  | 'risk-guard-rejected-card'
  | 'nemo-guardrail-blocked-card'
  | 'clarification-fallback-card'
  | 'component-catalog-card'
  | 'architecture-checklist-card'
  | 'auto-bot-execution'
  | 'approval-and-risk'
  | 'dynamic-grid-calendar'
  | 'voom-portfolio-card'
  | 'exness-login-card';

export interface StructuredIntentTrace {
  schemaVersion: string;
  intentType: string;
  accessClass: 'READ_ONLY_NO_INTERRUPT' | 'WRITE_HIGH_IMPACT_INTERRUPT';
  mcpTool: string;
  requiresInterrupt: boolean;
  params: {
    symbol: string;
    side?: 'BUY' | 'SELL';
    lots?: number;
    riskPerTradePct?: number;
    price?: number;
  };
}

export interface LangGraphInterruptItem {
  interruptId: string;
  threadId: string;
  symbol: string;
  side?: 'BUY' | 'SELL';
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'PAUSED_WAITING_HUMAN';
}

export interface ChatOSMessage {
  id: string;
  role: 'assistant' | 'user';
  senderName?: string;
  senderRole?: string;
  timestamp: string;
  text: string;
  widget?: ChatWidgetType;
  structuredIntent?: StructuredIntentTrace;
  semanticCache?: { hit: boolean; latencyMs: number };
  interruptData?: LangGraphInterruptItem;
  riskRejectionData?: {
    violations: string[];
    metrics: { marginUsagePct: number; estRiskPct: number; currentDrawdownPct: number };
  };
  guardrailData?: {
    violationRule?: string;
    reason?: string;
  };
  clarificationData?: {
    validationIssue?: string;
    politeQuestion?: string;
    suggestedPrompts?: Array<{ label: string; cmd: string }>;
  };
  quantTelemetry?: {
    symbol: string;
    price: number;
    regime: string;
    confidencePct: number;
    vpinScore: number;
    var95Pct: number;
    sl: number;
    tp: number;
  };
  autoExecData?: {
    ticket: string;
    symbol: string;
    action: string;
    lots: number;
    price: string;
    profitUsd: number;
    totalTodayUsd: number;
    closesToday: number;
  };
}

interface AIAgentNode {
  id: string;
  name: string;
  role: string;
  thaiRole: string;
  accent: string;
  glow: string;
  border: string;
  bgGradient: string;
  avatarType: 'chatgpt' | 'gemini' | 'copilot' | 'perplexity' | 'claude' | 'grok' | 'deepseek' | 'meta';
}

const AI_COMMAND_AGENTS: AIAgentNode[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    role: 'Reasoning',
    thaiRole: 'สกัดพารามิเตอร์ Zod & ตรรกะ',
    accent: 'text-emerald-400',
    glow: 'shadow-[0_0_25px_rgba(16,185,129,0.45)]',
    border: 'border-emerald-400/70',
    bgGradient: 'from-emerald-500/30 via-emerald-900/40 to-[#06101E]',
    avatarType: 'chatgpt',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    role: 'Multimodal',
    thaiRole: 'สแกนกราฟ & Generative UI',
    accent: 'text-cyan-300',
    glow: 'shadow-[0_0_25px_rgba(56,189,248,0.5)]',
    border: 'border-cyan-400/80',
    bgGradient: 'from-cyan-500/35 via-blue-900/40 to-[#06101E]',
    avatarType: 'gemini',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    role: 'Productivity',
    thaiRole: 'LangGraph Orchestrator',
    accent: 'text-indigo-300',
    glow: 'shadow-[0_0_25px_rgba(99,102,241,0.45)]',
    border: 'border-indigo-400/70',
    bgGradient: 'from-indigo-500/30 via-indigo-950/40 to-[#06101E]',
    avatarType: 'copilot',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    role: 'Search',
    thaiRole: 'FastMCP News & Macro',
    accent: 'text-sky-300',
    glow: 'shadow-[0_0_25px_rgba(14,165,233,0.45)]',
    border: 'border-sky-400/70',
    bgGradient: 'from-sky-500/30 via-sky-950/40 to-[#06101E]',
    avatarType: 'perplexity',
  },
  {
    id: 'claude',
    name: 'Claude',
    role: 'Analysis',
    thaiRole: 'Rule-Based Risk Engine',
    accent: 'text-amber-300',
    glow: 'shadow-[0_0_25px_rgba(245,158,11,0.45)]',
    border: 'border-amber-400/70',
    bgGradient: 'from-amber-500/30 via-amber-950/40 to-[#06101E]',
    avatarType: 'claude',
  },
  {
    id: 'grok',
    name: 'Grok',
    role: 'Real-time',
    thaiRole: 'Orderflow & VPIN Guard',
    accent: 'text-cyan-400',
    glow: 'shadow-[0_0_25px_rgba(34,211,238,0.45)]',
    border: 'border-cyan-400/70',
    bgGradient: 'from-cyan-500/25 via-slate-900/50 to-[#06101E]',
    avatarType: 'grok',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    role: 'Research',
    thaiRole: 'Quantum VQC & FinRL',
    accent: 'text-blue-300',
    glow: 'shadow-[0_0_25px_rgba(59,130,246,0.45)]',
    border: 'border-blue-400/70',
    bgGradient: 'from-blue-500/30 via-blue-950/40 to-[#06101E]',
    avatarType: 'deepseek',
  },
  {
    id: 'meta',
    name: 'Meta AI',
    role: 'Assistant',
    thaiRole: 'NeMo Guardrails Shield',
    accent: 'text-violet-300',
    glow: 'shadow-[0_0_25px_rgba(167,139,250,0.45)]',
    border: 'border-violet-400/70',
    bgGradient: 'from-violet-500/30 via-indigo-950/40 to-[#06101E]',
    avatarType: 'meta',
  },
];



const FOREX_MAJOR_PAIRS = [
  { symbol: 'XAU/USDm', label: 'XAU/USDm (ทองคำ)', basePrice: 2749.4, dec: 2 },
  { symbol: 'EUR/USDm', label: 'EUR/USDm', basePrice: 1.0864, dec: 4 },
  { symbol: 'GBP/USDm', label: 'GBP/USDm', basePrice: 1.2982, dec: 4 },
  { symbol: 'USD/JPYm', label: 'USD/JPYm', basePrice: 152.45, dec: 2 },
  { symbol: 'USD/CHFm', label: 'USD/CHFm', basePrice: 0.8648, dec: 4 },
  { symbol: 'AUD/USDm', label: 'AUD/USDm', basePrice: 0.6594, dec: 4 },
  { symbol: 'USD/CADm', label: 'USD/CADm', basePrice: 1.3892, dec: 4 },
  { symbol: 'NZD/USDm', label: 'NZD/USDm', basePrice: 0.5986, dec: 4 },
];

const CRYPTO_MAJOR_PAIRS = [
  { symbol: 'BTC/USDT', label: 'BTC/USDT (Bitcoin)', basePrice: 62931.55, dec: 2 },
  { symbol: 'ETH/USDT', label: 'ETH/USDT (Ethereum)', basePrice: 3098.51, dec: 2 },
  { symbol: 'SOL/USDT', label: 'SOL/USDT (Solana)', basePrice: 173.29, dec: 2 },
  { symbol: 'BNB/USDT', label: 'BNB/USDT (BNB)', basePrice: 594.8, dec: 2 },
  { symbol: 'XRP/USDT', label: 'XRP/USDT (XRP)', basePrice: 0.5482, dec: 4 },
  { symbol: 'ADA/USDT', label: 'ADA/USDT (Cardano)', basePrice: 0.3685, dec: 4 },
  { symbol: 'DOGE/USDT', label: 'DOGE/USDT (Dogecoin)', basePrice: 0.1642, dec: 4 },
  { symbol: 'TON/USDT', label: 'TON/USDT (Toncoin)', basePrice: 6.43, dec: 2 },
];

const ALL_SELECTABLE_PAIRS = [...FOREX_MAJOR_PAIRS, ...CRYPTO_MAJOR_PAIRS];

interface ActionableChecklistItem {
  id: string;
  phase: 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4' | 'Pitfall Mitigation';
  title: string;
  desc: string;
  testCmd: string;
  done: boolean;
}

const FULL_ACTIONABLE_CHECKLIST: ActionableChecklistItem[] = [
  // Phase 1: Infrastructure Setup
  {
    id: 'p1-1',
    phase: 'Phase 1',
    title: 'ตารางฐานข้อมูล threads, checkpoints, trade_logs, และ user_configs',
    desc: 'ออกแบบโครงสร้างเก็บสถานะการคุย, Pending Interrupts, ประวัติออเดอร์ และการตั้งค่าความเสี่ยง',
    testCmd: 'ขอดูยอดเงินคงเหลือหน่อย',
    done: true,
  },
  {
    id: 'p1-2',
    phase: 'Phase 1',
    title: 'Exness Demo Read-only Bridge และการตรวจสอบ tenant',
    desc: 'เตรียมเส้นทางอ่านข้อมูล Demo แบบ tenant-scoped เท่านั้น โดยไม่เปิดคำสั่งหรือแก้ไข SL/TP ที่ Broker',
    testCmd: 'วิเคราะห์ XAU/USDm แบบ Read-only พร้อม Scenario และระดับความเสี่ยง',
    done: true,
  },
  {
    id: 'p1-3',
    phase: 'Phase 1',
    title: 'FastMCP Server บนโปรโตคอล Streamable HTTP (/api/mcp/streamable)',
    desc: 'รองรับ Horizontal Scaling และการเชื่อมต่อพร้อมกันจากหลายไคลเอนต์แทน STDIO/SSE เดิม',
    testCmd: 'วิเคราะห์ตลาด XAU/USDm',
    done: true,
  },
  // Phase 2: Backend & Agent Layer
  {
    id: 'p2-1',
    phase: 'Phase 2',
    title: 'แยก MCP research tools และ broker-write boundary',
    desc: 'อนุญาตเฉพาะ market research และ risk analysis; broker write/execute ยังคงปิดใช้งาน',
    testCmd: 'ขอดูยอดเงินคงเหลือหน่อย',
    done: true,
  },
  {
    id: 'p2-2',
    phase: 'Phase 2',
    title: 'Agent State Graph ด้วย LangGraph + Checkpointer ผูก thread_id',
    desc: 'บันทึก Checkpoint ลงตารางตาม thread_id เพื่อให้กู้คืนสถานะได้ทันทีเมื่อรีเฟรชหน้าเว็บ',
    testCmd: 'วิเคราะห์ XAU/USDm แบบ Read-only พร้อม Scenario และระดับความเสี่ยง',
    done: true,
  },
  {
    id: 'p2-3',
    phase: 'Phase 2',
    title: 'กำหนด policy สำหรับ approval intent โดยไม่ให้ client ส่งคำสั่งซื้อขาย',
    desc: 'การ์ดเดิมถูกแสดงเป็น Research Draft เท่านั้น ไม่มี token revalidation หรือ broker approval ใน UI',
    testCmd: 'วิเคราะห์ XAU/USDm แบบ Read-only พร้อม Scenario และระดับความเสี่ยง',
    done: true,
  },
  {
    id: 'p2-4',
    phase: 'Phase 2',
    title: 'ติดตั้ง NVIDIA NeMo Guardrails (Colang) + Rule-Based Risk Engine',
    desc: 'บล็อก Prompt Injection และปฏิเสธคำสั่งที่เกินเพดาน Max Lot (≤ 2.0) หรือไม่มี Stop Loss',
    testCmd: 'อธิบายความเสี่ยงของการไม่กำหนด Stop Loss โดยไม่ส่งคำสั่งซื้อขาย',
    done: true,
  },
  // Phase 3: Generative UI Frontend
  {
    id: 'p3-1',
    phase: 'Phase 3',
    title: 'หน้าบ้าน React + Declarative A2UI / CopilotKit Engine (Least Privilege UI)',
    desc: 'รับเฉพาะ JSON Data จากเซิร์ฟเวอร์มาเปิดวิดเจ็ต ป้องกันช่องโหว่ UI Injection 100%',
    testCmd: 'เปิดคลังคอมโพเนนต์ Research Catalog',
    done: true,
  },
  {
    id: 'p3-2',
    phase: 'Phase 3',
    title: 'คลังคอมโพเนนต์: ResearchDraftCard, RiskChart และ Read-only Status',
    desc: 'แสดงข้อมูลวิจัยและสถานะที่ยืนยันได้ โดยไม่เปิดปุ่มอนุมัติหรือส่งคำสั่งซื้อขาย',
    testCmd: 'เปิดคลังคอมโพเนนต์ Component Catalog',
    done: true,
  },
  {
    id: 'p3-3',
    phase: 'Phase 3',
    title: 'ปิด Command resume ใน customer-facing UI',
    desc: 'เก็บ checkpoint เดิมเป็นประวัติเท่านั้น ไม่สามารถปลดล็อก worker หรือสั่ง broker จาก UI ได้',
    testCmd: 'วิเคราะห์ XAU/USDm แบบ Read-only พร้อม Scenario และระดับความเสี่ยง',
    done: true,
  },
  // Phase 4 & Pitfall Mitigations
  {
    id: 'p4-1',
    phase: 'Pitfall Mitigation',
    title: 'แก้ปัญหา Latency Tax ด้วย Semantic Caching (< 2ms Cache Hit)',
    desc: 'แคชผลลัพธ์และโครงสร้าง UI ที่เรียกบ่อย ลดความหน่วงของ LLM + NeMo Guardrails',
    testCmd: 'ขอดูยอดเงินคงเหลือหน่อย',
    done: true,
  },
  {
    id: 'p4-2',
    phase: 'Pitfall Mitigation',
    title: 'แก้ปัญหา AI ตีความผิดพลาดด้วย Polite Clarification Fallback Middleware',
    desc: 'ดักจับ FastMCP Validation Error (เช่น Lot ติดลบ หรือคำสั่งคลุมเครือ) แล้วถามกลับอย่างสุภาพแทนหน้าแดง',
    testCmd: 'ตรวจสอบ input ที่ไม่ถูกต้องในโหมดวิเคราะห์เท่านั้น โดยไม่ส่งคำสั่งซื้อขาย',
    done: true,
  },
  {
    id: 'p4-3',
    phase: 'Phase 4',
    title: 'ตรวจสอบ risk boundary ในโหมด Read-only',
    desc: 'ยืนยันว่าคำขอที่เกี่ยวข้องกับการซื้อขายไม่สามารถสร้าง approval หรือส่งไปยัง broker ได้',
    testCmd: 'วิเคราะห์ความเสี่ยง XAU/USDm แบบ Read-only โดยไม่ส่งคำสั่งซื้อขาย',
    done: true,
  },
];

function AgentCyberAvatar({ type }: { type: AIAgentNode['avatarType'] }) {
  switch (type) {
    case 'chatgpt':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-emerald-400/30 to-emerald-950/90 border border-emerald-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.5)]">
          <div className="w-8 h-7 rounded-xl bg-emerald-950 border border-emerald-400 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_8px_#6ee7b7]" />
            <span className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_8px_#6ee7b7]" />
          </div>
        </div>
      );
    case 'gemini':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-cyan-400/30 to-blue-950/90 border border-cyan-300/70 flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.65)]">
          <svg className="w-7 h-7 text-cyan-200 drop-shadow-[0_0_10px_rgba(56,189,248,0.9)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C12 7.52 16.48 12 22 12C16.48 12 12 16.48 12 22C12 16.48 7.52 12 2 12C7.52 12 12 7.52 12 2Z" />
          </svg>
        </div>
      );
    case 'copilot':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-indigo-400/30 to-indigo-950/90 border border-indigo-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.5)]">
          <div className="w-8 h-7 rounded-xl bg-indigo-950 border border-indigo-300 flex items-center justify-center">
            <div className="w-5 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
          </div>
        </div>
      );
    case 'perplexity':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-sky-400/30 to-sky-950/90 border border-sky-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(14,165,233,0.5)]">
          <svg className="w-7 h-7 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <polygon points="12 2 19 8 19 16 12 22 5 16 5 8 12 2" />
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="5" y1="8" x2="19" y2="16" />
            <line x1="19" y1="8" x2="5" y2="16" />
          </svg>
        </div>
      );
    case 'claude':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-amber-400/30 to-amber-950/90 border border-amber-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
          <div className="w-8 h-7 rounded-xl bg-amber-950 border border-amber-300 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-200 shadow-[0_0_8px_#fde68a]" />
            <span className="w-2 h-2 rounded-full bg-amber-200 shadow-[0_0_8px_#fde68a]" />
          </div>
        </div>
      );
    case 'grok':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-cyan-400/25 to-slate-950/90 border border-cyan-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.45)]">
          <div className="w-8 h-7 rounded-xl bg-slate-950 border border-cyan-400 flex items-center justify-center text-cyan-300 font-mono font-extrabold text-xs">
            X·X
          </div>
        </div>
      );
    case 'deepseek':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-blue-400/30 to-blue-950/90 border border-blue-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
          <svg className="w-7 h-7 text-blue-300 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C7.5 3 4 6.5 4 11C4 14.5 6.3 17.4 9.5 18.5L8 21L11.5 19.5C11.7 19.5 11.8 19.5 12 19.5C16.5 19.5 20 16 20 11.5C20 7 16.5 3 12 3ZM9.5 10.5C8.9 10.5 8.5 10.1 8.5 9.5C8.5 8.9 8.9 8.5 9.5 8.5C10.1 8.5 10.5 8.9 10.5 9.5C10.5 10.1 10.1 10.5 9.5 10.5ZM14.5 10.5C13.9 10.5 13.5 10.1 13.5 9.5C13.5 8.9 13.9 8.5 14.5 8.5C15.1 8.5 15.5 8.9 15.5 9.5C15.5 10.1 15.1 10.5 14.5 10.5Z" />
          </svg>
        </div>
      );
    case 'meta':
      return (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-violet-400/30 to-indigo-950/90 border border-violet-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(167,139,250,0.5)]">
          <div className="w-7 h-7 rounded-full border-[3px] border-cyan-300 shadow-[0_0_12px_#67e8f9,inset_0_0_8px_#a78bfa]" />
        </div>
      );
  }
}

export default function NovaChatOSView({
  onSwitchTab,
}: {
  onSwitchTab?: (tab: 'nova-chat-os' | 'voom-portfolio' | 'dynamic-grid-calendar' | 'ai-workflow-command') => void;
}) {
  const [activeAgentId, setActiveAgentId] = useState<string>('gemini');
  const [pairGroup, setPairGroup] = useState<'FOREX' | 'CRYPTO'>('FOREX');
  const [selectedPair, setSelectedPair] = useState<string>('XAU/USDm');
  const [autoTrainNotice, setAutoTrainNotice] = useState<string>(
    'Backend Auto-Train: ยังไม่มีหลักฐานยืนยันสถานะ ingestion หรือ training ล่าสุด'
  );
  const [autoTrainSyncing, setAutoTrainSyncing] = useState<boolean>(false);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // Recommendation #4: Bind LangGraph thread_id to User Session so Pending Interrupts survive page refreshes
  const [threadId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('nova_langgraph_thread_id');
      if (saved) return saved;
      const fresh = `thread-nova-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('nova_langgraph_thread_id', fresh);
      return fresh;
    } catch {
      return 'thread-nova-session-01';
    }
  });

  // CLEAN ON-DEMAND STATE: Nothing is shown until the user invokes a chat or workflow panel
  const [messages, setMessages] = useState<ChatOSMessage[]>([]);
  const [activeWorkflowPanel, setActiveWorkflowPanel] = useState<'none' | 'inbox' | 'calendar' | 'docs' | 'crm'>('none');
  const [checklistState, setChecklistState] = useState<ActionableChecklistItem[]>(FULL_ACTIONABLE_CHECKLIST);
  const [checklistFilter, setChecklistFilter] = useState<string>('ALL');
  const [roadmapGoals, setRoadmapGoals] = useState([
    { id: 'g1', label: 'Execution Guard: Broker-side writes remain disabled in Read-only mode', done: true },
    { id: 'g2', label: 'Credential Boundary: No broker token or customer credential is collected by this UI', done: true },
    { id: 'g3', label: 'Research UX: Clarify incomplete market inputs without enabling broker actions', done: true },
  ]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const msgSeqRef = useRef<number>(1);

  const activeAgent = AI_COMMAND_AGENTS.find((a) => a.id === activeAgentId) || AI_COMMAND_AGENTS[1];

  function nextMsgId(prefix: string): string {
    msgSeqRef.current += 1;
    return `${prefix}-${Date.now()}-${msgSeqRef.current}`;
  }

  // Restore legacy checkpoints for display only; never resume or approve a broker action.
  useEffect(() => {
    fetch(`/api/intent/thread/${encodeURIComponent(threadId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.pendingInterrupts)) {
          const waiting = data.pendingInterrupts.filter(
            (item: LangGraphInterruptItem) => item.status === 'PAUSED_WAITING_HUMAN'
          );
          if (waiting.length > 0) {
            const restoredMsgs: ChatOSMessage[] = waiting.map((item: LangGraphInterruptItem) => ({
              id: nextMsgId('restored-int'),
              role: 'assistant',
              senderName: 'NOVA Research Draft',
              senderRole: `Read-only research context · ${threadId}`,
              timestamp: 'กู้คืนสถานะอัตโนมัติ',
              text: `🔄 กู้คืนคำสั่งที่รอการอนุมัติ (Pending Interrupt #${item.interruptId}) จากตาราง checkpoints ของ Thread ${threadId} สำเร็จแม้รีเฟรชหน้าเว็บ:`,
              widget: 'langgraph-interrupt-approval-card',
              interruptData: item,
            }));
            setMessages(restoredMsgs.map((message) => ({
              ...message,
              text: 'พบ checkpoint การดำเนินการเดิม ระบบแสดงข้อมูลนี้เป็น Research Draft เท่านั้น ไม่สามารถอนุมัติหรือส่งคำสั่งซื้อขายได้',
            })));
            setActiveWorkflowPanel('inbox');
          }
        }
      })
      .catch(() => {});
  }, [threadId]);

  // Poll Backend Autonomous Data Ingestion & Model Training Status
  useEffect(() => {
    let active = true;
    const pollStatus = () => {
      fetch('/api/auto-train/status', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          if (data?.statusNotification) {
            setAutoTrainNotice(data.statusNotification);
            setAutoTrainSyncing(data.state === 'INGESTING_AND_TRAINING');
          }
        })
        .catch(() => {});
    };
    pollStatus();
    const timer = setInterval(pollStatus, 9000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  function handleSelectPair(symbol: string, group: 'FOREX' | 'CRYPTO') {
    setPairGroup(group);
    setSelectedPair(symbol);
    setAutoTrainSyncing(true);
    setAutoTrainNotice(`Backend Auto-Train: กำลังดึงกราฟสด ${symbol} มาเทรนที่ Backend...`);

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
      })
      .catch(() => {
        setAutoTrainNotice(`Backend Auto-Train: ไม่สามารถยืนยันการดึงข้อมูลหรือฝึกโมเดล ${symbol} ได้`);
      })
      .finally(() => {
        setAutoTrainSyncing(false);
      });
  }

  // Research-only UI shortcut. No broker approval or resume action is available.
  function triggerQuickAutoHarvestNow() {
    handleSendChat(`วิเคราะห์ตลาด ${selectedPair} แบบ Read-only พร้อม Scenario แนวรับแนวต้าน และความเสี่ยง โดยไม่ส่งคำสั่งซื้อขาย`);
  }

  // Dispatch natural language intent through the 5-Layer Backend Engine
  async function handleSendChat(customText?: string) {
    const query = (customText ?? inputPrompt).trim();
    if (!query || sending) return;

    setActiveWorkflowPanel('inbox');

    const userMsg: ChatOSMessage = {
      id: nextMsgId('usr'),
      role: 'user',
      senderName: 'คุณ (Zero-Menu Operator)',
      senderRole: `Thread: ${threadId}`,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputPrompt('');
    setSending(true);

    try {
      const res = await fetch('/api/intent/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          symbol: selectedPair,
          threadId,
        }),
      });
      const data = await res.json();

      const replyMsg: ChatOSMessage = {
        id: nextMsgId('bot'),
        role: 'assistant',
        senderName: `${activeAgent.name} (${activeAgent.role})`,
        senderRole: `${data?.layerTriggered || '5-Layer Zero-Menu Engine'}`,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        text: data?.reply || data?.detail || data?.error || 'คำขอนี้ยังไม่สามารถยืนยันผลลัพธ์ได้',
        widget: (data?.declarativeUiType as ChatWidgetType) || 'balance-summary-card',
        structuredIntent: data?.structuredIntent,
        semanticCache: data?.semanticCache,
        interruptData: data?.interruptCheckpoint,
        riskRejectionData: data?.riskCheck,
        guardrailData: data?.guardrail,
        clarificationData: data?.clarification,
        quantTelemetry: data?.quantTelemetry,
      };

      setMessages((prev) => [...prev, replyMsg]);
    } catch {
      const fallbackMsg: ChatOSMessage = {
        id: nextMsgId('bot'),
        role: 'assistant',
        senderName: `${activeAgent.name} (${activeAgent.role})`,
        senderRole: selectedPair,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        text: 'ตรวจสอบสถานะ Exness Demo read-only session โดยไม่เปิดเผย account identifier:',
        widget: 'balance-summary-card',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setSending(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }

  function clearAllChatAndPanels() {
    setMessages([]);
    setActiveWorkflowPanel('none');

  }

  const hasActiveContent = messages.length > 0 || activeWorkflowPanel !== 'none';
  const visibleChecklist =
    checklistFilter === 'ALL'
      ? checklistState
      : checklistState.filter((c) => c.phase === checklistFilter);

  return (
    <div className="relative rounded-3xl bg-[#030712] border border-cyan-400/40 shadow-[0_0_70px_rgba(6,182,212,0.18)] overflow-hidden p-3 sm:p-5 space-y-4">
      {/* Ambient Cyber Glow Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.18),transparent_65%),radial-gradient(ellipse_at_bottom,rgba(37,99,235,0.14),transparent_60%)]" />

      {/* =====================================================================
          1. TOP HOLOGRAPHIC HUD: "AI COMMAND LAYER" (Zero-Menu Intent-Driven OS)
         ===================================================================== */}
      <div className="relative rounded-3xl bg-gradient-to-b from-[#07142B]/95 via-[#050E21]/95 to-[#040A17]/95 border border-cyan-400/50 shadow-[0_0_35px_rgba(34,211,238,0.2)] p-4 sm:p-5">
        {/* Decorative HUD Corner Brackets */}
        <div className="pointer-events-none absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-300" />
        <div className="pointer-events-none absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-300" />
        <div className="pointer-events-none absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-300" />
        <div className="pointer-events-none absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-300" />

        {/* Top HUD Title Plate + Thread ID + Right Status & Settings */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3 mb-4">
          {/* Left: Backend Auto-Train Compact Status + Session thread_id */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span
              className={`px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                autoTrainSyncing
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/50'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoTrainSyncing ? 'bg-cyan-300 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
              {autoTrainNotice}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-400/40">
              LangGraph: {threadId}
            </span>
          </div>

          {/* Center: AI COMMAND LAYER Header */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2.5 px-5 py-1 rounded-full bg-cyan-500/15 border border-cyan-300/60 shadow-[0_0_20px_rgba(34,211,238,0.35)]">
              <span className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
              <h1 className="text-sm sm:text-base font-extrabold tracking-[0.22em] text-white">
                AI COMMAND LAYER
              </h1>
              <span className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
            </div>
            <p className="text-[11px] sm:text-xs text-cyan-200/80 mt-1 font-medium tracking-wide">
              Zero-Menu Intent-Driven · Semantic Cache · Credential boundary · Polite Fallback
            </p>
          </div>

          {/* Right: Quick Action & Settings Link */}
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveContent && (
              <button
                type="button"
                onClick={clearAllChatAndPanels}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ล้างหน้าจอ
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSendChat('เปิดคลังคอมโพเนนต์ Component Catalog')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 transition-colors"
            >
              🧩 Component Catalog
            </button>
            <button
              type="button"
              onClick={() => handleSendChat('สรุปแผนการดำเนินงาน Phase 1 - Phase 4 Checklist')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 transition-colors flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              Checklist Phase 1–4
            </button>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              ⚙️ ตั้งค่าระบบ
            </Link>
          </div>
        </div>

        {/* 8 AI Agent Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {AI_COMMAND_AGENTS.map((agent) => {
            const isSelected = agent.id === activeAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  setActiveAgentId(agent.id);
                }}
                className={`group relative rounded-2xl p-3 bg-gradient-to-b ${agent.bgGradient} border transition-all flex flex-col items-center text-center ${
                  isSelected
                    ? `${agent.border} ${agent.glow} scale-[1.02] ring-1 ring-cyan-300/60`
                    : 'border-cyan-500/25 hover:border-cyan-400/60 opacity-85 hover:opacity-100'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
                )}
                <AgentCyberAvatar type={agent.avatarType} />
                <div className="mt-2.5 text-xs sm:text-sm font-extrabold text-white tracking-tight">
                  {agent.name}
                </div>
                <div className={`text-[11px] font-medium ${agent.accent}`}>{agent.role}</div>
                <div className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">{agent.thaiRole}</div>
              </button>
            );
          })}
        </div>

        {/* ===================================================================
            2. FLOATING HOLOGRAPHIC PROMPT BAR: "Ask anything. Automate anything."
           =================================================================== */}
        <div className="mt-4 flex flex-col items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat();
            }}
            className="w-full max-w-2xl rounded-full p-1.5 bg-gradient-to-r from-[#071A38] via-[#0A2246] to-[#071A38] border-2 border-cyan-300/80 shadow-[0_0_30px_rgba(56,189,248,0.45)] flex items-center gap-2"
          >
            <div className="pl-3 pr-1 flex items-center gap-1.5 text-cyan-300 shrink-0">
              <Sparkles className="w-5 h-5 drop-shadow-[0_0_8px_rgba(103,232,249,0.9)]" />
              <span className="hidden sm:inline text-[11px] font-mono font-bold text-cyan-200 bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-400/40">
                {activeAgent.name}
              </span>
            </div>
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder='วิเคราะห์ตลาดและกลยุทธ์ได้ในโหมด Read-only เท่านั้น · ไม่มีการส่งคำสั่งซื้อขาย'
              className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-cyan-200/60 focus:outline-none px-2 py-2"
            />
            <button
              type="submit"
              disabled={sending}
              aria-label="Send Command"
              className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.7)] transition-transform active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Compact Major Forex & Crypto Selector Bar */}
          <div className="mt-3 w-full flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-cyan-500/20">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectPair(FOREX_MAJOR_PAIRS[0].symbol, 'FOREX')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  pairGroup === 'FOREX'
                    ? 'bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                    : 'bg-[#071326] text-slate-300 border border-cyan-500/30'
                }`}
              >
                🌍 8 คู่หลัก Forex &amp; ทองคำ · ราคาอ้างอิง
              </button>
              <button
                type="button"
                onClick={() => handleSelectPair(CRYPTO_MAJOR_PAIRS[0].symbol, 'CRYPTO')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  pairGroup === 'CRYPTO'
                    ? 'bg-indigo-400 text-slate-950 shadow-[0_0_12px_rgba(129,140,248,0.5)]'
                    : 'bg-[#071326] text-slate-300 border border-cyan-500/30'
                }`}
              >
                🪙 8 คู่หลัก Crypto · ราคาอ้างอิง
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5">
              {(pairGroup === 'FOREX' ? FOREX_MAJOR_PAIRS : CRYPTO_MAJOR_PAIRS).map((item) => {
                const active = selectedPair === item.symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => handleSelectPair(item.symbol, pairGroup)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all whitespace-nowrap border ${
                      active
                        ? 'bg-cyan-400/25 text-cyan-200 border-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.35)]'
                        : 'bg-[#061020] text-slate-300 border-slate-800 hover:border-cyan-500/40'
                    }`}
                  >
                    {item.symbol}{' '}
                    <span className="text-[10px] text-cyan-300/80">
                      ${item.basePrice.toLocaleString('en-US', { minimumFractionDigits: item.dec, maximumFractionDigits: item.dec })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. ON-DEMAND ZERO-MENU GENERATIVE UI STREAM CONTAINER
             (Clean by default — Streams Declarative JSON Widgets only when invoked!)
         ===================================================================== */}
      <div className="relative rounded-2xl bg-[#070E1C]/90 border border-cyan-500/35 shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden">
        {!hasActiveContent ? (
          /* CLEAN STANDBY STATE: Zero-Menu Intent-Driven Quick Test Prompts */
          <div className="px-6 py-8 text-center flex flex-col items-center justify-center space-y-3">
            <p className="text-xs text-slate-400">
              หน้าจอไร้เมนูกด (Zero-Menu / Intent-Driven) · แสดงผลวิดเจ็ตเฉพาะเมื่อคุณพิมพ์สั่งงานหรือคลิกทดสอบกลยุทธ์ด้านล่าง:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { label: '💰 "ขอดูยอดเงินคงเหลือหน่อย" (Semantic Cache · ไม่ติด Interrupt)', cmd: 'ขอดูยอดเงินคงเหลือหน่อย' },
                { label: `⏸️ "วิเคราะห์ตลาด ${selectedPair} แบบ Read-only พร้อม Scenario และระดับความเสี่ยง" (Interrupt + Credential boundary)`, cmd: `วิเคราะห์ตลาด ${selectedPair} แบบ Read-only พร้อม Scenario และระดับความเสี่ยง` },
                { label: '💬 "ตรวจสอบ input ที่ไม่ถูกต้องในโหมดวิเคราะห์เท่านั้น โดยไม่ส่งคำสั่งซื้อขาย" (ทดสอบ Fallback เมื่อพารามิเตอร์ผิดพลาด)', cmd: 'ตรวจสอบ input ที่ไม่ถูกต้องในโหมดวิเคราะห์เท่านั้น โดยไม่ส่งคำสั่งซื้อขาย' },
                { label: `🛑 "วิเคราะห์ความเสี่ยง ${selectedPair} แบบ Read-only โดยไม่ส่งคำสั่งซื้อขาย" (ทดสอบ Risk Engine บล็อกอัตโนมัติ)`, cmd: `วิเคราะห์ความเสี่ยง ${selectedPair} แบบ Read-only โดยไม่ส่งคำสั่งซื้อขาย` },
                { label: '🧩 "ดูคลังคอมโพเนนต์ Phase 3 Catalog"', cmd: 'เปิดคลังคอมโพเนนต์ Component Catalog' },
                { label: '📋 "สรุปแผนการดำเนินงาน Phase 1–4 Checklist"', cmd: 'สรุปแผนการดำเนินงาน Phase 1 - Phase 4 Checklist' },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => handleSendChat(q.cmd)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#0B172E] hover:bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ACTIVE ON-DEMAND VIEW: Shows only what the user requested */
          <div>
            {/* Clean Top Bar with Close / Clear button */}
            <div className="px-4 py-2.5 bg-[#050A15] border-b border-cyan-500/25 flex items-center justify-between text-xs">
              <div className="flex flex-wrap items-center gap-2 text-cyan-300 font-mono">
                <span>● {activeAgent.name} ({activeAgent.role})</span>
                <span className="text-slate-500">·</span>
                <span className="text-emerald-300">{selectedPair}</span>
                <span className="text-slate-500">·</span>
                <span className="text-indigo-300">FastMCP Streamable HTTP</span>
              </div>
              <button
                type="button"
                onClick={clearAllChatAndPanels}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-[11px] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                ปิดหน้าต่างแสดงผล / ล้างแชท
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[620px] overflow-y-auto">
              {/* Trading history is hidden until verified account data exists. */}
              {activeWorkflowPanel === 'calendar' && (
                <div className="p-4 rounded-2xl bg-[#0A1326] border border-amber-500/35 space-y-3 text-xs">
                  <div className="font-extrabold text-white">RESEARCH CALENDAR · {selectedPair}</div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">ยังไม่มีประวัติจาก Exness Demo ที่ยืนยันได้ จึงไม่แสดงกำไร จำนวนออเดอร์ หรือสถานะ Bot</div>
                  <div className="text-slate-400">Read-only · Live Trading OFF · Broker session not configured</div>
                </div>
              )}

              {/* If user clicked DOCS workflow step directly */}
              {activeWorkflowPanel === 'docs' && (
                <div className="p-4 rounded-2xl bg-[#0A1326] border border-cyan-500/35 space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <h3 className="text-sm font-extrabold text-white">
                        Q2 Research &amp; Risk Review · {selectedPair}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        ร่างแผนกลยุทธ์อัตโนมัติโดย {activeAgent.name} ({activeAgent.role})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={triggerQuickAutoHarvestNow}
                      className="px-3 py-1.5 rounded-xl font-bold bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                    >
                      วิเคราะห์ตลาดแบบ Read-only
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {roadmapGoals.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setRoadmapGoals((prev) =>
                            prev.map((item) => (item.id === g.id ? { ...item, done: !item.done } : item))
                          )
                        }
                        className="w-full flex items-center gap-2 text-left text-slate-200 hover:text-white"
                      >
                        {g.done ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                        <span>{g.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Portfolio status requires an authenticated tenant-scoped broker session. */}
              {activeWorkflowPanel === 'crm' && (
                <div className="p-4 rounded-2xl bg-[#0A1326] border border-amber-500/35 space-y-3 text-xs">
                  <div className="font-extrabold text-white">Broker &amp; Portfolio Status</div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">Exness Demo · Not configured · Owner/session not verified</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                    {['Account ID', 'Balance', 'Equity', 'Open Positions'].map((label) => (<div key={label} className="p-3 rounded-xl bg-[#060B16] border border-slate-800"><div className="text-[10px] text-slate-400">{label}</div><div className="text-sm font-bold text-slate-400 mt-0.5">Not verified</div></div>))}
                  </div>
                  <div className="text-slate-400">No connected account, no broker actions and no simulated P&amp;L.</div>
                </div>
              )}

              {/* User & AI Chat Messages Stream */}
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                        isUser
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
                      }`}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    <div className={`max-w-4xl w-full space-y-2.5 ${isUser ? 'items-end text-right' : ''}`}>
                      <div
                        className={`inline-block text-left p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-line ${
                          isUser
                            ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/40'
                            : 'bg-[#0B1426] text-slate-100 border border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1 text-[10px] font-mono text-cyan-300/80">
                          <span>{msg.senderName || (isUser ? 'คุณ' : activeAgent.name)}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        {msg.text}

                        {/* Strategy 1 + Pitfall 1 Trace: Zod Schema + FastMCP + Semantic Cache Latency */}
                        {msg.structuredIntent && (
                          <div className="mt-2.5 pt-2 border-t border-slate-800/90 flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                            <span className="text-cyan-300">
                              Zod: {msg.structuredIntent.intentType}
                            </span>
                            <span>·</span>
                            <span className="text-indigo-300">{msg.structuredIntent.mcpTool}</span>
                            {msg.semanticCache && (
                              <>
                                <span>·</span>
                                <span className={msg.semanticCache.hit ? 'text-emerald-300 font-bold' : 'text-slate-300'}>
                                  {msg.semanticCache.hit
                                    ? `⚡ Semantic Cache HIT (${msg.semanticCache.latencyMs}ms)`
                                    : `Latency: ${msg.semanticCache.latencyMs}ms`}
                                </span>
                              </>
                            )}
                            <span>·</span>
                            <span
                              className={
                                msg.structuredIntent.requiresInterrupt ? 'text-amber-300' : 'text-emerald-300'
                              }
                            >
                              {msg.structuredIntent.requiresInterrupt
                                ? '⏸️ Interrupt: ON'
                                : '⚡ Read-Only (No Interrupt)'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* =====================================================
                          WIDGET A: BROKER STATUS (UNVERIFIED)
                         ===================================================== */}
                      {msg.widget === 'balance-summary-card' && (
                        <div className="p-4 rounded-2xl bg-[#09152B] border border-amber-500/40 text-left space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800"><div className="text-xs font-mono text-cyan-300">Exness Demo · Read-only account status</div><span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/15 text-amber-200 border border-amber-500/40">NOT CONFIGURED · NOT VERIFIED</span></div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums text-xs">{['Account ID', 'Balance', 'Equity', 'Free Margin'].map((label) => (<div key={label} className="p-3 rounded-xl bg-[#050B16] border border-slate-800"><div className="text-[10px] text-slate-400">{label}</div><div className="font-extrabold text-slate-400 mt-0.5">—</div></div>))}</div>
                          <p className="text-[11px] text-slate-400">แสดงข้อมูลได้หลังผ่าน authenticated owner-scoped Exness Demo read session เท่านั้น · No orders · Live Trading OFF</p>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET B: MARKET ANALYSIS CARD (calculate_risk)
                         ===================================================== */}
                      {msg.widget === 'market-analysis-card' && msg.quantTelemetry && (
                        <div className="p-4 rounded-2xl bg-[#09152B] border border-cyan-400/40 text-left space-y-3 text-xs font-mono">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                            <span className="font-bold text-cyan-300">
                              📊 FastMCP calculate_risk · {msg.quantTelemetry.symbol} (${msg.quantTelemetry.price})
                            </span>
                            <span className="text-emerald-400">
                              {msg.quantTelemetry.regime} ({msg.quantTelemetry.confidencePct}%)
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2.5">
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800">
                              <div className="text-[10px] text-slate-400">VPIN Toxicity</div>
                              <div className="font-bold text-white mt-0.5">{msg.quantTelemetry.vpinScore} (ปลอดภัย)</div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800">
                              <div className="text-[10px] text-slate-400">Scenario Stop Reference</div>
                              <div className="font-bold text-rose-400 mt-0.5">${msg.quantTelemetry.sl}</div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800">
                              <div className="text-[10px] text-slate-400">Scenario Target Reference</div>
                              <div className="font-bold text-emerald-400 mt-0.5">${msg.quantTelemetry.tp}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET C: NON-EXECUTABLE RESEARCH DRAFT
                         ===================================================== */}
                      {msg.widget === 'langgraph-interrupt-approval-card' && msg.interruptData && (
                        <div className="p-4 rounded-2xl bg-[#0A1528] border border-amber-400/40 text-left space-y-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800"><div className="font-extrabold text-white">RESEARCH DRAFT · {msg.interruptData.symbol}</div><span className="px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/40 font-mono text-[10px]">NON-EXECUTABLE</span></div>
                          <p className="text-slate-300">ข้อมูลจากคำขอเดิมแสดงเพื่อการศึกษาเท่านั้น ไม่ใช่คำสั่งที่รออนุมัติ และไม่ได้ตรวจสอบกับ Broker</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800"><div className="text-[10px] text-slate-400">Direction scenario</div><div className="font-bold text-white">{msg.interruptData.side || '—'}</div></div>
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800"><div className="text-[10px] text-slate-400">Entry reference</div><div className="font-bold text-white">{msg.interruptData.entryPrice ?? '—'}</div></div>
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800"><div className="text-[10px] text-slate-400">Stop reference</div><div className="font-bold text-rose-300">{msg.interruptData.stopLoss ?? '—'}</div></div>
                            <div className="p-2.5 rounded-xl bg-[#050B16] border border-slate-800"><div className="text-[10px] text-slate-400">Target reference</div><div className="font-bold text-emerald-300">{msg.interruptData.takeProfit ?? '—'}</div></div>
                          </div>
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">Broker session: Not configured · Token not requested or displayed · This card cannot approve or submit an order.</div>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET D: POLITE CLARIFICATION FALLBACK CARD (Pitfall 3 Fix)
                         ===================================================== */}
                      {msg.widget === 'clarification-fallback-card' && msg.clarificationData && (
                        <div className="p-4 rounded-2xl bg-[#0D182E] border-2 border-cyan-400/50 text-left space-y-3 text-xs">
                          <div className="flex items-center justify-between font-mono text-cyan-300">
                            <span className="flex items-center gap-1.5 font-extrabold">
                              <HelpCircle className="w-4 h-4 text-cyan-400" />
                              💬 Polite Clarification Fallback (ดักจับ FastMCP Schema Error อัตโนมัติ)
                            </span>
                            <span className="text-[10px] text-amber-300">
                              {msg.clarificationData.validationIssue}
                            </span>
                          </div>
                          <p className="text-slate-200 leading-relaxed">
                            ระบบแปลง Validation Error ให้เป็นคำถามสุภาพแทนการแสดงหน้าจอ Error สีแดง — กรุณาเลือกคำสั่งที่ถูกต้องด้านล่างได้เลยครับ:
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {(msg.clarificationData.suggestedPrompts || []).map((s) => (
                              <button
                                key={s.label}
                                type="button"
                                onClick={() => handleSendChat(s.cmd)}
                                className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold transition-colors"
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET E: PHASE 3 GENERATIVE UI COMPONENT CATALOG CARD
                          (ApprovalCard, RiskChart, TradeSummaryCard, BotStatusWidget)
                         ===================================================== */}
                      {msg.widget === 'component-catalog-card' && (
                        <div className="p-4 sm:p-5 rounded-2xl bg-[#091428] border border-cyan-400/50 text-left space-y-4 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                            <div>
                              <h4 className="text-sm font-extrabold text-white">
                                🧩 Phase 3: คลังคอมโพเนนต์เชิงกำเนิด (Declarative A2UI Component Catalog)
                              </h4>
                              <p className="text-[11px] text-slate-400">
                                เรนเดอร์จาก JSON ล้วน (Least Privilege UI) ไม่ส่งโค้ด Executable JS จากเซิร์ฟเวอร์
                              </p>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-mono text-[11px] font-bold">
                              4 Core Widgets Registered
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* 1. ApprovalCard */}
                            <div className="p-3.5 rounded-xl bg-[#050B16] border border-amber-400/40 space-y-2">
                              <div className="flex items-center justify-between font-mono">
                                <span className="font-bold text-amber-300">&lt;ApprovalCard /&gt;</span>
                                <span className="text-[10px] text-slate-400">Human-in-the-Loop</span>
                              </div>
                              <p className="text-[11px] text-slate-300">
                                การ์ด Research Draft สำหรับดู Scenario เท่านั้น ไม่มี Approve, Edit หรือ broker action
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSendChat(`วิเคราะห์ตลาด ${selectedPair} แบบ Read-only พร้อม Scenario และระดับความเสี่ยง`)}
                                className="w-full py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 font-bold text-[11px]"
                              >
                                เรียกใช้งาน &lt;ApprovalCard /&gt; →
                              </button>
                            </div>

                            {/* 2. RiskChart */}
                            <div className="p-3.5 rounded-xl bg-[#050B16] border border-cyan-400/40 space-y-2">
                              <div className="flex items-center justify-between font-mono">
                                <span className="font-bold text-cyan-300">&lt;RiskChart /&gt;</span>
                                <span className="text-[10px] text-emerald-400">VaR 1.32% · VPIN 0.71</span>
                              </div>
                              <p className="text-[11px] text-slate-300">
                                กราฟและมาตรวัดความเสี่ยงจาก Quantum VQC + Rule-Based Risk Engine ตรวจสอบ Drawdown และ Margin
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSendChat(`วิเคราะห์ตลาด ${selectedPair}`)}
                                className="w-full py-1.5 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-200 border border-cyan-400/40 font-bold text-[11px]"
                              >
                                เรียกใช้งาน &lt;RiskChart /&gt; →
                              </button>
                            </div>

                            {/* 3. TradeSummaryCard */}
                            <div className="p-3.5 rounded-xl bg-[#050B16] border border-emerald-400/40 space-y-2">
                              <div className="flex items-center justify-between font-mono">
                                <span className="font-bold text-emerald-300">&lt;TradeSummaryCard /&gt;</span>
                                <span className="text-[10px] text-emerald-400">— · +$7,008</span>
                              </div>
                              <p className="text-[11px] text-slate-300">
                                การ์ดสรุปยอดเงินคงเหลือ อิควิตี้ และตารางกำไรรายวันจากตาราง trade_logs แบบไม่ต้องรอ Interrupt
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSendChat('ขอดูยอดเงินคงเหลือหน่อย')}
                                className="w-full py-1.5 rounded-lg bg-emerald-400/20 hover:bg-emerald-400/30 text-emerald-200 border border-emerald-400/40 font-bold text-[11px]"
                              >
                                เรียกใช้งาน &lt;TradeSummaryCard /&gt; →
                              </button>
                            </div>

                            {/* 4. BotStatusWidget */}
                            <div className="p-3.5 rounded-xl bg-[#050B16] border border-indigo-400/40 space-y-2">
                              <div className="flex items-center justify-between font-mono">
                                <span className="font-bold text-indigo-300">&lt;BotStatusWidget /&gt;</span>
                                <span className="text-[10px] text-emerald-400">● Epoch #148 (94.8%)</span>
                              </div>
                              <p className="text-[11px] text-slate-300">
                                วิดเจ็ตแสดงสถานะบอท Dynamic Grid, Backend Auto-Train 16 คู่เงินหลัก และ Read-only broker guard
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSendChat('ขอดูปฏิทินกำไร Dynamic Grid')}
                                className="w-full py-1.5 rounded-lg bg-indigo-400/20 hover:bg-indigo-400/30 text-indigo-200 border border-indigo-400/40 font-bold text-[11px]"
                              >
                                เรียกใช้งาน &lt;BotStatusWidget /&gt; →
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET F: RULE-BASED RISK ENGINE REJECTION CARD
                         ===================================================== */}
                      {msg.widget === 'risk-guard-rejected-card' && msg.riskRejectionData && (
                        <div className="p-4 rounded-2xl bg-[#1A0B12] border-2 border-rose-500/60 text-left space-y-2.5 text-xs">
                          <div className="flex items-center justify-between text-rose-300 font-mono font-extrabold">
                            <span className="flex items-center gap-1.5">
                              <ShieldAlert className="w-4 h-4 text-rose-400" />
                              🛑 RESEARCH GUARD · NON-EXECUTABLE
                            </span>
                            <span>HARD RULE VIOLATION</span>
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-rose-200">
                            {msg.riskRejectionData.violations.map((v, i) => (
                              <li key={i}>{v}</li>
                            ))}
                          </ul>
                          <div className="pt-2 border-t border-rose-500/25 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-400">
                            <span>
                              Margin Usage ที่คำนวณได้: {msg.riskRejectionData.metrics.marginUsagePct}% (เพดาน ≤ 35%)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSendChat(`วิเคราะห์ตลาด ${selectedPair} แบบ Read-only พร้อม Scenario และระดับความเสี่ยง`)}
                              className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold"
                            >
                              วิเคราะห์ Scenario ต่อแบบ Read-only →
                            </button>
                          </div>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET G: NEMO GUARDRAILS BLOCKED CARD
                         ===================================================== */}
                      {msg.widget === 'nemo-guardrail-blocked-card' && msg.guardrailData && (
                        <div className="p-4 rounded-2xl bg-[#180D24] border-2 border-violet-400/60 text-left space-y-2 text-xs">
                          <div className="flex items-center justify-between font-mono font-extrabold text-violet-300">
                            <span>🛡️ NVIDIA NeMo Guardrails · Colang Security Shield</span>
                            <span>BLOCKED</span>
                          </div>
                          <p className="text-slate-200">{msg.guardrailData.reason}</p>
                          <div className="text-[11px] font-mono text-violet-300/80">
                            Rule: {msg.guardrailData.violationRule}
                          </div>
                        </div>
                      )}

                      {/* =====================================================
                          WIDGET H: 4-PHASE ACTIONABLE CHECKLIST & PITFALL MITIGATIONS
                         ===================================================== */}
                      {msg.widget === 'architecture-checklist-card' && (
                        <div className="p-4 sm:p-5 rounded-2xl bg-[#091428] border border-cyan-400/50 text-left space-y-4 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                            <div>
                              <h4 className="text-sm font-extrabold text-white">
                                📋 แผนการดำเนินงานทั้งหมด (Phase 1 – Phase 4 Checklist) &amp; การป้องกันจุดอ่อน 3 ข้อ
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                ตารางฐานข้อมูล: threads, checkpoints, trade_logs, user_configs · Session: {threadId}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {['ALL', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Pitfall Mitigation'].map((tab) => (
                                <button
                                  key={tab}
                                  type="button"
                                  onClick={() => setChecklistFilter(tab)}
                                  className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition-colors ${
                                    checklistFilter === tab
                                      ? 'bg-cyan-400 text-slate-950'
                                      : 'bg-[#050B16] text-slate-400 hover:text-white border border-slate-800'
                                  }`}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            {visibleChecklist.map((item) => (
                              <div
                                key={item.id}
                                className="p-3 rounded-xl bg-[#050B16] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                              >
                                <div className="flex items-start gap-2.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setChecklistState((prev) =>
                                        prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c))
                                      )
                                    }
                                    className="mt-0.5 text-emerald-400"
                                  >
                                    {item.done ? (
                                      <CheckSquare className="w-4 h-4" />
                                    ) : (
                                      <Square className="w-4 h-4 text-slate-500" />
                                    )}
                                  </button>
                                  <div>
                                    <div className="text-[10px] font-mono text-cyan-300">{item.phase}</div>
                                    <div className="font-bold text-white">{item.title}</div>
                                    <div className="text-[11px] text-slate-400">{item.desc}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSendChat(item.testCmd)}
                                  className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/35 font-mono text-[11px] shrink-0"
                                >
                                  ทดสอบ: &ldquo;{item.testCmd}&rdquo; →
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dynamic Grid research calendar has no fabricated trading history. */}
                      {msg.widget === 'dynamic-grid-calendar' && (
                        <div className="p-4 rounded-2xl bg-[#0A1326] border border-amber-500/35 text-left space-y-3">
                          <div className="font-extrabold text-white">RESEARCH CALENDAR · {selectedPair}</div>
                          <div className="text-xs text-amber-200">ยังไม่มี verified broker history จึงไม่แสดง P&amp;L หรือจำนวนการปิดออเดอร์</div>
                          {onSwitchTab && <button type="button" onClick={() => onSwitchTab('dynamic-grid-calendar')} className="text-cyan-300 hover:underline font-mono text-[11px]">เปิดปฏิทินวิจัย →</button>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          4. BOTTOM HOLOGRAPHIC CARDS: "NETWORK EFFECT" + "AUTOMATION WORKFLOW"
         ===================================================================== */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Bottom-Left: NETWORK EFFECT Card */}
        <div className="lg:col-span-3 rounded-2xl bg-gradient-to-b from-[#071630]/95 to-[#040B1A]/95 border border-cyan-400/50 shadow-[0_0_30px_rgba(34,211,238,0.2)] p-4 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-mono font-extrabold tracking-[0.18em] text-cyan-300 uppercase">
              NETWORK EFFECT
            </div>

            <div className="my-3 flex items-center justify-center">
              <div className="relative w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-400/40 shadow-[0_0_30px_rgba(56,189,248,0.45),inset_0_0_20px_rgba(56,189,248,0.35)] flex items-center justify-center">
                <svg className="w-16 h-16 text-cyan-300" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="42" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" />
                  <line x1="25" y1="30" x2="55" y2="20" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
                  <line x1="55" y1="20" x2="78" y2="42" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
                  <line x1="25" y1="30" x2="48" y2="52" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.8" />
                  <line x1="78" y1="42" x2="48" y2="52" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.8" />
                  <line x1="48" y1="52" x2="30" y2="75" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
                  <line x1="48" y1="52" x2="72" y2="75" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.7" />
                  {[
                    [25, 30],
                    [55, 20],
                    [78, 42],
                    [48, 52],
                    [30, 75],
                    [72, 75],
                  ].map(([cx, cy], idx) => (
                    <circle key={idx} cx={cx} cy={cy} r="3.5" fill="#e0f2fe" />
                  ))}
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <p className="text-slate-200 font-medium leading-snug">
              The more you use it, the smarter it gets.
            </p>
            <p className="text-[11px] text-slate-400">
              Built on <strong className="text-cyan-300">distribution</strong>. Designed for{' '}
              <strong className="text-cyan-300">trust</strong>.
            </p>
          </div>
        </div>

        {/* Bottom-Center/Right: AUTOMATION WORKFLOW */}
        <div className="lg:col-span-9 rounded-2xl bg-gradient-to-b from-[#071630]/95 to-[#040B1A]/95 border border-cyan-400/50 shadow-[0_0_30px_rgba(34,211,238,0.2)] p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
              <span className="text-xs font-mono font-extrabold tracking-[0.2em] text-cyan-200 uppercase">
                AUTOMATION WORKFLOW
              </span>
            </div>
            <span className="text-[11px] text-cyan-300/80 font-mono">
              คลิกปุ่มด้านล่างเมื่อต้องการเปิดดูข้อมูลแต่ละหมวดหมู่
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center my-auto">
            {[
              {
                id: 'inbox' as const,
                title: 'INBOX',
                subtitle: 'Capture & triage',
                thai: 'calculate_risk (No Interrupt)',
                icon: Inbox,
                action: () => handleSendChat(`วิเคราะห์ตลาด ${selectedPair}`),
              },
              {
                id: 'calendar' as const,
                title: 'CALENDAR',
                subtitle: 'Schedule & prep',
                thai: 'เปิดดูปฏิทินกำไร Grid',
                icon: Calendar,
                action: () =>
                  setActiveWorkflowPanel((p) => (p === 'calendar' ? 'none' : 'calendar')),
              },
              {
                id: 'docs' as const,
                title: 'DOCS',
                subtitle: 'Draft & collaborate',
                thai: 'เปิดดูแผน & Pitfall Guard',
                icon: FileText,
                action: () =>
                  setActiveWorkflowPanel((p) => (p === 'docs' ? 'none' : 'docs')),
              },
              {
                id: 'crm' as const,
                title: 'CRM',
                subtitle: 'Update & follow up',
                thai: 'get_portfolio_status',
                icon: Users,
                action: () => handleSendChat('ขอดูยอดเงินคงเหลือหน่อย'),
              },
            ].map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeWorkflowPanel === step.id;
              return (
                <div key={step.id} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={step.action}
                    className={`w-full rounded-2xl p-3.5 border transition-all flex flex-col items-center text-center ${
                      isActive
                        ? 'bg-cyan-500/20 border-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.35)]'
                        : 'bg-[#061226]/90 border-cyan-500/30 hover:border-cyan-300/70'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)] mb-2">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-extrabold tracking-wider text-white">{step.title}</div>
                    <div className="text-[11px] text-cyan-200/90 mt-0.5">{step.subtitle}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{step.thai}</div>
                  </button>

                  {idx < 3 && (
                    <div className="hidden sm:flex items-center justify-center -mr-2.5 z-10 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
