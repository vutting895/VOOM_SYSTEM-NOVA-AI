import { ProviderError } from "./errors.js";

export async function generateWithCloudflare(env, messages) {
  if (!env.AI || typeof env.AI.run !== "function") {
    throw new ProviderError("cloudflare-workers-ai", "provider_not_configured", 503, true);
  }
  const model = String(env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.2-3b-instruct");
  try {
    const result = await env.AI.run(model, {
      messages,
      max_tokens: 900,
      temperature: 0.25,
    });
    const message = typeof result === "string"
      ? result
      : typeof result?.response === "string"
        ? result.response
        : typeof result?.result?.response === "string"
          ? result.result.response
          : "";
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 10000) {
      throw new ProviderError("cloudflare-workers-ai", "invalid_model_response", 502, true);
    }
    return { message: trimmed, provider: "cloudflare-workers-ai", model };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 401 || status === 403 || status === 400) {
      throw new ProviderError("cloudflare-workers-ai", "provider_request_rejected", status, false);
    }
    if (status === 429 || status >= 500) {
      throw new ProviderError("cloudflare-workers-ai", status === 429 ? "provider_rate_limited" : "provider_server_error", status || 503, true);
    }
    throw new ProviderError("cloudflare-workers-ai", "provider_unavailable", 503, true);
  }
}
