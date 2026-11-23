// Unified API Client for NOVA AI Frontend with Performance & Latency Instrumentation

import {
  MarketOverviewResponse,
  CandlestickBar,
  IntelligenceResponse,
  BacktestParams,
  BacktestResult,
  InfrastructureHealthResponse,
  LearningUniverseResponse,
} from './types';

export interface ApiMetricRecord {
  id: string;
  url: string;
  method: string;
  startTime: number;
  durationMs: number;
  status: 'SUCCESS' | 'ERROR';
  statusCode: number;
  timestamp: string;
}

type LatencyListener = (metric: ApiMetricRecord) => void;

class NovaApiClient {
  private baseUrl: string;
  private listeners: LatencyListener[] = [];
  private metricsHistory: ApiMetricRecord[] = [];

  constructor() {
    this.baseUrl = '';
  }

  public subscribeMetrics(listener: LatencyListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getMetricsHistory(): ApiMetricRecord[] {
    return [...this.metricsHistory];
  }

  private notifyListeners(metric: ApiMetricRecord) {
    this.metricsHistory.unshift(metric);
    if (this.metricsHistory.length > 50) {
      this.metricsHistory.pop();
    }
    this.listeners.forEach((listener) => {
      try {
        listener(metric);
      } catch {
        // Ignore subscriber errors
      }
    });
  }

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const startTime = performance.now();
    const method = options?.method || 'GET';
    let statusCode = 200;

    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...options?.headers,
        },
      });

      statusCode = response.status;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorMessage = response.statusText;
        try {
          const parsed = JSON.parse(errorBody);
          if (typeof parsed.message === 'string' && parsed.message.trim()) {
            errorMessage = parsed.message;
          }
        } catch {
          if (errorBody) errorMessage = errorBody;
        }
        throw new Error(`HTTP ${response.status}: ${errorMessage || 'Request failed'}`);
      }

      const data = (await response.json()) as T;
      const durationMs = Number((performance.now() - startTime).toFixed(1));

      this.notifyListeners({
        id: `m-${Math.random().toString(36).substr(2, 9)}`,
        url,
        method,
        startTime,
        durationMs,
        status: 'SUCCESS',
        statusCode,
        timestamp: new Date().toLocaleTimeString(),
      });

      return data;
    } catch (err) {
      const durationMs = Number((performance.now() - startTime).toFixed(1));
      this.notifyListeners({
        id: `m-${Math.random().toString(36).substr(2, 9)}`,
        url,
        method,
        startTime,
        durationMs,
        status: 'ERROR',
        statusCode: statusCode || 500,
        timestamp: new Date().toLocaleTimeString(),
      });
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 1. Market Overview & Candlestick Feed
  async getMarketOverview(): Promise<MarketOverviewResponse> {
    return this.fetchJson<MarketOverviewResponse>('/api/market/overview');
  }

  async getCandlesticks(
    symbol: string = 'XAU/USDm',
    timeframe: string = '15m',
    limit: number = 36
  ): Promise<{ ok: boolean; symbol: string; timeframe: string; dataMode: string; bars: CandlestickBar[] }> {
    const query = new URLSearchParams({
      symbol,
      timeframe,
      limit: String(limit),
    });
    return this.fetchJson(`/api/market/candlesticks?${query.toString()}`);
  }

  // 2. Trading Intelligence & AI Models
  async getIntelligenceModels(): Promise<IntelligenceResponse> {
    return this.fetchJson<IntelligenceResponse>('/api/intelligence/models');
  }

  // 3. Backtest Simulation Engine
  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    return this.fetchJson<BacktestResult>('/api/backtest/run', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 4. Trading Infrastructure & Health
  async getInfrastructureHealth(): Promise<InfrastructureHealthResponse> {
    return this.fetchJson<InfrastructureHealthResponse>('/api/infrastructure/health');
  }

  // 5. Learning Universe & Dataset Management
  async getLearningUniverse(): Promise<LearningUniverseResponse> {
    return this.fetchJson<LearningUniverseResponse>('/api/learning/universe');
  }

  // 6. Broker Status & Catalog Services
  async getBrokerStatus(): Promise<any> {
    return this.fetchJson('/api/broker/status');
  }

  async getBrokerInstruments(
    broker: string = 'exness',
    accountId?: string,
    connectionMode: string = 'api',
    mt5Server?: string
  ): Promise<any> {
    const query = new URLSearchParams({
      broker,
      connectionMode,
      ...(accountId ? { accountId } : {}),
      ...(mt5Server ? { mt5Server } : {}),
    });
    return this.fetchJson(`/api/broker/instruments?${query.toString()}`);
  }

  // 7. Backend Auto-Train Status & Controls
  async getAutoTrainStatus(): Promise<any> {
    return this.fetchJson('/api/auto-train/status');
  }

  async triggerAutoTrain(symbol: string): Promise<any> {
    return this.fetchJson('/api/auto-train/trigger', {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    });
  }

  // 8. NOVA Chat AI & Hybrid Brain
  async sendChatMessage(message: string, symbol?: string, messages?: any[]): Promise<any> {
    return this.fetchJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, symbol, messages }),
    });
  }

  // 9. Quantum Engine & Simulation
  async simulateQuantum(symbol: string = 'XAUUSD', timeframe: string = 'H1'): Promise<any> {
    return this.fetchJson('/api/quantum/simulate', {
      method: 'POST',
      body: JSON.stringify({ symbol, timeframe }),
    });
  }

  async getQuantumSource(): Promise<any> {
    return this.fetchJson('/api/quantum/source');
  }

  // 10. Kaggle MCP Compute & Notebook Tools
  async getKaggleMcpStatus(): Promise<any> {
    return this.fetchJson('/api/mcp/kaggle/status');
  }

  async searchKaggleNotebooks(query: string = 'Forex SMC'): Promise<any> {
    return this.fetchJson('/api/mcp/kaggle/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async triggerKaggleSession(slug: string, machineShape: string = 'NVIDIA T4 x2 Dual GPU'): Promise<any> {
    return this.fetchJson('/api/mcp/kaggle/session/trigger', {
      method: 'POST',
      body: JSON.stringify({ slug, machine_shape: machineShape }),
    });
  }

  // 11. Live Trading & Read-Only Invariants
  async getLiveTradingStatus(): Promise<any> {
    return this.fetchJson('/api/live-trading/status');
  }
}

export const novaApi = new NovaApiClient();
