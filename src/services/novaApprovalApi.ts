export const NOVA_SYSTEM_HUB_DEFAULT_URL =
  "https://voom-system-hub.suwapat787.workers.dev";

export type NovaApprovalState = "pending" | "approved" | "rejected" | "edited" | "expired" | "cancelled";
export type NovaThreadState = "active" | "awaiting_review" | "closed";

export interface NovaStrategyDraftProposal {
  title: string;
  summary: string;
  market: "BTC/USDT" | "ETH/USDT" | "EUR/USD" | "XAU/USD" | "US30" | null;
  timeframe: "5m" | "15m" | "1h" | "4h" | "1d" | null;
  riskProfile: "low" | "medium" | "high" | null;
}

export interface NovaAgentThread {
  id: string;
  title: string;
  state: NovaThreadState;
  policy_version: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

export interface NovaApprovalRequest {
  id: string;
  thread_id: string;
  request_type: "strategy_draft_review";
  proposal: NovaStrategyDraftProposal;
  proposal_hash: string;
  policy_version: string;
  status: NovaApprovalState;
  decision_note: string | null;
  decision_payload: NovaStrategyDraftProposal | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

export interface NovaApprovalDecisionResult {
  approval: Pick<
    NovaApprovalRequest,
    "id" | "thread_id" | "status" | "decided_at" | "decision_payload"
  >;
  message: string;
  agentGraphResumeEnabled: false;
  ordersEnabled: false;
  executionEnabled: false;
  liveTradingEnabled: false;
  brokerMutationEnabled: false;
}

export type NovaApprovalDecision =
  | { decision: "approve"; note?: string }
  | { decision: "reject"; note?: string }
  | { decision: "edit"; note?: string; editedProposal: NovaStrategyDraftProposal };

export interface NovaApprovalApiOptions {
  /**
   * Must read the currently authenticated Supabase session when called.
   * The client deliberately does not persist or cache access tokens.
   */
  getAccessToken: () => Promise<string | null | undefined>;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class NovaApprovalApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "NovaApprovalApiError";
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("nova_system_hub_url_must_use_https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("nova_system_hub_url_invalid");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function readErrorCode(value: unknown, status: number): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "string" && /^[a-z0-9_]{1,80}$/i.test(error)) return error;
  }
  return status === 401 ? "authentication_required" : "nova_system_hub_request_failed";
}

export function createNovaApprovalApi(options: NovaApprovalApiOptions) {
  if (typeof options?.getAccessToken !== "function") {
    throw new Error("nova_access_token_provider_required");
  }

  const configuredBase =
    options.baseUrl ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SYSTEM_HUB_URL) ||
    NOVA_SYSTEM_HUB_DEFAULT_URL;
  const baseUrl = normalizeBaseUrl(configuredBase);
  const fetcher = options.fetcher || fetch;

  async function request<T>(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown } = {},
  ): Promise<T> {
    const accessToken = await options.getAccessToken();
    if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
      throw new NovaApprovalApiError(401, "authentication_required");
    }

    const headers = new Headers({
      Accept: "application/json",
      Authorization: "Bearer " + accessToken,
    });
    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }

    let response: Response;
    try {
      response = await fetcher(baseUrl + path, {
        method: init.method || "GET",
        headers,
        body,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
    } catch {
      throw new NovaApprovalApiError(503, "approval_service_unavailable");
    }

    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new NovaApprovalApiError(502, "approval_service_invalid_response");
      }
    }

    if (!response.ok) {
      throw new NovaApprovalApiError(response.status, readErrorCode(payload, response.status));
    }
    return payload as T;
  }

  return {
    listThreads(state?: NovaThreadState) {
      const query = state ? "?state=" + encodeURIComponent(state) : "";
      return request<{ threads: NovaAgentThread[] }>("/v1/agent/threads" + query);
    },

    createThread(title?: string) {
      return request<{ thread: NovaAgentThread }>("/v1/agent/threads", {
        method: "POST",
        body: title === undefined ? {} : { title },
      });
    },

    listApprovals(threadId: string) {
      return request<{ approvals: NovaApprovalRequest[] }>(
        "/v1/agent/threads/" + encodeURIComponent(threadId) + "/approvals",
      );
    },

    createApproval(threadId: string, proposal: NovaStrategyDraftProposal) {
      return request<{ approval: NovaApprovalRequest }>(
        "/v1/agent/threads/" + encodeURIComponent(threadId) + "/approvals",
        {
          method: "POST",
          body: { requestType: "strategy_draft_review", proposal },
        },
      );
    },

    decideApproval(approvalId: string, decision: NovaApprovalDecision) {
      return request<NovaApprovalDecisionResult>(
        "/v1/agent/approvals/" + encodeURIComponent(approvalId) + "/decision",
        {
          method: "POST",
          body: decision,
        },
      );
    },
  };
}
