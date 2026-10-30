const ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/interactions",
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
};
const DEFAULT_MODELS = {
  gemini: "gemini-flash-latest",
  openai: "gpt-5.5",
  anthropic: "claude-haiku-4-5-20251001",
  cloudflare: "@cf/meta/llama-3.2-3b-instruct",
};
const MAX_OUTPUT_CHARS = 10000;
const MAX_PROMPT_CHARS = 12000;
const PROVIDERS = new Set(["gemini", "openai", "anthropic"]);

function resolveModel(env, provider) {
  const configured = env?.[provider.toUpperCase() + "_MODEL"];
  return typeof configured === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(configured)
    ? configured : DEFAULT_MODELS[provider];
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 9) throw new Error("invalid_provider_messages");
  let total = 0;
  for (const item of messages) {
    if (!item || !["system", "user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      throw new Error("invalid_provider_messages");
    }
    total += item.content.length;
    if (!item.content.trim() || total > MAX_PROMPT_CHARS) throw new Error("invalid_provider_messages");
  }
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
  const response = await fetch(ENDPOINTS.gemini, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: resolveModel(env, "gemini"), input: prompt,
      system_instruction: system, store: false,
      generation_config: { max_output_tokens: 1000 },
    }),
    signal: AbortSignal.timeout(20000), redirect: "error",
  });
  if (!response.ok) throw new Error("gemini_request_failed");
  const data = await response.json();
  if (data?.status && data.status !== "completed") throw new Error("gemini_interaction_incomplete");
  const text = extractGeminiText(data);
  if (!text) throw new Error("invalid_gemini_response");
  return { text, provider: "gemini", model: resolveModel(env, "gemini") };
}

async function requestOpenAI(env, messages) {
  const key = env?.OPENAI_API_KEY;
  if (typeof key !== "string" || !key.trim()) throw new Error("openai_not_configured");
  const model = resolveModel(env, "openai");
  const response = await fetch(ENDPOINTS.openai, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_completion_tokens: 1000, store: false }),
    signal: AbortSignal.timeout(20000), redirect: "error",
  });
  if (!response.ok) throw new Error("openai_request_failed");
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("invalid_openai_response");
  return { text: text.trim(), provider: "openai", model };
}

async function requestAnthropic(env, messages) {
  const key = env?.ANTHROPIC_API_KEY;
  if (typeof key !== "string" || !key.trim()) throw new Error("anthropic_not_configured");
  const model = resolveModel(env, "anthropic");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const conversation = messages.filter((m) => m.role !== "system");
  const response = await fetch(ENDPOINTS.anthropic, {
    method: "POST",
    headers: {
      "x-api-key": key, "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1000, system, messages: conversation }),
    signal: AbortSignal.timeout(20000), redirect: "error",
  });
  if (!response.ok) throw new Error("anthropic_request_failed");
  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("")
    : "";
  if (!text.trim()) throw new Error("invalid_anthropic_response");
  return { text: text.trim(), provider: "anthropic", model };
}

async function requestCloudflare(env, messages) {
  if (!env?.AI || typeof env.AI.run !== "function") throw new Error("cloudflare_ai_not_configured");
  const model = DEFAULT_MODELS.cloudflare;
  const result = await env.AI.run(model, {
    messages, max_tokens: 1000, temperature: 0.2,
  });
  const text = typeof result === "string" ? result
    : typeof result?.response === "string" ? result.response
      : typeof result?.result?.response === "string" ? result.result.response : "";
  if (!text.trim()) throw new Error("invalid_cloudflare_ai_response");
  return { text: text.trim(), provider: "cloudflare-workers-ai", model };
}

/**
 * Platform AI keys are Cloudflare Worker Secrets. The NOVA customer Vault is
 * intentionally not queried here: its trusted caller / least-privilege gate
 * is still blocked. Never accept key material from request data or a model.
 */
export async function generateWithProviderGateway(env, messages) {
  validateMessages(messages);
  const configured = typeof env?.NOVA_AI_PROVIDER === "string" ? env.NOVA_AI_PROVIDER.toLowerCase() : "gemini";
  const primary = PROVIDERS.has(configured) ? configured : "gemini";
  let primaryFailure = null;
  try {
    const result = primary === "openai" ? await requestOpenAI(env, messages)
      : primary === "anthropic" ? await requestAnthropic(env, messages)
        : await requestGemini(env, messages);
    if (!result.text || result.text.length > MAX_OUTPUT_CHARS) throw new Error("invalid_provider_response");
    return { ...result, fallbackFrom: null };
  } catch {
    primaryFailure = primary;
  }
  try {
    const result = await requestCloudflare(env, messages);
    if (!result.text || result.text.length > MAX_OUTPUT_CHARS) throw new Error("invalid_provider_response");
    return { ...result, fallbackFrom: primaryFailure };
  } catch {
    throw new Error("ai_provider_unavailable");
  }
}

export const AI_PROVIDER_DEFAULTS = Object.freeze({ ...DEFAULT_MODELS });
