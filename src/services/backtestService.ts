// Backtest simulation service with optional owner-scoped Supabase persistence.
import { apiClient } from './apiClient';
import type { BacktestParams, BacktestResult } from '../api/types';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export class BacktestService {
  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    const result = await apiClient.post<BacktestResult>('/api/backtest/run', params);

    // Saving is best-effort: a missing Supabase config/table must not break a read-only simulation.
    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const user = authData.user;
        if (user) {
          const { error } = await supabase.from('nova_backtest_reports').insert({
            user_id: user.id,
            strategy_id: params.strategyId,
            symbol: params.symbol,
            timeframe: params.timeframe,
            historical_period: params.historicalPeriod,
            initial_balance: params.initialBalance,
            final_balance: result.finalBalance,
            net_profit: result.netProfit,
            profit_factor: result.profitFactor,
            win_rate_pct: result.winRatePct,
            max_drawdown_pct: result.maxDrawdownPct,
            result,
          });
          if (error) throw error;
        }
      } catch (error) {
        console.warn('[BacktestService] Result returned but persistence was unavailable.', error);
      }
    }

    return result;
  }

  async getSavedBacktests(): Promise<BacktestResult[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const supabase = getSupabaseClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) return [];

      const { data, error } = await supabase
        .from('nova_backtest_reports')
        .select('result')
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []).map((row) => row.result as BacktestResult);
    } catch (error) {
      console.warn('[BacktestService] Saved reports are unavailable.', error);
      return [];
    }
  }
}

export const backtestService = new BacktestService();
