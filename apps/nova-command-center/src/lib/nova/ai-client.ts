import { config } from "./config";
import { getSupabase } from "./supabase";

export interface NovaAiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface NovaAiChatResponse {
  message: string;
  provider: string;
  model: string;
  attempts: number;
  fallbackUsed: boolean;
  executionEnabled: false;
  liveTradingEnabled: false;
}

export interface NovaAiStatus {
  service: string;
  providers: {
    primary: string | null;
    configured: { gemini: boolean; cloudflare: boolean; groq: boolean };
    enabled: { gemini: boolean; cloudflare: boolean; groq: boolean };
    order: string[];
    maxAttempts: number;
    executionEnabled: false;
    liveTradingEnabled: false;
  };
  executionEnabled: false;
  liveTradingEnabled: false;
}

async function getAccessToken(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase authentication is not configured");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("A valid NOVA session is required");
  }
  return data.session.access_token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.aiWorkerUrl) {
    throw new Error("VITE_NOVA_AI_WORKER_URL is not configured");
  }
  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${config.aiWorkerUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code =
        typeof body?.error === "string"
          ? body.error
          : `HTTP ${response.status}`;
      throw new Error(code);
    }
    return body as T;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("NOVA AI request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function sendNovaAiChat(messages: NovaAiMessage[]) {
  return request<NovaAiChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

export function getNovaAiStatus() {
  return request<NovaAiStatus>("/api/status", { method: "GET" });
}
