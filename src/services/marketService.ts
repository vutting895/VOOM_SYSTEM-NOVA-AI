// Dedicated Market Data Service for NOVA AI Platform
import { apiClient } from './apiClient';
import { MarketOverviewResponse, CandlestickBar, MarketAssetQuote } from '../api/types';

export interface CandlesticksResponse {
  ok: boolean;
  symbol: string;
  timeframe: string;
  dataMode: string;
  bars: CandlestickBar[];
}

export interface BrokerInstrumentsResponse {
  brokerName: string;
  serverLabel: string;
  accountId: string;
  protocol: string;
  instruments: Array<{
    symbol: string;
    displayName: string;
    group: 'Metals & Commodities' | 'Forex Majors' | 'Crypto Majors';
    price: number;
    decimals: number;
    spreadLabel: string;
    change24h: number;
  }>;
}

export class MarketService {
  async getMarketOverview(): Promise<MarketOverviewResponse> {
    return apiClient.get<MarketOverviewResponse>('/api/market/overview');
  }

  async getCandlesticks(
    symbol: string = 'XAU/USDm',
    timeframe: string = '15m',
    limit: number = 36
  ): Promise<CandlesticksResponse> {
    const params = new URLSearchParams({
      symbol,
      timeframe,
      limit: String(limit),
    });
    return apiClient.get<CandlesticksResponse>(`/api/market/candlesticks?${params.toString()}`);
  }

  async getBrokerInstruments(
    broker: string = 'exness',
    accountId?: string,
    connectionMode: string = 'api',
    mt5Server?: string
  ): Promise<BrokerInstrumentsResponse> {
    const params = new URLSearchParams({
      broker,
      connectionMode,
      ...(accountId ? { accountId } : {}),
      ...(mt5Server ? { mt5Server } : {}),
    });
    return apiClient.get<BrokerInstrumentsResponse>(`/api/broker/instruments?${params.toString()}`);
  }

  async getBrokerStatus(): Promise<any> {
    return apiClient.get('/api/broker/status');
  }
}

export const marketService = new MarketService();
