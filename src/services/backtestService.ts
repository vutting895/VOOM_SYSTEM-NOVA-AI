// Dedicated Backtest Simulation Service for NOVA AI Platform
import { apiClient } from './apiClient';
import { BacktestParams, BacktestResult } from '../api/types';

export class BacktestService {
  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    return apiClient.post<BacktestResult>('/api/backtest/run', params);
  }
}

export const backtestService = new BacktestService();
