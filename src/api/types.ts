// NOVA AI - Frontend Types & API Contracts (Read-Only / Demo Architecture)

export type DataFeedMode = 'HISTORICAL' | 'DEMO_READONLY' | 'SIMULATED_FEED' | 'LIVE_STREAM_READONLY' | 'STATIC_SAMPLE_UNVERIFIED' | 'SIMULATED_SAMPLE_UNVERIFIED';

export interface MarketAssetQuote {
  symbol: string;
  displayName: string;
  category: 'Metals' | 'Forex' | 'Crypto';
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  spreadLabel: string;
  atr14: number;
  decimals: number;
  feedSource: string;
  dataMode: DataFeedMode;
}

export interface CandlestickBar {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isBullish: boolean;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  timeframe: string;
  type: 'BUY' | 'SELL' | 'NEUTRAL';
  strategy: string;
  confidencePct: number;
  entryPrice: number;
  targetPrice: number;
  invalidationPrice: number;
  riskRewardRatio: string;
  confluenceFactors: string[];
  generatedAt: string;
  dataClassification: 'HISTORICAL_SIGNAL' | 'DEMO_READONLY_SIGNAL';
}

export interface AIMarketAnalysis {
  symbol: string;
  marketRegime: string;
  macroDriver: string;
  volatilityScore: number;
  sentimentScore: number;
  keySupport: number;
  keyResistance: number;
  recommendation: string;
  confidencePct: number;
  modelConsensus: string;
  analysisTimestamp: string;
}

export interface MarketOverviewResponse {
  ok: boolean;
  timestamp: string;
  safetyNotice: string;
  dataMode: DataFeedMode;
  assets: MarketAssetQuote[];
  signals: TradingSignal[];
  analysis: AIMarketAnalysis;
}

export interface IntelligenceModelStatus {
  id: string;
  name: string;
  tag: string;
  status: 'ACTIVE' | 'TRAINED' | 'CONVERGED' | 'CONTINUOUS_ADAPTATION' | 'READY';
  accuracyPct: number;
  latencyMs: number;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  details: Record<string, any>;
  highlights: string[];
  accentColor: 'amber' | 'emerald' | 'cyan' | 'purple' | 'indigo' | 'blue';
}

export interface IntelligenceResponse {
  ok: boolean;
  engineArchitecture: string;
  models: IntelligenceModelStatus[];
  ensembleConfidencePct: number | null;
  marketRegimeDetected: string | null;
  safetyPolicy: string;
}

export interface BacktestParams {
  strategyId: string;
  symbol: string;
  timeframe: '5m' | '15m' | '1h' | '4h' | '1D';
  historicalPeriod: '3M' | '6M' | '1Y' | '2Y' | 'All';
  initialBalance: number;
  riskPerTradePct: number;
}

export interface EquityDataPoint {
  date: string;
  equity: number;
  drawdownPct: number;
  benchmarkEquity: number;
}

export interface BacktestTradeRecord {
  id: string;
  timestamp: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  returnPct: number;
  holdTime: string;
  reason: string;
}

export interface BacktestResult {
  ok: boolean;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  netProfitPct: number;
  profitFactor: number;
  winRatePct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgTradeDuration: string;
  inSampleResults: {
    datasetPct: number;
    winRatePct: number;
    profitFactor: number;
    maxDrawdownPct: number;
    trades: number;
  };
  outOfSampleResults: {
    datasetPct: number;
    winRatePct: number;
    profitFactor: number;
    maxDrawdownPct: number;
    trades: number;
    generalizationScorePct: number;
  };
  equityCurve: EquityDataPoint[];
  recentTrades: BacktestTradeRecord[];
  dataNotice: string;
}

export interface InfrastructureHealthResponse {
  ok: boolean;
  timestamp: string;
  dataSource: 'LOCAL_API_CONFIGURATION_ONLY';
  systemMode: 'FAIL_CLOSED_READONLY';
  liveTradingEnabled: false;
  ordersEnabled: false;
  executionEnabled: false;
  mt5BridgeEnabled: false;
  mt5Connection: {
    status: 'NOT_CONNECTED' | 'CONNECTED_DEMO' | 'OFFLINE';
    target: string;
    server: string | null;
    latencyMs: number | null;
    accountClass: string | null;
    credentialsSecured: boolean | null;
    orderExecutionBlocked: boolean;
  };
  brokerConnector: {
    selectedBroker: string;
    protocol: string;
    supportedBrokers: string[];
    directApiAvailable: boolean;
  };
  riskEngine: {
    status: 'FAIL_CLOSED_NOT_ENFORCED';
    maxDrawdownCapPct: number | null;
    maxLotSizeLimit: number | null;
    maxMarginUsageLimitPct: number | null;
    maxRiskPerTradeLimitPct: number;
    maxOpenRiskPct: number;
    dailyLossLimitPct: number;
    policyConfigured: boolean;
    policyEnforced: boolean;
    failClosedGuardActive: boolean;
    realMoneyWritesDisabled: boolean;
  };
  dataPipeline: {
    status: 'NOT_CONFIGURED';
    tickIngestionRatePerSec: number | null;
    redisBufferHitRatePct: number | null;
    featureStoreLatencyMs: number | null;
    schemaValidationPassPct: number | null;
  };
  modelTrainingStatus: {
    status: 'NOT_CONNECTED';
    epoch: number | null;
    activePair: string | null;
    samplesIngested: number | null;
    lastValidationAccPct: number | null;
    lastTrainedAt: string | null;
  };
}

export interface LearningUniverseResponse {
  ok: boolean;
  featureStore: {
    provider: string;
    monitoredSymbols: string[];
    totalSamplesStored: number;
    featureCategories: string[];
    lastDataUpdateAt: string | null;
    dailyUpdateStatus: 'SUCCESS_SYNCED' | 'IN_PROGRESS' | 'SCHEDULED' | 'NOT_CONFIGURED';
    nextScheduledUpdateAt: string | null;
  };
  modelPerformanceByRegime: Array<{
    regimeName: string;
    description: string;
    accuracyPct: number;
    f1Score: number;
    sampleCount: number;
  }>;
  trainingHistory: Array<{
    id: string;
    timestamp: string;
    pair: string;
    epoch: number;
    trainingLoss: number;
    validationAccuracyPct: number;
    durationSec: number;
    status: 'COMPLETED' | 'CHECKPOINTED';
  }>;
  autoUpdateJob: {
    cadence: string;
    automated: boolean;
    healthPct: number;
    logs: string[];
  };
}

[executed on device: 10_0_16_116 (1b921001-c4e2-479a-8a95-7345393686dd)]