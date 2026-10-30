const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-flash-latest";
const MAX_OUTPUT_CHARS = 10000;

export async function generateGeminiText(env, { systemInstruction, prompt, maxOutputTokens = 900 }) {
  if (typeof env?.GEMINI_API_KEY !== "string" || !env.GEMINI_API_KEY.trim()) throw new Error("gemini_not_configured");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 12000) throw new Error("invalid_gemini_prompt");
  const model = typeof env.GEMINI_MODEL === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(env.GEMINI_MODEL)
    ? env.GEMINI_MODEL : DEFAULT_MODEL;
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      model, input: prompt, system_instruction: systemInstruction, store: false,
      generation_config: { max_output_tokens: Math.max(1, Math.min(Number(maxOutputTokens) || 900, 1200)) },
    }),
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("gemini_request_failed");
  const data = await response.json();
  if (data?.status && data.status !== "completed") throw new Error("gemini_interaction_incomplete");
  const text = Array.isArray(data?.steps) ? data.steps
    .filter((step) => step?.type === "model_output" && Array.isArray(step.content))
    .flatMap((step) => step.content)
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text).join("") : "";
  const output = text.trim();
  if (!output || output.length > MAX_OUTPUT_CHARS) throw new Error("invalid_gemini_response");
  return output;
}
