import { ProviderError, classifyProviderFailure } from "./errors.js";

export async function generateWithGroq(env, messages, options = {}) {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new ProviderError("groq", "provider_not_configured", 503, true);
  const model = String(env.GROQ_MODEL || "openai/gpt-oss-120b").trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) {
    throw new ProviderError("groq", "provider_configuration_invalid", 503, false);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 900,
        temperature: 0.25,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw classifyProviderFailure("groq", response.status);
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    if (["content_filter"].includes(choice?.finish_reason)) {
      throw new ProviderError("groq", "provider_safety_block", 400, false);
    }
    const message = choice?.message?.content;
    if (typeof message !== "string" || !message.trim() || message.length > 10000) {
      throw new ProviderError("groq", "invalid_model_response", 502, true);
    }
    return { message: message.trim(), provider: "groq", model };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error?.name === "AbortError") throw new ProviderError("groq", "provider_timeout", 504, true);
    throw new ProviderError("groq", "provider_network_error", 503, true);
  } finally {
    clearTimeout(timer);
  }
}
