// Unified API Client for NOVA AI Frontend

import {
  MarketOverviewResponse,
  CandlestickBar,
  IntelligenceResponse,
  BacktestParams,
  BacktestResult,
  InfrastructureHealthResponse,
  LearningUniverseResponse,
} from './types';

class NovaApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '';
  }

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

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

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
      }

      return (await response.json()) as T;
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

  // Auto-Train trigger
  async triggerAutoTrain(symbol: string): Promise<any> {
    return this.fetchJson('/api/auto-train/trigger', {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    });
  }
}

export const novaApi = new NovaApiClient();
