// Centralized Axios API Client for NOVA AI Platform
// Includes request/response interceptors for auth handling, error logging, and response transformation

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

export interface ApplicationApiError {
  message: string;
  statusCode: number;
  code?: string;
  details?: any;
  timestamp: string;
}

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

class ApiClientService {
  private axiosInstance: AxiosInstance;
  private listeners: LatencyListener[] = [];
  private metricsHistory: ApiMetricRecord[] = [];

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: '',
      timeout: 12000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.setupInterceptors();
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
        // Suppress subscriber errors
      }
    });
  }

  private setupInterceptors() {
    // 1. Request Interceptor (Auth handling & Latency Tracking)
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Attach request start time for latency benchmarking
        (config as any).metadata = { startTime: performance.now() };

        // Auth token injection (if session token is stored in localStorage / sessionStorage)
        try {
          const token =
            localStorage.getItem('nova_auth_token') ||
            localStorage.getItem('sb-access-token');
          if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch {
          // Ignore storage access errors in restricted browser contexts
        }

        return config;
      },
      (error: AxiosError) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // 2. Response Interceptor (Latency Logging, Response Transformation & Uniform Error Handling)
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        const startTime = (response.config as any)?.metadata?.startTime || performance.now();
        const durationMs = Number((performance.now() - startTime).toFixed(1));
        const url = response.config.url || '';
        const method = (response.config.method || 'GET').toUpperCase();

        this.notifyListeners({
          id: `m-${Math.random().toString(36).substring(2, 11)}`,
          url,
          method,
          startTime,
          durationMs,
          status: 'SUCCESS',
          statusCode: response.status,
          timestamp: new Date().toLocaleTimeString(),
        });

        // Response transformation: return data payload directly
        return response.data;
      },
      (error: AxiosError) => {
        const config = error.config as any;
        const startTime = config?.metadata?.startTime || performance.now();
        const durationMs = Number((performance.now() - startTime).toFixed(1));
        const url = config?.url || '';
        const method = (config?.method || 'GET').toUpperCase();
        const statusCode = error.response?.status || 500;

        this.notifyListeners({
          id: `m-${Math.random().toString(36).substring(2, 11)}`,
          url,
          method,
          startTime,
          durationMs,
          status: 'ERROR',
          statusCode,
          timestamp: new Date().toLocaleTimeString(),
        });

        // Error transformation & structured logging
        const responseData = error.response?.data as any;
        const formattedError: ApplicationApiError = {
          message:
            responseData?.error ||
            responseData?.message ||
            error.message ||
            `HTTP ${statusCode} Request Failed`,
          statusCode,
          code: responseData?.code || error.code || 'API_ERROR',
          details: responseData?.detail || responseData?.details || null,
          timestamp: new Date().toISOString(),
        };

        console.error(`[API Interceptor Error] ${method} ${url} (${statusCode}):`, formattedError);

        return Promise.reject(formattedError);
      }
    );
  }

  public async getAggregateProfitConnections<T>(): Promise<T> {
    return this.get<T>('/api/nova/aggregate-profit/connections');
  }

  public async getAggregateProfitTarget<T>(brokerConnectionId: string): Promise<T> {
    const query = new URLSearchParams({ brokerConnectionId });
    return this.get<T>(`/api/nova/aggregate-profit/target?${query.toString()}`);
  }

  public async setAggregateProfitTarget<T>(input: {
    brokerConnectionId: string;
    targetUsd: string;
    reason?: string;
  }): Promise<T> {
    return this.post<T>('/api/nova/aggregate-profit/target', input);
  }

  // Generic Request Methods
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return (await this.axiosInstance.get<T, T>(url, config)) as T;
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return (await this.axiosInstance.post<T, T>(url, data, config)) as T;
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return (await this.axiosInstance.put<T, T>(url, data, config)) as T;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return (await this.axiosInstance.delete<T, T>(url, config)) as T;
  }

  public getRawAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

export const apiClient = new ApiClientService();
