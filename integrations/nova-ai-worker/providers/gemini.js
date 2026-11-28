import { ProviderError, classifyProviderFailure } from "./errors.js";

export async function generateWithGemini(env, messages, options = {}) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new ProviderError("gemini", "provider_not_configured", 503, true);
  const model = String(env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) {
    throw new ProviderError("gemini", "provider_configuration_invalid", 503, false);
  }
  const contents = messages.filter((item) => item.role !== "system").map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));
  const systemText = messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { maxOutputTokens: 900, temperature: 0.25 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw classifyProviderFailure("gemini", response.status);
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    if (payload?.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate?.finishReason)) {
      throw new ProviderError("gemini", "provider_safety_block", 400, false);
    }
    const text = candidate?.content?.parts
      ?.map((part) => typeof part?.text === "string" ? part.text : "")
      .join("").trim();
    if (!text || text.length > 10000) throw new ProviderError("gemini", "invalid_model_response", 502, true);
    return { message: text, provider: "gemini", model };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error?.name === "AbortError") throw new ProviderError("gemini", "provider_timeout", 504, true);
    throw new ProviderError("gemini", "provider_network_error", 503, true);
  } finally {
    clearTimeout(timer);
  }
}
