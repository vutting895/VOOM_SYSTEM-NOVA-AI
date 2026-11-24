import { datacenterResearchService } from './datacenterResearchService';

export class BacktestService {
  async runBacktest(config: {
    dataset_id: string;
    dataset_version: number;
    signal_column: string;
    initial_balance?: number;
    exposure_fraction?: number;
    commission_bps?: number;
    spread_bps?: number;
    slippage_bps?: number;
    max_holding_bars?: number;
    allow_short?: boolean;
  }) {
    return datacenterResearchService.runBacktest(config);
  }

  async getSavedBacktests() {
    return datacenterResearchService.listResearchRuns('backtest');
  }

  async getWalkForwardRuns() {
    return datacenterResearchService.listResearchRuns('walk_forward');
  }
}

export const backtestService = new BacktestService();
