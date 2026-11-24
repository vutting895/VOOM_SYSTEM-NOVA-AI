const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.8-flash";
const CLOUDFLARE_MODEL = "@cf/meta/llama-3.2-3b-instruct";
const MAX_OUTPUT_CHARS = 10000;
const MAX_PROMPT_CHARS = 12000;

const CREDENTIAL_PATTERNS = [
  /\bAuthorization\s*:\s*Basic\s+[A-Za-z0-9+/]+={0,2}/gi,
  /\bAuthorization\s*:\s*Bearer\s+\S+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,})\b/g,
  /\b((?:api[ _-]?key|api[ _-]?token|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|service[ _-]?role[_ -]?key|password|passwd|secret|token)\s*[:=]\s*)["']?[^\s"',;]+/gi,
  /[?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=([^&#\s]+)/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /(?:^|\n)\s*(?:cookie|set-cookie)\s*:\s*[^\r\n]+/gim,
];

export function redactProviderText(value) {
  if (typeof value !== "string") return "";
  return CREDENTIAL_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
}

function resolveGeminiModel(env) {
  const configured = env?.GEMINI_MODEL;
  return typeof configured === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(configured)
    ? configured : DEFAULT_MODEL;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 9) {
    throw new Error("invalid_provider_messages");
  }
  let total = 0;
  for (const item of messages) {
    if (!item || !["system", "user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      throw new Error("invalid_provider_messages");
    }
    total += item.content.length;
    if (!item.content.trim() || total > MAX_PROMPT_CHARS) throw new Error("invalid_provider_messages");
  }
}

function sanitizeMessages(messages) {
  return messages.map(({ role, content }) => ({ role, content: redactProviderText(content) }));
}

function extractGeminiText(data) {
  const parts = Array.isArray(data?.steps) ? data.steps
    .filter((step) => step?.type === "model_output" && Array.isArray(step.content))
    .flatMap((step) => step.content)
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text) : [];
  return parts.join("").trim();
}

async function requestGemini(env, messages) {
  const key = env?.GEMINI_API_KEY;
  if (typeof key !== "string" || !key.trim()) throw new Error("gemini_not_configured");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const prompt = messages.filter((m) => m.role !== "system")
    .map((m) => (m.role === "assistant" ? "Assistant: " : "User: ") + m.content).join("\n\n");
  const model = resolveGeminiModel(env);
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model, input: prompt, system_instruction: system, store: false,
      generation_config: { max_output_tokens: 1000 },
    }),
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("gemini_request_failed");
  const data = await response.json();
  if (data?.status && data.status !== "completed") throw new Error("gemini_interaction_incomplete");
  const text = extractGeminiText(data);
  if (!text || text.length > MAX_OUTPUT_CHARS) throw new Error("invalid_gemini_response");
  return { text, provider: "gemini", model };
}

async function requestCloudflare(env, messages) {
  if (!env?.AI || typeof env.AI.run !== "function") throw new Error("cloudflare_ai_not_configured");
  const result = await env.AI.run(CLOUDFLARE_MODEL, {
    messages, max_tokens: 1000, temperature: 0.2,
  });
  const text = typeof result === "string" ? result
    : typeof result?.response === "string" ? result.response
      : typeof result?.result?.response === "string" ? result.result.response : "";
  if (!text.trim() || text.length > MAX_OUTPUT_CHARS) throw new Error("invalid_cloudflare_ai_response");
  return { text: text.trim(), provider: "cloudflare-workers-ai", model: CLOUDFLARE_MODEL };
}

export async function generateWithProviderGateway(env, messages) {
  validateMessages(messages);
  const safeMessages = sanitizeMessages(messages);
  try {
    const result = await requestGemini(env, safeMessages);
    return { ...result, fallbackFrom: null };
  } catch {
    try {
      const result = await requestCloudflare(env, safeMessages);
      return { ...result, fallbackFrom: "gemini" };
    } catch {
      throw new Error("ai_provider_unavailable");
    }
  }
}
