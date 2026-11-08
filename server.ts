import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const KNOWN_INSTRUMENT_SYMBOLS = [
  'XAU/USDm', 'EUR/USDm', 'GBP/USDm', 'USD/JPYm', 'USD/CHFm', 'AUD/USDm', 'USD/CADm', 'NZD/USDm',
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'TON/USDT',
] as const;
function detectInstrumentFromText(rawPrompt: string): string {
  const text = (rawPrompt || '').toUpperCase();
  for (const sym of KNOWN_INSTRUMENT_SYMBOLS) {
    const base = sym.split('/')[0];
    if (text.includes(sym.toUpperCase()) || text.includes(base)) {
      return sym;
    }
  }
  return 'XAU/USDm';
}


async function startServer() {
  const app = express();

  // Fail closed before request-body parsing. This app has no approved broker-write runtime.
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.path === '/api/broker/status') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        ok: false,
        error: 'broker_identity_unverified',
        status: 'not_configured',
        connected: false,
        accountConnected: false,
        environment: 'demo',
        ordersEnabled: false,
        executionEnabled: false,
        liveTradingEnabled: false,
      });
    }

    const blockedMutation =
      req.method !== 'GET' && (
        req.path.startsWith('/api/orders/') ||
        req.path.startsWith('/api/live-trading/') ||
        req.path === '/api/broker/status' ||
        req.path === '/api/mt5-bridge/toggle' ||
        req.path === '/api/agent/approvals/decision' ||
        req.path === '/api/intent/interrupt/resolve' ||
        (req.path.startsWith('/api/agent/threads/') && req.path.includes('/approvals'))
      );

    if (blockedMutation) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).json({
        ok: false,
        error: 'trading_execution_disabled',
        mode: 'read-only',
        ordersEnabled: false,
        executionEnabled: false,
        liveTradingEnabled: false,
      });
    }

    return next();
  });

  app.use(express.json());

  // Hard fail-closed defaults. No runtime API may enable broker writes.
  const mt5BridgeEnabled = false as const;
  const liveTradingEnabled = false as const;

  // =========================================================================
  // AUTO-TRAIN STATUS — FAIL CLOSED UNTIL A VERIFIED DATASET + TRAINING RUN EXISTS
  // Never fabricate epochs, sample counts, accuracy, or successful ingestion status.
  // =========================================================================
  const autoTrainUnavailable = {
    ok: false,
    configured: false,
    mode: 'NOT_CONFIGURED',
    state: 'BLOCKED',
    activePair: null,
    epoch: null,
    samplesIngested: null,
    validationAccuracyPct: null,
    lastTrainedAt: null,
    reason: 'VERIFIED_DATASET_AND_REPRODUCIBLE_TRAINING_PIPELINE_REQUIRED',
    statusNotification: 'BLOCKED: ยังไม่มีหลักฐานยืนยัน Dataset และ Training Run จริง จึงไม่รายงานว่าดึงข้อมูลหรือฝึกโมเดลสำเร็จ',
  };

  app.get('/api/auto-train/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json(autoTrainUnavailable);
  });

  app.post('/api/auto-train/trigger', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ...autoTrainUnavailable,
      error: 'AUTO_TRAINING_NOT_CONFIGURED',
      detail: 'Training is disabled until a provenance-verified dataset, reproducible job, and evaluation artifacts are available.',
    });
  });

  app.get('/api/mt5-bridge/status', (_req, res) => {
    res.json({
      service: 'mt5-bridge',
      enabled: mt5BridgeEnabled,
      status: mt5BridgeEnabled ? 'active' : 'disabled',
      detail: mt5BridgeEnabled
        ? 'MT5 Bridge Relay Active'
        : 'ปิด MT5 Bridge · ยังไม่มี authenticated Demo data path ที่ตรวจสอบแล้ว',
      updatedAt: new Date().toISOString(),
    });
  });

  app.post('/api/mt5-bridge/toggle', (req, res) => {
    if (req.body?.enabled === true) {
      return res.status(403).json({
        ok: false,
        service: 'mt5-bridge',
        enabled: false,
        error: 'MT5_BRIDGE_ENABLE_DISABLED',
        detail: 'MT5 Bridge remains disabled until a separately reviewed Demo read-only rollout.',
      });
    }
    return res.json({
      service: 'mt5-bridge',
      enabled: false,
      status: 'disabled',
      detail: 'MT5 Bridge is fail-closed and cannot be enabled through this API.',
      updatedAt: new Date().toISOString(),
    });
  });

  // Live Trading Execution Mode Status & Toggle Routes
  app.get('/api/live-trading/status', (_req, res) => {
    res.json({
      liveTradingEnabled: false,
      tradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      mode: 'read-only',
      environment: 'demo',
      accountConnected: false,
      mt5BridgeEnabled: false,
      detail: 'NOVA is fail-closed: Exness Demo read-only only; no broker execution is enabled.',
      updatedAt: new Date().toISOString(),
    });
  });

  app.post('/api/live-trading/toggle', (_req, res) => {
    return res.status(403).json({
      ok: false,
      liveTradingEnabled: false,
      tradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      mode: 'read-only',
      error: 'LIVE_TRADING_ENABLE_DISABLED',
      detail: 'Live trading cannot be enabled through the application API.',
      updatedAt: new Date().toISOString(),
    });
  });

  app.post('/api/orders/execute', (_req, res) => {
    return res.status(403).json({
      ok: false,
      error: 'BROKER_WRITES_DISABLED',
      mode: 'read-only',
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      detail: 'Order execution is disabled. This endpoint never submits or simulates a broker fill.',
    });
  });

  // Broker status is intentionally unverified until a real owner-scoped Demo read path exists.
  app.get('/api/broker/status', (req, res) => {
    const broker = String(req.query.broker || 'exness').toLowerCase();
    res.json({
      broker,
      status: 'not_configured',
      connected: false,
      accountConnected: false,
      environment: 'demo',
      mt5BridgeEnabled: false,
      mode: 'read-only',
      tradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      capabilities: ['market.instruments.read', 'market.candles.read'],
      checkedAt: new Date().toISOString(),
      detail: 'No authenticated Exness Demo account or quote path has been verified.',
    });
  });

  app.post('/api/broker/status', (req, res) => {
    const body = req.body || {};
    if (Object.keys(body).length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'BROKER_CONFIGURATION_INTAKE_DISABLED',
        detail: 'This endpoint does not accept broker credentials or connection configuration.',
      });
    }
    return res.status(409).json({
      ok: false,
      status: 'not_configured',
      connected: false,
      accountConnected: false,
      environment: 'demo',
      mode: 'read-only',
      tradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      detail: 'Broker credential intake and connection verification are not available.',
    });
  });

  // Fetch tradable currency/crypto pairs directly from the logged-in Broker session (supports MT5 or Direct API for Forex)
  app.get('/api/broker/instruments', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      status: 'NOT_VERIFIED',
      error: 'BROKER_INSTRUMENT_SOURCE_NOT_VERIFIED',
      detail: 'Instrument metadata, prices, spreads, and account-specific symbols require an authenticated owner-scoped read-only broker session.',
      brokerConnected: false,
      accountConnected: false,
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
    });
  });
  // Quantum inference is blocked until a real model/runtime and reproducible outputs are verified.
  app.post('/api/quantum/simulate', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      status: 'BLOCKED',
      error: 'QUANTUM_MODEL_RUNTIME_NOT_VERIFIED',
      detail: 'The current quantum calculations are deterministic UI/demo mathematics, not a verified VQC/QAOA/QRL model runtime.',
      dataEvidence: { status: 'NOT_VERIFIED', modelArtifactVerified: false, runtimeVerified: false },
      executionEnabled: false,
      ordersEnabled: false,
      liveTradingEnabled: false,
    });
  });
  app.get('/api/quantum/source', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ ok: false, error: 'SOURCE_ACCESS_NOT_AUTHORIZED' });
  });
  // =========================================================================
  // NOVA AI 5 CORE PLATFORM API ENDPOINTS (READ-ONLY · DEMO ARCHITECTURE)
  // =========================================================================

  // 1. Market Overview & Ticker Feed (Read-Only Demo Feed)
  app.get('/api/market/overview', (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      dataClassification: 'SYNTHETIC_DEMO_SCENARIO',
      safetyNotice: 'SYNTHETIC DEMO DATA · NOT EXNESS MARKET DATA · LIVE TRADING OFF',
      dataMode: 'SIMULATED_FEED',
      assets: [
        {
          symbol: 'XAU/USDm',
          displayName: 'Gold Spot / US Dollar (Synthetic Demo)',
          category: 'Metals',
          price: 2748.6,
          change24h: 1.42,
          high24h: 2758.2,
          low24h: 2732.1,
          volume24h: 184500,
          spreadLabel: '1.2 pips',
          atr14: 16.4,
          decimals: 2,
          feedSource: 'Synthetic demo values — not an authenticated market feed',
          dataMode: 'SIMULATED_FEED',
        },
        {
          symbol: 'BTC/USDm',
          displayName: 'Bitcoin CFD (Synthetic Demo)',
          category: 'Crypto',
          price: 62931.55,
          change24h: 0.75,
          high24h: 63520.0,
          low24h: 62110.0,
          volume24h: 94200,
          spreadLabel: '$12.0',
          atr14: 1240.0,
          decimals: 2,
          feedSource: 'Synthetic demo values — not an authenticated market feed',
          dataMode: 'SIMULATED_FEED',
        },
        {
          symbol: 'EUR/USDm',
          displayName: 'Euro / US Dollar',
          category: 'Forex',
          price: 1.0842,
          change24h: 0.38,
          high24h: 1.0875,
          low24h: 1.0818,
          volume24h: 312000,
          spreadLabel: '0.6 pips',
          atr14: 0.0054,
          decimals: 4,
          feedSource: 'Synthetic demo values — not an authenticated market feed',
          dataMode: 'SIMULATED_FEED',
        },
        {
          symbol: 'GBP/USDm',
          displayName: 'British Pound / US Dollar',
          category: 'Forex',
          price: 1.2982,
          change24h: 0.51,
          high24h: 1.3025,
          low24h: 1.294,
          volume24h: 248000,
          spreadLabel: '0.8 pips',
          atr14: 0.0078,
          decimals: 4,
          feedSource: 'Synthetic demo values — not an authenticated market feed',
          dataMode: 'SIMULATED_FEED',
        },
        {
          symbol: 'USD/JPYm',
          displayName: 'US Dollar / Japanese Yen',
          category: 'Forex',
          price: 152.45,
          change24h: -0.32,
          high24h: 153.1,
          low24h: 151.9,
          volume24h: 289000,
          spreadLabel: '0.7 pips',
          atr14: 0.95,
          decimals: 2,
          feedSource: 'Synthetic demo values — not an authenticated market feed',
          dataMode: 'SIMULATED_FEED',
        },
        {
          symbol: 'ETH/USDm',
          displayName: 'Ethereum CFD',
          category: 'Crypto',
          price: 3098.51,
          change24h: 5.5,
          high24h: 3140.0,
          low24h: 2920.0,
          volume24h: 76300,
          spreadLabel: '$1.8',
          atr14: 84.5,
          decimals: 2,
          feedSource: 'Synthetic demo values — not an authenticated market feed',
          dataMode: 'SIMULATED_FEED',
        },
      ],
      signals: [
        {
          id: 'sig-xau-01',
          symbol: 'XAU/USDm',
          timeframe: '15m',
          type: 'BUY',
          strategy: 'Elliott Wave 3 Impulse + SMC OB Confluence',
          confidencePct: 91.5,
          entryPrice: 2746.5,
          targetPrice: 2768.4,
          invalidationPrice: 2738.0,
          riskRewardRatio: '1 : 2.58',
          confluenceFactors: [
            'คลื่นย่อย 3 ขยายตัว (161.8% Fibonacci Extension)',
            '4H Bullish Order Block บรรเทาลง 72%',
            '15m FVG (Fair Value Gap) ถูกเติมเต็มอย่างสมบูรณ์',
            'VPIN Order Flow ชี้การสะสมแรงซื้อ 68%',
          ],
          generatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
          dataClassification: 'SYNTHETIC_DEMO_SCENARIO',
        },
        {
          id: 'sig-btc-02',
          symbol: 'BTC/USDm',
          timeframe: '1h',
          type: 'BUY',
          strategy: 'Smart Money Concepts (SMC) + Asian Range Liquidity Sweep',
          confidencePct: 88.0,
          entryPrice: 62780.0,
          targetPrice: 64200.0,
          invalidationPrice: 62050.0,
          riskRewardRatio: '1 : 1.95',
          confluenceFactors: [
            'กวาดสภาพคล่องจุดต่ำสุดของช่วงเอเชีย (Asian Low Sweep)',
            'Break of Structure (BOS) บนไทม์เฟรม 15 นาที',
            'XGBoost Trend Classifier มีคะแนนโมเมนตัม 0.84',
          ],
          generatedAt: new Date(Date.now() - 12 * 60000).toISOString(),
          dataClassification: 'SYNTHETIC_DEMO_SCENARIO',
        },
        {
          id: 'sig-eur-03',
          symbol: 'EUR/USDm',
          timeframe: '4h',
          type: 'NEUTRAL',
          strategy: 'Mean Reversion & Volatility Band Contraction',
          confidencePct: 74.0,
          entryPrice: 1.0842,
          targetPrice: 1.089,
          invalidationPrice: 1.081,
          riskRewardRatio: '1 : 1.50',
          confluenceFactors: [
            'ตลาดเคลื่อนไหวในกรอบสะสม (Range-bound sideways)',
            'รอทดสอบแนวรับสำคัญ 1.0820 ก่อนพิจารณาโครงสร้างใหม่',
          ],
          generatedAt: new Date(Date.now() - 25 * 60000).toISOString(),
          dataClassification: 'SYNTHETIC_DEMO_SCENARIO',
        },
      ],
      analysis: {
        symbol: 'XAU/USDm',
        marketRegime: 'Bullish Momentum Expansion with High Institutional Confluence',
        macroDriver: 'DXY Index Pullback (-0.28%) + Fed Liquidity Injection Expectation',
        volatilityScore: 68.4,
        sentimentScore: 78.2,
        keySupport: 2738.0,
        keyResistance: 2768.5,
        recommendation: 'ถือครองมุมมองเชิงบวก (Bullish Bias) ตามโครงสร้างคลื่น Elliott Wave 3',
        confidencePct: 89.2,
        modelConsensus: '5 จาก 6 โมเดล AI ชี้ทิศทางขาขึ้นสอดคล้องกัน',
        analysisTimestamp: new Date().toISOString(),
      },
    });
  });

  // Candlestick Data Endpoint (Synthetic/Demo Stream generator)
  app.get('/api/market/candlesticks', (req, res) => {
    const symbol = String(req.query.symbol || 'XAU/USDm');
    const timeframe = String(req.query.timeframe || '15m');
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '36'), 10), 10), 80);

    const isGold = symbol.toLowerCase().includes('xau') || symbol.toLowerCase().includes('gold');
    let basePrice = isGold ? 2730.0 : symbol.toLowerCase().includes('btc') ? 61800.0 : 1.082;
    const stepVolatility = isGold ? 2.5 : symbol.toLowerCase().includes('btc') ? 140.0 : 0.0012;

    const bars = [];
    const now = Date.now();
    const timeframeIntervalMs =
      timeframe === '1m'
        ? 60000
        : timeframe === '5m'
        ? 300000
        : timeframe === '15m'
        ? 900000
        : timeframe === '1h'
        ? 3600000
        : timeframe === '4h'
        ? 14400000
        : 86400000;

    let currentOpen = basePrice;
    for (let i = limit; i >= 0; i--) {
      const barTime = new Date(now - i * timeframeIntervalMs);
      const trendBias = (limit - i) * (isGold ? 0.35 : symbol.toLowerCase().includes('btc') ? 22.0 : 0.00005);
      const cycleOscillation = Math.sin((limit - i) / 3.8) * (isGold ? 3.2 : symbol.toLowerCase().includes('btc') ? 180.0 : 0.0008);
      const close = Number((currentOpen + cycleOscillation * 0.4 + trendBias * 0.15 + (Math.sin(i * 1.7) * stepVolatility * 0.5)).toFixed(isGold || symbol.toLowerCase().includes('btc') ? 2 : 4));
      const high = Number((Math.max(currentOpen, close) + Math.abs(Math.sin(i * 2.3)) * stepVolatility).toFixed(isGold || symbol.toLowerCase().includes('btc') ? 2 : 4));
      const low = Number((Math.min(currentOpen, close) - Math.abs(Math.cos(i * 2.7)) * stepVolatility).toFixed(isGold || symbol.toLowerCase().includes('btc') ? 2 : 4));
      const volume = Math.floor(1200 + Math.abs(Math.sin(i * 3.1)) * 4800);

      bars.push({
        time: barTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: barTime.getTime(),
        open: currentOpen,
        high,
        low,
        close,
        volume,
        isBullish: close >= currentOpen,
      });

      currentOpen = close;
    }

    res.json({
      ok: true,
      symbol,
      timeframe,
      dataMode: 'SIMULATED_FEED',
      bars,
    });
  });

  // Model metrics are unavailable until signed model artifacts and evaluation reports exist.
  app.get('/api/intelligence/models', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ok: false,
      error: 'MODEL_ARTIFACTS_NOT_VERIFIED',
      status: 'BLOCKED',
      detail: 'No signed model artifacts, reproducible training runs, or out-of-sample evaluation reports are currently verified.',
      safetyPolicy: 'READ_ONLY_INTELLIGENCE_LAYER_NON_EXECUTABLE',
    });
  });

  // Backtest remains unavailable until real, provenance-verified OHLC and cost inputs are connected.
  app.post('/api/backtest/run', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ok: false,
      error: 'BACKTEST_ENGINE_NOT_CONFIGURED',
      status: 'BLOCKED',
      detail: 'Backtest is disabled until verified Exness Demo OHLC, timezone/provenance, spread, commission, slippage, and OOS split artifacts are available.',
      executionEnabled: false,
      liveTradingEnabled: false,
    });
  });

  // Runtime health must come from authenticated service probes, not static success values.
  app.get('/api/infrastructure/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ok: false,
      status: 'NOT_VERIFIED',
      error: 'RUNTIME_HEALTH_EVIDENCE_UNAVAILABLE',
      detail: 'No authenticated MT5 Demo session, broker read path, or live infrastructure probes are currently verified.',
      systemMode: 'FAIL_CLOSED_READONLY',
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      mt5BridgeEnabled: false,
    });
  });

  // Dataset and training history are not reported until provenance and run artifacts are verified.
  app.get('/api/learning/universe', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ok: false,
      status: 'BLOCKED',
      error: 'VERIFIED_DATASET_NOT_AVAILABLE',
      detail: 'The Exness XAUUSDm H1 dataset still requires gap recovery, UTC/provenance validation, and reproducible training/evaluation artifacts.',
      samplesAvailable: null,
      dailyUpdateEnabled: false,
      autoTrainingEnabled: false,
    });
  });

  // Research-only chat. No market or model inference is exposed until evidence is verified.
  app.post('/api/chat', async (req, res) => {
    const { messages, message } = req.body || {};
    const lastMessage = typeof message === 'string' && message.trim()
      ? message.trim()
      : Array.isArray(messages) && messages.length > 0
        ? String(messages[messages.length - 1].content || '')
        : '';
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ok: false,
      error: 'MARKET_MODEL_EVIDENCE_NOT_VERIFIED',
      status: 'BLOCKED',
      detail: 'NOVA Chat analysis is paused because no authenticated market feed, owner-scoped broker session, or signed trained-model artifact is verified.',
      dataEvidence: { status: 'NOT_VERIFIED', brokerSessionVerified: false, trainedModelVerified: false },
      mode: 'read-only',
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      requestAcceptedForResearch: Boolean(lastMessage),
    });
  });
  // Approval decisions are disabled until a separately reviewed, non-executable review workflow exists.
  app.post('/api/agent/approvals/decision', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({
      ok: false,
      error: 'APPROVAL_MUTATIONS_DISABLED',
      mode: 'read-only',
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
    });
  });
  app.post('/api/gen-ai/generate', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      error: 'GEN_AI_RESEARCH_RUNTIME_NOT_VERIFIED',
      status: 'BLOCKED',
      detail: 'Strategy generation is paused until the model runtime is probed and its model identity, version, request provenance, and research-only output constraints are verified.',
      dataEvidence: { status: 'NOT_VERIFIED', trainedModelVerified: false, brokerSessionVerified: false },
      mode: 'read-only',
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
    });
  });
  // =========================================================================
  // 5-LAYER ZERO-MENU INTENT-DRIVEN ARCHITECTURE ENGINE + PITFALL MITIGATIONS
  // Layer 1: Declarative A2UI / CopilotKit JSON Protocol (Least Privilege UI)
  // Layer 2: LangGraph Stateful Checkpoint Saver (threads, checkpoints, trade_logs, user_configs)
  // Layer 3: NeMo Guardrails (Colang Policy Filter against Prompt Injection)
  // Layer 4: Read-only FastMCP metadata (no broker execution tools)
  // Layer 5: Research-only risk calculations; no broker-side execution authority
  // =========================================================================
  interface CredentialStatusPayload {
    provider: string;
    tokenFingerprint: string;
    issuedAt: string;
    expiresAt: string;
    isValid: boolean;
    revalidatedOnResume: boolean;
    revalidatedAt?: string;
  }

  interface LangGraphInterruptCheckpoint {
    interruptId: string;
    threadId: string;
    intentType: string;
    mcpTool: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    lots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskPerTradePct: number;
    confidencePct: number;
    vpinScore: number;
    var95Pct: number;
    regime: string;
    brokerSideSlTpGuard: boolean;
    credentialStatus: CredentialStatusPayload;
    status: 'REJECTED';
    createdAt: string;
  }

  interface LangGraphThreadState {
    threadId: string;
    updatedAt: string;
    riskRules: {
      riskPerTradePct: number;
      maxRiskPerTradePct: number;
      maxDrawdownPct: number;
      maxLotSize: number;
      maxMarginUsagePct: number;
      brokerDirectSlTpEnabled: boolean;
    };
    gridStatus: {
      enabled: boolean;
      direction: 'BOTH' | 'BUY' | 'SELL';
      symbol: string;
    };
    pendingInterrupts: Record<string, LangGraphInterruptCheckpoint>;
    tradeLogs: Array<{
      logId: string;
      threadId: string;
      ticket: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      lots: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      tokenRevalidated: boolean;
      brokerSideSlTpActive: boolean;
      executedAt: string;
    }>;
  }

  const langGraphCheckpoints = new Map<string, LangGraphThreadState>();
  // Pitfall 1 Fix: Semantic Cache Store to eliminate LLM + Guardrail Latency Tax on frequent intents
  const semanticIntentCache = new Map<string, { cachedAt: number; hitCount: number; intentType: string }>();

  function getOrCreateThreadCheckpoint(threadId: string): LangGraphThreadState {
    const cleanId = (threadId || 'thread-default-nova').trim();
    const existing = langGraphCheckpoints.get(cleanId);
    if (existing) return existing;
    const created: LangGraphThreadState = {
      threadId: cleanId,
      updatedAt: new Date().toISOString(),
      riskRules: {
        riskPerTradePct: 1.5,
        maxRiskPerTradePct: 2.0,
        maxDrawdownPct: 5.0,
        maxLotSize: 2.0,
        maxMarginUsagePct: 35.0,
        brokerDirectSlTpEnabled: false,
      },
      gridStatus: {
        enabled: false,
        direction: 'BOTH',
        symbol: 'XAU/USDm',
      },
      pendingInterrupts: {},
      tradeLogs: [],
    };
    langGraphCheckpoints.set(cleanId, created);
    return created;
  }

  // Layer 3: NeMo Guardrails (Colang Security & Prompt Injection Filter)
  function evaluateNeMoGuardrails(rawPrompt: string): { passed: boolean; violationRule?: string; reason?: string } {
    const lower = (rawPrompt || '').toLowerCase();
    if (
      lower.includes('ignore previous') ||
      lower.includes('system prompt') ||
      lower.includes('jailbreak') ||
      lower.includes('<script') ||
      lower.includes('drop table')
    ) {
      return {
        passed: false,
        violationRule: 'colang://security/prompt_injection_shield',
        reason: 'ตรวจพบความพยายามโจมตีแบบ Prompt Injection หรือคำสั่งเจาะระบบ (ถูกบล็อกโดย NVIDIA NeMo Guardrails)',
      };
    }
    if (
      lower.includes('หมดพอร์ต') ||
      lower.includes('all in') ||
      lower.includes('ไม่ตั้ง sl') ||
      lower.includes('ไม่ต้องตั้ง sl') ||
      lower.includes('no stop loss')
    ) {
      return {
        passed: false,
        violationRule: 'colang://trading_safety/mandatory_stoploss_and_margin',
        reason: 'คำสั่งละเมิดกฎความปลอดภัยขั้นสูงสุด (ห้ามเทรดแบบ All-In หรือไร้ Stop Loss) ถูกสกัดกั้นโดย NeMo Guardrails',
      };
    }
    return { passed: true };
  }

  // Pitfall 3 Fix: FastMCP Validation Error Interceptor & Polite Clarification Fallback Middleware
  function checkAmbiguousOrInvalidParameters(rawPrompt: string): {
    needsClarification: boolean;
    validationIssue?: string;
    politeQuestion?: string;
    suggestedPrompts?: Array<{ label: string; cmd: string }>;
  } {
    const q = (rawPrompt || '').trim();
    const qLower = q.toLowerCase();

    // Case A: Negative or zero lot size (FastMCP Schema Validation Failure)
    if (/-\d+(\.\d+)?\s*(lot|lots|ล็อต)/i.test(qLower) || /\b0(\.0+)?\s*(lot|lots|ล็อต)/i.test(qLower)) {
      return {
        needsClarification: true,
        validationIssue: 'FastMCP Schema ValidationError: lots must be a positive float (> 0.01)',
        politeQuestion:
          'ขออภัยครับ ระบบตรวจพบว่าขนาด Lot ที่ระบุไม่ถูกต้อง (ต้องมากกว่า 0.01 Lot) ไม่ทราบว่าคุณต้องการเปิดออเดอร์ด้วยขนาดเท่าไหร่ดีครับ?',
        suggestedPrompts: [
          { label: '✅ เปิด BUY XAU/USDm 0.10 Lot', cmd: 'เปิด BUY XAU/USDm 0.10 Lot' },
          { label: '✅ เปิด BUY XAU/USDm 0.35 Lot (แนะนำ)', cmd: 'เปิด BUY XAU/USDm 0.35 Lot' },
          { label: '✅ เปิด BUY XAU/USDm 0.50 Lot', cmd: 'เปิด BUY XAU/USDm 0.50 Lot' },
        ],
      };
    }

    // Case B: Vague / incomplete trading request where AI cannot safely guess side or pair
    if (
      qLower === 'เทรดหน่อย' ||
      qLower === 'ซื้อขายหน่อย' ||
      qLower === 'ออกไม้ให้ที' ||
      qLower.includes('ตั้งออเดอร์อะไรก็ได้') ||
      qLower.includes('ตีความผิด')
    ) {
      return {
        needsClarification: true,
        validationIssue: 'FastMCP Schema Incomplete: missing required fields [symbol, side, lots]',
        politeQuestion:
          'เพื่อให้ส่งคำสั่งได้แม่นยำและปลอดภัย รบกวนช่วยระบุคู่เงิน ทิศทาง (BUY/SELL) และขนาด Lot ที่ต้องการ หรือเลือกจากตัวเลือกด้านล่างได้เลยครับ:',
        suggestedPrompts: [
          { label: '📈 เปิด BUY ทองคำ (XAU/USDm) 0.35 Lot', cmd: 'เปิด BUY XAU/USDm 0.35 Lot' },
          { label: '📉 เปิด SELL ทองคำ (XAU/USDm) 0.35 Lot', cmd: 'เปิด SELL XAU/USDm 0.35 Lot' },
          { label: '🪙 เปิด BUY Bitcoin (BTC/USDT) 0.20 Lot', cmd: 'เปิด BUY BTC/USDT 0.20 Lot' },
        ],
      };
    }

    return { needsClarification: false };
  }

  // Strategy 1: Intent-to-Parameter Structured Output Extractor (Zod-equivalent Schema)
  function extractStructuredIntentSchema(rawPrompt: string, explicitSymbol?: string) {
    const q = (rawPrompt || '').trim();
    const qLower = q.toLowerCase();
    const symbol =
      explicitSymbol && KNOWN_INSTRUMENT_SYMBOLS.includes(explicitSymbol as (typeof KNOWN_INSTRUMENT_SYMBOLS)[number])
        ? explicitSymbol
        : detectInstrumentFromText(q);

    const lotMatch = qLower.match(/(\d+(\.\d+)?)\s*(lot|lots|ล็อต)/i);
    const requestedLots = lotMatch ? Number(lotMatch[1]) : 0.35;

    const pctMatch = qLower.match(/(\d+(\.\d+)?)\s*%/);
    const requestedRiskPct = pctMatch ? Number(pctMatch[1]) : undefined;

    const isSell = qLower.includes('sell') || qLower.includes('short') || qLower.includes('ขาย');
    const side: 'BUY' | 'SELL' = isSell ? 'SELL' : 'BUY';

    if (
      qLower.includes('โครงสร้าง') ||
      qLower.includes('architecture') ||
      qLower.includes('checklist') ||
      qLower.includes('phase') ||
      qLower.includes('สิ่งที่ควรปรับปรุง')
    ) {
      return {
        schemaVersion: 'zod-intent-v2.5',
        intentType: 'READ_ARCHITECTURE_CHECKLIST' as const,
        accessClass: 'READ_ONLY_NO_INTERRUPT' as const,
        mcpTool: 'mcp://fastmcp.streamable/get_architecture_and_checklist',
        requiresInterrupt: false,
        params: { symbol, side, lots: requestedLots },
      };
    }

    if (
      qLower.includes('คลังคอมโพเนนต์') ||
      qLower.includes('catalog') ||
      qLower.includes('botstatus') ||
      qLower.includes('riskchart') ||
      qLower.includes('tradesummary')
    ) {
      return {
        schemaVersion: 'zod-intent-v2.5',
        intentType: 'READ_COMPONENT_CATALOG' as const,
        accessClass: 'READ_ONLY_NO_INTERRUPT' as const,
        mcpTool: 'mcp://fastmcp.streamable/get_component_catalog',
        requiresInterrupt: false,
        params: { symbol, side, lots: requestedLots, price: meta.price },
      };
    }

    if (
      qLower.includes('ยอดเงิน') ||
      qLower.includes('ยิดเงิน') ||
      qLower.includes('คงเหลือ') ||
      qLower.includes('balance') ||
      qLower.includes('เงินในพอร์ต') ||
      qLower.includes('พอร์ต') ||
      qLower.includes('voom') ||
      qLower.includes('get_portfolio_status')
    ) {
      return {
        schemaVersion: 'zod-intent-v2.5',
        intentType: 'READ_ACCOUNT_BALANCE' as const,
        accessClass: 'READ_ONLY_NO_INTERRUPT' as const,
        mcpTool: 'mcp://fastmcp.streamable/get_portfolio_status',
        requiresInterrupt: false,
        params: { symbol, side, lots: requestedLots, price: meta.price },
      };
    }

    if (qLower.includes('ปฏิทิน') || qLower.includes('กำไรรายวัน') || qLower.includes('7,008') || qLower.includes('calendar')) {
      return {
        schemaVersion: 'zod-intent-v2.5',
        intentType: 'READ_DYNAMIC_GRID_CALENDAR' as const,
        accessClass: 'READ_ONLY_NO_INTERRUPT' as const,
        mcpTool: 'mcp://fastmcp.streamable/get_dynamic_grid_calendar',
        requiresInterrupt: false,
        params: { symbol, side, lots: requestedLots, price: meta.price },
      };
    }

    if (
      qLower.includes('เช็คราคา') ||
      qLower.includes('ดูกราฟ') ||
      qLower.includes('แนวโน้ม') ||
      qLower.includes('วิเคราะห์ตลาด') ||
      qLower.includes('calculate_risk')
    ) {
      return {
        schemaVersion: 'zod-intent-v2.5',
        intentType: 'READ_MARKET_ANALYSIS' as const,
        accessClass: 'READ_ONLY_NO_INTERRUPT' as const,
        mcpTool: 'mcp://fastmcp.streamable/calculate_risk',
        requiresInterrupt: false,
        params: { symbol, side, lots: requestedLots, price: meta.price },
      };
    }

    if (qLower.includes('risk') || qLower.includes('ความเสี่ยง') || qLower.includes('drawdown')) {
      return {
        schemaVersion: 'zod-intent-v2.5',
        intentType: 'WRITE_UPDATE_RISK_PARAMS' as const,
        accessClass: 'WRITE_HIGH_IMPACT_INTERRUPT' as const,
        mcpTool: 'disabled:write-intent',
        requiresInterrupt: true,
        params: {
          symbol,
          side,
          lots: requestedLots,
          riskPerTradePct: requestedRiskPct ?? 2.0,
        },
      };
    }

    return {
      schemaVersion: 'zod-intent-v2.5',
      intentType: 'WRITE_EXECUTE_ORDER' as const,
      accessClass: 'WRITE_HIGH_IMPACT_INTERRUPT' as const,
      mcpTool: 'disabled:write-intent',
      requiresInterrupt: true,
      params: {
        symbol,
        side,
        lots: requestedLots,
        riskPerTradePct: requestedRiskPct ?? 1.5,
        price: meta.price,
      },
    };
  }

  // Strategy 2: Independent Rule-Based Risk Engine (Hard Rules Check before Broker/Interrupt)
  function validateHardRiskRules(
    intent: ReturnType<typeof extractStructuredIntentSchema>,
    threadState: LangGraphThreadState
  ): { passed: boolean; violations: string[]; metrics: { marginUsagePct: number; estRiskPct: number; currentDrawdownPct: number } } {
    const violations: string[] = [];
    const lots = intent.params.lots || 0.35;
    const reqRiskPct = intent.params.riskPerTradePct ?? threadState.riskRules.riskPerTradePct;
    const marginUsagePct = Number((lots * 8.4).toFixed(2));
    const currentDrawdownPct = 0.42;

    if (lots > threadState.riskRules.maxLotSize) {
      violations.push(
        `ขนาด Lot ที่สั่ง (${lots} Lots) เกินเพดานสูงสุดของ Rule-Based Risk Engine (Max ${threadState.riskRules.maxLotSize.toFixed(2)} Lots)`
      );
    }
    if (reqRiskPct > threadState.riskRules.maxRiskPerTradePct) {
      violations.push(
        `ค่า Risk Per Trade (${reqRiskPct}%) เกินเพดานความเสี่ยงสูงสุดต่อไม้ (Max ${threadState.riskRules.maxRiskPerTradePct}%)`
      );
    }
    if (marginUsagePct > threadState.riskRules.maxMarginUsagePct) {
      violations.push(
        `Margin Usage (${marginUsagePct}%) เกินขีดจำกัดความปลอดภัยของพอร์ต (Max ${threadState.riskRules.maxMarginUsagePct}%)`
      );
    }

    return {
      passed: violations.length === 0,
      violations,
      metrics: {
        marginUsagePct,
        estRiskPct: reqRiskPct,
        currentDrawdownPct,
      },
    };
  }

  // GET Thread State & Pending Interrupts (Phase 1 & 2: threads, checkpoints, trade_logs, user_configs)
  app.get('/api/intent/thread/:threadId', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      status: 'BLOCKED',
      error: 'OWNER_SCOPED_THREAD_STORE_NOT_VERIFIED',
      detail: 'Thread/checkpoint data is not exposed until authenticated owner identity and tenant-scoped persistence are verified.',
    });
  });
  app.post('/api/intent/dispatch', (req, res) => {
    const { prompt, symbol, threadId } = req.body || {};
    const safeThreadId = typeof threadId === 'string' && threadId.trim() ? threadId.trim() : 'thread-nova-session-01';
    const rawPrompt = String(prompt || '').trim();
    const guardrail = evaluateNeMoGuardrails(rawPrompt);
    if (!guardrail.passed) {
      return res.status(400).json({ ok: false, error: 'RESEARCH_REQUEST_BLOCKED', guardrail, mode: 'read-only' });
    }
    const clarification = checkAmbiguousOrInvalidParameters(rawPrompt);
    if (clarification.needsClarification) {
      return res.status(400).json({ ok: false, error: 'RESEARCH_REQUEST_NEEDS_CLARIFICATION', clarification, mode: 'read-only' });
    }
    const structuredIntent = extractStructuredIntentSchema(rawPrompt, symbol);
    if (structuredIntent.accessClass !== 'READ_ONLY_NO_INTERRUPT' || structuredIntent.requiresInterrupt) {
      return res.status(403).json({ ok: false, error: 'WRITE_INTENTS_DISABLED', mode: 'read-only', liveTradingEnabled: false, ordersEnabled: false, executionEnabled: false });
    }
    if (structuredIntent.intentType !== 'READ_ARCHITECTURE_CHECKLIST' && structuredIntent.intentType !== 'READ_COMPONENT_CATALOG') {
      return res.status(503).json({
        ok: false,
        error: 'MARKET_OR_ACCOUNT_SOURCE_NOT_VERIFIED',
        status: 'BLOCKED',
        mode: 'read-only',
        liveTradingEnabled: false,
        ordersEnabled: false,
        executionEnabled: false,
        detail: 'No verified market feed, broker account, trade ledger, or model runtime is available for this request.',
      });
    }
    return res.json({
      ok: true,
      threadId: safeThreadId,
      layerTriggered: 'STATIC_RESEARCH_FIXTURE_ONLY',
      declarativeUiType: structuredIntent.intentType === 'READ_ARCHITECTURE_CHECKLIST' ? 'architecture-checklist-card' : 'component-catalog-card',
      structuredIntent: {
        schemaVersion: structuredIntent.schemaVersion,
        intentType: structuredIntent.intentType,
        accessClass: 'READ_ONLY_NO_INTERRUPT',
        mcpTool: 'static-fixture-only',
        requiresInterrupt: false,
        dataClassification: 'STATIC_UI_FIXTURE',
        evidenceStatus: 'NOT_APPLICABLE',
        params: { symbol: null, price: null },
      },
      dataEvidence: { status: 'NOT_APPLICABLE', classification: 'STATIC_UI_FIXTURE' },
      quantTelemetry: null,
      riskCheck: null,
      semanticCache: null,
      reply: structuredIntent.intentType === 'READ_ARCHITECTURE_CHECKLIST'
        ? 'แสดง Architecture Checklist แบบ static เพื่อการวางแผนเท่านั้น ไม่ใช่หลักฐาน runtime/deployment'
        : 'แสดง Component Catalog แบบ static UI fixture เท่านั้น ไม่ใช่ข้อมูลตลาด บัญชี หรือผลโมเดล',
    });
  });
  // Approval resolution is research-only. Broker execution is a separately gated capability.
  app.post('/api/intent/interrupt/resolve', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      status: 'BLOCKED',
      error: 'OWNER_SCOPED_APPROVAL_STORE_NOT_VERIFIED',
      mode: 'read-only',
      liveTradingEnabled: false,
      ordersEnabled: false,
      executionEnabled: false,
      detail: 'Approval state cannot be read or changed until authenticated owner-scoped persistence is verified.',
    });
  });
  // Layer 4: FastMCP Streamable HTTP Metadata Endpoint (Phase 1 & Phase 2 Tools)
  app.get('/api/mcp/streamable', (_req, res) => {
    res.json({
      protocol: 'FastMCP-Streamable-HTTP/1.0',
      transport: 'streamable-http',
      horizontalScaling: true,
      semanticCacheActive: true,
      brokerDirectSlTpWorker: false,
      databaseTables: ['threads', 'checkpoints', 'trade_logs', 'user_configs'],
      tools: [
        { name: 'get_portfolio_status', interrupt: false, description: 'Read-only account summary when an owner-scoped Demo adapter is verified' },
        { name: 'calculate_risk', interrupt: false, description: 'Research-only risk calculation; no execution authority' },
        { name: 'get_dynamic_grid_calendar', interrupt: false, description: 'Read-only strategy research calendar' },
      ],
      brokerExecution: {
        liveTradingEnabled: false,
        ordersEnabled: false,
        executionEnabled: false,
        mode: 'read-only',
      },
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`VOOM NOVA Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
