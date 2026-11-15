// Dedicated AI Models & Intelligence Data Service for NOVA AI Platform
import { apiClient } from './apiClient';
import { IntelligenceResponse, LearningUniverseResponse, InfrastructureHealthResponse } from '../api/types';

export class ModelService {
  async getIntelligenceModels(): Promise<IntelligenceResponse> {
    return apiClient.get<IntelligenceResponse>('/api/intelligence/models');
  }

  async getLearningUniverse(): Promise<LearningUniverseResponse> {
    return apiClient.get<LearningUniverseResponse>('/api/learning/universe');
  }

  async getInfrastructureHealth(): Promise<InfrastructureHealthResponse> {
    return apiClient.get<InfrastructureHealthResponse>('/api/infrastructure/health');
  }

  async getAutoTrainStatus(): Promise<any> {
    return apiClient.get('/api/auto-train/status');
  }

  async triggerAutoTrain(symbol: string): Promise<any> {
    return apiClient.post('/api/auto-train/trigger', { symbol });
  }

  async getKaggleMcpStatus(): Promise<any> {
    return apiClient.get('/api/mcp/kaggle/status');
  }

  async searchKaggleNotebooks(query: string = 'Forex SMC'): Promise<any> {
    return apiClient.post('/api/mcp/kaggle/search', { query });
  }

  async triggerKaggleSession(slug: string, machineShape: string = 'NVIDIA T4 x2 Dual GPU'): Promise<any> {
    return apiClient.post('/api/mcp/kaggle/session/trigger', {
      slug,
      machine_shape: machineShape,
    });
  }
}

export const modelService = new ModelService();
