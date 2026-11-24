import { datacenterResearchService } from './datacenterResearchService';

export class ModelService {
  async getIntelligenceModels() {
    return datacenterResearchService.listModels();
  }

  async getLearningUniverse() {
    return datacenterResearchService.listUniverses();
  }

  async getDatasets() {
    return datacenterResearchService.listDatasets();
  }

  async submitTraining(manifest: Record<string, unknown>) {
    return datacenterResearchService.submitTraining(manifest);
  }

  async getTrainingStatus(jobId: string) {
    return datacenterResearchService.getTrainingStatus(jobId);
  }

  async getTrainingLogs(jobId: string) {
    return datacenterResearchService.getTrainingLogs(jobId);
  }
}

export const modelService = new ModelService();
