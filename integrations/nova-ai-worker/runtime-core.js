export const MODEL_RUNTIME_VERSION = "nova.model-runtime.v1";
export const DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.2-3b-instruct";
const ALLOWED_CHAT_MODELS = new Set([DEFAULT_CHAT_MODEL]);

export class ModelRuntimeError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = "ModelRuntimeError";
    this.code = code;
    this.status = status;
  }
}

function extractText(result) {
  if (typeof result === "string") return result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.result?.response === "string") return result.result.response;
  return "";
}

// The model is selected only by server configuration and a fixed allowlist.
// No browser-controlled model routing, tool calling, or implicit fallback exists.
export async function runChatModel(env, messages) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    throw new ModelRuntimeError("ai_unavailable", 503);
  }
  const model = env.NOVA_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  if (!ALLOWED_CHAT_MODELS.has(model)) {
    throw new ModelRuntimeError("model_not_allowlisted", 503);
  }
  if (!Array.isArray(messages) || messages.length < 2 || messages.length > 14) {
    throw new ModelRuntimeError("invalid_runtime_messages", 400);
  }
  let totalChars = 0;
  for (const item of messages) {
    if (!item || !["system", "user", "assistant"].includes(item.role)
      || typeof item.content !== "string" || !item.content.trim()
      || item.content.length > 12000) {
      throw new ModelRuntimeError("invalid_runtime_messages", 400);
    }
    totalChars += item.content.length;
  }
  if (totalChars > 22000) {
    throw new ModelRuntimeError("runtime_context_too_large", 413);
  }

  let result;
  try {
    result = await env.AI.run(model, { messages, max_tokens: 900, temperature: 0.25 });
  } catch {
    throw new ModelRuntimeError("ai_provider_unavailable", 503);
  }
  const message = extractText(result).trim();
  if (!message || message.length > 10000) {
    throw new ModelRuntimeError("invalid_model_response", 502);
  }
  return { message, provider: "cloudflare-workers-ai", model, runtimeVersion: MODEL_RUNTIME_VERSION };
}
export function compactChatHistory(messages, maxMessages = 6, maxChars = 1800) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-maxMessages).map((message) => ({
    role: message.role,
    content: String(message.content || "").slice(-maxChars),
  }));
}
