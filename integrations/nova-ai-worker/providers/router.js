import { generateWithGemini } from "./gemini.js";
import { generateWithCloudflare } from "./cloudflare.js";
import { generateWithGroq } from "./groq.js";
import { ProviderError } from "./errors.js";

const MAX_ATTEMPTS = 3;

function isEnabled(env, provider) {
  if (provider === "gemini") return Boolean(env.GEMINI_API_KEY && env.GEMINI_FREE_TIER_CONFIRMED === "true");
  if (provider === "cloudflare") return Boolean(env.AI && typeof env.AI.run === "function" && env.CLOUDFLARE_AI_FREE_TIER_CONFIRMED === "true");
  if (provider === "groq") return Boolean(env.GROQ_API_KEY && env.GROQ_FREE_TIER_CONFIRMED === "true");
  return false;
}

export function providerStatus(env) {
  const configured = {
    gemini: Boolean(env.GEMINI_API_KEY),
    cloudflare: Boolean(env.AI && typeof env.AI.run === "function"),
    groq: Boolean(env.GROQ_API_KEY),
  };
  const enabled = {
    gemini: isEnabled(env, "gemini"),
    cloudflare: isEnabled(env, "cloudflare"),
    groq: isEnabled(env, "groq"),
  };
  return {
    primary: enabled.gemini ? "gemini" : null,
    configured,
    enabled,
    freeTierConfirmationRequired: true,
    order: ["gemini", "cloudflare-workers-ai", "groq"],
    maxAttempts: MAX_ATTEMPTS,
    executionEnabled: false,
    liveTradingEnabled: false,
  };
}

export async function routeChat(env, messages, adapters = {}) {
  const candidates = [
    { name: "gemini", enabled: isEnabled(env, "gemini"), run: adapters.gemini || generateWithGemini },
    { name: "cloudflare-workers-ai", enabled: isEnabled(env, "cloudflare"), run: adapters.cloudflare || generateWithCloudflare },
    { name: "groq", enabled: isEnabled(env, "groq"), run: adapters.groq || generateWithGroq },
  ].filter((item) => item.enabled).slice(0, MAX_ATTEMPTS);

  if (!candidates.length) throw new ProviderError("router", "no_free_provider_confirmed", 503, false);

  const failures = [];
  for (const provider of candidates) {
    try {
      const result = await provider.run(env, messages);
      return { ...result, attempts: failures.length + 1, fallbackUsed: failures.length > 0 };
    } catch (error) {
      const normalized = error instanceof ProviderError
        ? error
        : new ProviderError(provider.name, "provider_unavailable", 503, true);
      failures.push({ provider: provider.name, code: normalized.code });
      if (!normalized.retryable) throw normalized;
    }
  }
  throw new ProviderError("router", "all_providers_unavailable", 503, false);
}
