import { callNovaMcpTool } from '../api/mcpClient';

export interface DatacenterDataset {
  dataset_id: string;
  version: number;
  name: string;
  manifest: {
    symbols?: string[];
    timeframe?: string;
    schema?: Record<string, string>;
    coverage_start?: string;
    coverage_end?: string;
  };
  status: string;
  approval_status: string;
  row_count: number;
  checksum?: string;
  created_at: string;
}

export interface DatacenterUniverse {
  universe_id: string;
  name: string;
  version: number;
  definition: {
    datasets?: Array<{ dataset_id: string; version: number }>;
    feature_columns?: string[];
    label_column?: string;
    task_type?: string;
  };
  status: string;
  created_at: string;
}

export interface DatacenterModel {
  model_id: string;
  name: string;
  version: number;
  model_family: string;
  task_type: string;
  metrics: Record<string, number>;
  gates: Record<string, boolean>;
  approval_status: string;
  deployment_eligible: boolean;
  created_at: string;
}

export interface ResearchRun {
  run_id: string;
  run_type: 'backtest' | 'walk_forward';
  dataset_id: string;
  dataset_version: number;
  status: string;
  config: Record<string, unknown>;
  result: Record<string, any>;
  created_at: string;
}

export class DatacenterResearchService {
  async listDatasets(): Promise<DatacenterDataset[]> {
    const response = await callNovaMcpTool<{ status: string; datasets: DatacenterDataset[] }>(
      'dataset_list', { limit: 200 },
    );
    return response.datasets || [];
  }

  async listApprovedDatasets(): Promise<DatacenterDataset[]> {
    const datasets = await this.listDatasets();
    return datasets.filter((dataset) => dataset.status === 'PASSED' && dataset.approval_status === 'approved');
  }

  async listUniverses(): Promise<DatacenterUniverse[]> {
    const response = await callNovaMcpTool<{ status: string; universes: DatacenterUniverse[] }>(
      'universe_list', { limit: 200 },
    );
    return response.universes || [];
  }

  async submitTraining(manifest: Record<string, unknown>): Promise<Record<string, any>> {
    return callNovaMcpTool<Record<string, any>>('learning_submit', { manifest });
  }

  async getTrainingStatus(jobId: string): Promise<Record<string, any>> {
    return callNovaMcpTool<Record<string, any>>('learning_status', { job_id: jobId });
  }

  async getTrainingLogs(jobId: string, limit = 100): Promise<Record<string, any>> {
    return callNovaMcpTool<Record<string, any>>('learning_logs', { job_id: jobId, limit });
  }

  async listModels(): Promise<DatacenterModel[]> {
    const response = await callNovaMcpTool<{ status: string; models: DatacenterModel[] }>(
      'model_list', { limit: 200 },
    );
    return response.models || [];
  }

  async listResearchRuns(runType?: 'backtest' | 'walk_forward'): Promise<ResearchRun[]> {
    const response = await callNovaMcpTool<{ status: string; runs: ResearchRun[] }>(
      'research_run_list', { limit: 100, ...(runType ? { run_type: runType } : {}) },
    );
    return response.runs || [];
  }

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
  }): Promise<ResearchRun> {
    return callNovaMcpTool<ResearchRun>('backtest_run', { config });
  }

  async runWalkForward(config: {
    dataset_id: string;
    dataset_version: number;
    signal_column: string;
    train_window_bars: number;
    test_window_bars: number;
    step_bars: number;
    purge_gap_bars: number;
    initial_balance?: number;
    exposure_fraction?: number;
    commission_bps?: number;
    spread_bps?: number;
    slippage_bps?: number;
    max_holding_bars?: number;
    allow_short?: boolean;
  }): Promise<ResearchRun> {
    return callNovaMcpTool<ResearchRun>('walk_forward_replay', { config });
  }
}

export const datacenterResearchService = new DatacenterResearchService();
