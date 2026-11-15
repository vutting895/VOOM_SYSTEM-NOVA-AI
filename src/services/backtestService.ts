// Dedicated Backtest Simulation Service for NOVA AI Platform
import { apiClient } from './apiClient';
import { BacktestParams, BacktestResult } from '../api/types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';

export class BacktestService {
  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    const result = await apiClient.post<BacktestResult>('/api/backtest/run', params);

    // Automatically persist backtest result to Firestore if user is authenticated
    try {
      const user = auth.currentUser;
      if (user) {
        const backtestId = `bt-${Date.now()}`;
        const docRef = doc(db, 'users', user.uid, 'backtests', backtestId);
        await setDoc(docRef, {
          id: backtestId,
          userId: user.uid,
          strategyId: params.strategyId,
          symbol: params.symbol,
          timeframe: params.timeframe,
          initialBalance: params.initialBalance,
          finalBalance: result.finalBalance,
          netProfit: result.netProfit,
          winRatePct: result.winRatePct,
          profitFactor: result.profitFactor,
          maxDrawdownPct: result.maxDrawdownPct,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'backtests');
    }

    return result;
  }

  async getSavedBacktests(): Promise<any[]> {
    try {
      const user = auth.currentUser;
      if (!user) return [];
      const q = query(collection(db, 'users', user.uid, 'backtests'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'backtests');
      return [];
    }
  }
}

export const backtestService = new BacktestService();
