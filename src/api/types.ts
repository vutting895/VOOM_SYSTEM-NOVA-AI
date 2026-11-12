// NOVA AI - Frontend Types & API Contracts (Read-Only / Demo Architecture)

export type DataFeedMode = 'HISTORICAL' | 'DEMO_READONLY' | 'SIMULATED_FEED' | 'LIVE_STREAM_READONLY';

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
  status: 'ACTIVE' | 'TRAINED' | 'CONVERGED' | 'CONTINUOUS_ADAPTATION' | 'READY' | 'RESEARCH_ONLY' | 'NOT_VALIDATED' | 'DISABLED';
  accuracyPct: number | null;
  latencyMs: number | null;
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
  marketRegimeDetected: string;
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
  systemMode: 'FAIL_CLOSED_READONLY';
  liveTradingEnabled: false;
  mt5BridgeEnabled: false;
  mt5Connection: {
    status: 'STANDBY_DEMO_READY' | 'CONNECTED_DEMO' | 'OFFLINE';
    target: string;
    server: string;
    latencyMs: number;
    accountClass: 'Exness Demo (Read-Only)';
    credentialsSecured: boolean;
    orderExecutionBlocked: boolean;
  };
  brokerConnector: {
    selectedBroker: string;
    protocol: string;
    supportedBrokers: string[];
    directApiAvailable: boolean;
  };
  riskEngine: {
    status: 'HARD_RULES_ENFORCED';
    maxDrawdownCapPct: number;
    maxLotSizeLimit: number;
    maxMarginUsageLimitPct: number;
    maxRiskPerTradeLimitPct: number;
    failClosedGuardActive: boolean;
    realMoneyWritesDisabled: boolean;
  };
  dataPipeline: {
    status: 'OPTIMAL';
    tickIngestionRatePerSec: number;
    redisBufferHitRatePct: number;
    featureStoreLatencyMs: number;
    schemaValidationPassPct: number;
  };
  modelTrainingStatus: {
    status: 'SYNCED_READY' | 'INGESTING_AND_TRAINING';
    epoch: number;
    activePair: string;
    samplesIngested: number;
    lastValidationAccPct: number;
    lastTrainedAt: string;
  };
}

export interface LearningUniverseResponse {
  ok: boolean;
  featureStore: {
    provider: string;
    monitoredSymbols: string[];
    totalSamplesStored: number;
    featureCategories: string[];
    lastDataUpdateAt: string;
    dailyUpdateStatus: 'SUCCESS_SYNCED' | 'IN_PROGRESS' | 'SCHEDULED';
    nextScheduledUpdateAt: string;
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
