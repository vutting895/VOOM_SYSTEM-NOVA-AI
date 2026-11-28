import type {
  ProviderUsage,
  TextGenerationProvider,
  TextGenerationRequest,
  TextGenerationResult,
} from "./types";

export const WORKERS_AI_MODELS = ["@cf/zai-org/glm-4.7-flash"] as const;
export type WorkersAiModel = (typeof WORKERS_AI_MODELS)[number];

export type WorkersAiErrorCode =
  | "CONFIGURATION"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MODEL"
  | "TIMEOUT"
  | "NETWORK"
  | "AUTHENTICATION"
  | "FORBIDDEN"
  | "QUOTA"
  | "UPSTREAM"
  | "INVALID_RESPONSE"
  | "TRUNCATED";

export class WorkersAiProviderError extends Error {
  readonly code: WorkersAiErrorCode;
  readonly retryable: boolean;

  constructor(code: WorkersAiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "WorkersAiProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface CloudflareWorkersAiProviderOptions {
  accountId: string;
  apiToken: string;
  model?: WorkersAiModel;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface CloudflareChatEnvelope {
  success?: boolean;
  errors?: unknown[];
  result?: {
    model?: unknown;
    choices?: Array<{
      finish_reason?: unknown;
      message?: { content?: unknown };
    }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
      neurons?: unknown;
    };
  };
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 256;
const MAX_OUTPUT_TOKENS = 1_024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 16_000;

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseUsage(value: unknown): ProviderUsage {
  if (!value || typeof value !== "object") return {};
  const usage = value as Record<string, unknown>;
  return {
    promptTokens: asFiniteNumber(usage.prompt_tokens),
    completionTokens: asFiniteNumber(usage.completion_tokens),
    totalTokens: asFiniteNumber(usage.total_tokens),
    neurons: asFiniteNumber(usage.neurons),
  };
}

export class CloudflareWorkersAiProvider implements TextGenerationProvider {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly model: WorkersAiModel;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudflareWorkersAiProviderOptions) {
    if (!/^[a-f0-9]{32}$/i.test(options.accountId)) {
      throw new WorkersAiProviderError("CONFIGURATION", "Invalid Cloudflare account ID");
    }
    if (!options.apiToken?.trim()) {
      throw new WorkersAiProviderError("CONFIGURATION", "Cloudflare API token is required");
    }

    const model = options.model ?? WORKERS_AI_MODELS[0];
    if (!WORKERS_AI_MODELS.includes(model)) {
      throw new WorkersAiProviderError("UNSUPPORTED_MODEL", "Workers AI model is not allowlisted");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) {
      throw new WorkersAiProviderError("CONFIGURATION", "Timeout must be between 500 and 30000 ms");
    }

    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    this.validateRequest(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;

    let envelope: CloudflareChatEnvelope;
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: request.messages,
          max_completion_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: request.temperature ?? 0.1,
          stream: false,
          n: 1,
          chat_template_kwargs: {
            enable_thinking: false,
            clear_thinking: true,
          },
        }),
      });

      if (response.status === 401) {
        throw new WorkersAiProviderError("AUTHENTICATION", "Workers AI authentication failed");
      }
      if (response.status === 403) {
        throw new WorkersAiProviderError("FORBIDDEN", "Workers AI request is not permitted");
      }
      if (response.status === 429) {
        throw new WorkersAiProviderError("QUOTA", "Workers AI quota or rate limit reached", true);
      }
      if (response.status >= 500) {
        throw new WorkersAiProviderError("UPSTREAM", "Workers AI service is unavailable", true);
      }
      if (!response.ok) {
        throw new WorkersAiProviderError("UPSTREAM", "Workers AI rejected the request");
      }

      try {
        envelope = (await response.json()) as CloudflareChatEnvelope;
      } catch {
        if (controller.signal.aborted) {
          throw new WorkersAiProviderError("TIMEOUT", "Workers AI request timed out", true);
        }
        throw new WorkersAiProviderError("INVALID_RESPONSE", "Workers AI returned invalid JSON");
      }
    } catch (error) {
      if (error instanceof WorkersAiProviderError) throw error;
      if (controller.signal.aborted) {
        throw new WorkersAiProviderError("TIMEOUT", "Workers AI request timed out", true);
      }
      throw new WorkersAiProviderError("NETWORK", "Workers AI network request failed", true);
    } finally {
      clearTimeout(timeout);
    }

    if (envelope.success !== true || !envelope.result || !Array.isArray(envelope.result.choices)) {
      throw new WorkersAiProviderError("INVALID_RESPONSE", "Workers AI response envelope is invalid");
    }

    const choice = envelope.result.choices[0];
    const finishReason = choice?.finish_reason;
    const content = choice?.message?.content;

    if (finishReason === "length") {
      throw new WorkersAiProviderError("TRUNCATED", "Workers AI output was truncated");
    }
    if (finishReason !== "stop" || typeof content !== "string" || !content.trim()) {
      throw new WorkersAiProviderError("INVALID_RESPONSE", "Workers AI returned no usable text");
    }

    return {
      text: content.trim(),
      provider: "cloudflare-workers-ai",
      model: this.model,
      finishReason: "stop",
      usage: parseUsage(envelope.result.usage),
    };
  }

  private validateRequest(request: TextGenerationRequest): void {
    if (!request || !Array.isArray(request.messages) ||
        request.messages.length < 1 || request.messages.length > MAX_MESSAGES) {
      throw new WorkersAiProviderError("INVALID_REQUEST", "Message count is outside allowed bounds");
    }

    let totalMessageChars = 0;
    for (const message of request.messages) {
      if (!message || !["system", "user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || !message.content.trim() ||
          message.content.length > MAX_MESSAGE_CHARS) {
        throw new WorkersAiProviderError("INVALID_REQUEST", "Message content or role is invalid");
      }
      totalMessageChars += message.content.length;
    }
    if (totalMessageChars > 32_000) {
      throw new WorkersAiProviderError("INVALID_REQUEST", "Combined message content exceeds allowed bounds");
    }

    const maxOutputTokens = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 32 ||
        maxOutputTokens > MAX_OUTPUT_TOKENS) {
      throw new WorkersAiProviderError("INVALID_REQUEST", "Output token limit is outside allowed bounds");
    }

    const temperature = request.temperature ?? 0.1;
    if (typeof temperature !== "number" || !Number.isFinite(temperature) ||
        temperature < 0 || temperature > 1) {
      throw new WorkersAiProviderError("INVALID_REQUEST", "Temperature must be between 0 and 1");
    }
  }
}
