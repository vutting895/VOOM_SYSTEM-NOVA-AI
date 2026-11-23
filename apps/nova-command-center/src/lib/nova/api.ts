import { config } from "./config";
import { assertReadOnlyRequest } from "./safety";

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

export interface ChatWorkerHealth {
  ok: boolean;
  service: string;
  version: string;
  aiBinding: boolean;
  authConfigured: boolean;
  executionEnabled: false;
  liveTradingEnabled: false;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  provider: string;
  model: string;
  intent?: {
    schemaVersion: string;
    intent: string;
    component?: { type?: string; executionEnabled?: false; liveTradingEnabled?: false };
  };
  executionEnabled: false;
  liveTradingEnabled: false;
}

export interface ApiClientOptions {
  baseUrl: string | null;
  chatBaseUrl?: string | null;
  getToken: () => Promise<string | null>;
  timeoutMs?: number;
  chatTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createApiClient(opts: ApiClientOptions) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const chatTimeoutMs = opts.chatTimeoutMs ?? 25000;
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

  async function chatHealth(): Promise<ChatWorkerHealth> {
    if (!opts.chatBaseUrl) throw new ApiError("not_configured", "NOVA Chat Worker URL is not configured");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await f(`${opts.chatBaseUrl}/health`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new ApiError("http", `Chat Worker health returned HTTP ${res.status}`, res.status);
      return (await res.json()) as ChatWorkerHealth;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if ((e as Error).name === "AbortError") throw new ApiError("timeout", "Chat Worker health check timed out");
      throw new ApiError("network", "NOVA Chat Worker is unreachable");
    } finally {
      clearTimeout(timer);
    }
  }

  async function sendChat(messages: ChatMessage[]): Promise<ChatResponse> {
    if (!opts.chatBaseUrl) throw new ApiError("not_configured", "NOVA Chat Worker URL is not configured");
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 8) {
      throw new ApiError("blocked", "Chat must contain between 1 and 8 recent messages");
    }
    let total = 0;
    for (const message of messages) {
      if (!message || !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || !message.content.trim() ||
          message.content.trim().length > 1200) {
        throw new ApiError("blocked", "Chat message is invalid or exceeds the 1,200 character limit");
      }
      total += message.content.trim().length;
    }
    const lastMessage = messages[messages.length - 1];
    if (total > 8000 || !lastMessage || lastMessage.role !== "user") {
      throw new ApiError("blocked", "Chat history is too large or does not end with a user message");
    }
    const token = await opts.getToken();
    if (!token) throw new ApiError("unauthenticated", "No session token");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), chatTimeoutMs);
    let res: Response;
    try {
      res = await f(`${opts.chatBaseUrl}/api/chat`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new ApiError("timeout", "NOVA Chat request timed out");
      throw new ApiError("network", "NOVA Chat Worker is unreachable");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new ApiError("unauthenticated", "Session rejected by Chat Worker", 401);
    if (res.status === 403) throw new ApiError("forbidden", "Chat request is not allowed", 403);
    if (!res.ok) {
      let reason = `NOVA Chat returned HTTP ${res.status}`;
      try {
        const body = await res.json() as { error?: string };
        if (typeof body.error === "string") reason = body.error;
      } catch { /* Keep the generic HTTP error. */ }
      throw new ApiError("http", reason, res.status);
    }
    try {
      const body = await res.json() as ChatResponse;
      if (typeof body.message !== "string" || !body.message.trim() ||
          body.executionEnabled !== false || body.liveTradingEnabled !== false) {
        throw new Error("invalid_chat_response");
      }
      return body;
    } catch {
      throw new ApiError("parse", "Chat Worker returned an invalid or unsafe response", res.status);
    }
  }

  return {
    get,
    health: () => get<HealthResponse>("/v1/health", { auth: false }),
    chatHealth,
    sendChat,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

let tokenGetter: () => Promise<string | null> = async () => null;
export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}
export const api = createApiClient({
  baseUrl: config.apiBaseUrl,
  chatBaseUrl: config.chatApiBaseUrl,
  getToken: () => tokenGetter(),
});

export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.kind === "not_configured") return "Not connected";
    return e.message;
  }
  return "Unknown error";
}