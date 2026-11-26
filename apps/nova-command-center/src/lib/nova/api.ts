import { config } from "./config";
import { assertReadOnlyRequest, assertQuantLabRequest } from "./safety";

export type ApiErrorKind =
  | "not_configured"
  | "unauthenticated"
  | "forbidden"
  | "timeout"
  | "network"
  | "http"
  | "parse"
  | "blocked";

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  version: string;
  time: string;
  liveTrading: false;
  brokerWrites: false;
}


export interface QuantLabJobRequest {
  job_type: "dataset.validate" | "backtest" | "train" | "evaluate";
  resource_profile?: "free-cpu";
  timeout_seconds?: number;
  experiment: Record<string, unknown>;
}

export interface QuantLabCapabilities {
  service: string;
  configured: boolean;
  workerStatus: "not_probed";
  supportedJobTypes: QuantLabJobRequest["job_type"][];
  resourceProfiles: ["free-cpu"];
  maxTimeoutSeconds: 900;
  ordersEnabled: false;
  executionEnabled: false;
  liveTradingEnabled: false;
}

export interface ApiClientOptions {
  baseUrl: string | null;
  getToken: () => Promise<string | null>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createApiClient(opts: ApiClientOptions) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function get<T>(path: string, { auth = true }: { auth?: boolean } = {}): Promise<T> {
    try {
      assertReadOnlyRequest("GET", path);
    } catch (e) {
      throw new ApiError("blocked", (e as Error).message);
    }
    if (!opts.baseUrl) throw new ApiError("not_configured", "NOVA API base URL is not configured");
    const headers: Record<string, string> = { accept: "application/json" };
    if (auth) {
      const token = await opts.getToken();
      if (!token) throw new ApiError("unauthenticated", "No session token");
      headers["authorization"] = `Bearer ${token}`;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await f(`${opts.baseUrl}${path}`, { method: "GET", headers, signal: ctrl.signal });
    } catch (e) {
      if ((e as Error).name === "AbortError")
        throw new ApiError("timeout", `Request timed out after ${timeoutMs}ms`);
      throw new ApiError("network", "Network error: API unreachable");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new ApiError("unauthenticated", "Session rejected by API", 401);
    if (res.status === 403)
      throw new ApiError("forbidden", "Insufficient role for this resource", 403);
    if (!res.ok) throw new ApiError("http", `API error ${res.status}`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError("parse", "Invalid JSON from API", res.status);
    }
  }

  async function postQuantLabJob<T>(path: string, payload: QuantLabJobRequest, idempotencyKey: string): Promise<T> {
    try {
      assertQuantLabRequest("POST", path);
    } catch (e) {
      throw new ApiError("blocked", (e as Error).message);
    }
    if (path !== "/v1/quantlab/jobs") throw new ApiError("blocked", "Unsupported QuantLab operation");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
      throw new ApiError("blocked", "A valid idempotency key is required");
    }
    if (!opts.baseUrl) throw new ApiError("not_configured", "NOVA API base URL is not configured");
    const token = await opts.getToken();
    if (!token) throw new ApiError("unauthenticated", "No session token");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await f(`${opts.baseUrl}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new ApiError("timeout", `Request timed out after ${timeoutMs}ms`);
      throw new ApiError("network", "Network error: API unreachable");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new ApiError("unauthenticated", "Session rejected by API", 401);
    if (res.status === 403) throw new ApiError("forbidden", "Insufficient role for this resource", 403);
    if (!res.ok) throw new ApiError("http", `API error ${res.status}`, res.status);
    try { return (await res.json()) as T; }
    catch { throw new ApiError("parse", "Invalid JSON from API", res.status); }
  }

  return {
    get,
    postQuantLabJob,
    quantLabCapabilities: () => get<QuantLabCapabilities>("/v1/quantlab/capabilities"),
    quantLabJobs: (query = "") => get(`/v1/quantlab/jobs${query}`),
    quantLabJob: (jobId: string) => get(`/v1/quantlab/jobs/${encodeURIComponent(jobId)}`),
    quantLabEvents: (jobId: string) => get(`/v1/quantlab/jobs/${encodeURIComponent(jobId)}/events`),
    health: () => get<HealthResponse>("/v1/health", { auth: false }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

let tokenGetter: () => Promise<string | null> = async () => null;
export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}
export const api = createApiClient({ baseUrl: config.apiBaseUrl, getToken: () => tokenGetter() });

export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.kind === "not_configured") return "Not connected";
    return e.message;
  }
  return "Unknown error";
}