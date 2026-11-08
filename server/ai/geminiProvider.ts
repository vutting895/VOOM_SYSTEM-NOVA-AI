import { GoogleGenAI } from "@google/genai";

export type GeminiTask = "chat" | "market_analysis" | "content_generation";

const MODEL_BY_TASK: Record<GeminiTask, string> = {
  chat: "gemini-3.8-flash",
  market_analysis: "gemini-3.8-flash",
  content_generation: "gemini-3.8-flash",
};

type GenerateInput = {
  task: GeminiTask;
  contents: string;
  systemInstruction?: string;
};

type GeminiClientLike = {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config?: { systemInstruction: string };
    }): Promise<{ text?: string }>;
  };
};

export class GeminiProviderError extends Error {
  readonly code = "GEMINI_PROVIDER_FAILURE";
  constructor() {
    super("Gemini provider request failed");
    this.name = "GeminiProviderError";
  }
}

export function createGeminiProvider(options: {
  apiKey?: string;
  clientFactory?: (apiKey: string) => GeminiClientLike;
} = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim() || apiKey === "MY_GEMINI_API_KEY") return null;

  const client: GeminiClientLike = options.clientFactory
    ? options.clientFactory(apiKey)
    : new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: 20_000,
          headers: { "User-Agent": "voom-hybrid-ai-gateway" },
        },
      }) as unknown as GeminiClientLike;

  return {
    async generateText(input: GenerateInput): Promise<{ text: string; model: string }> {
      if (!Object.hasOwn(MODEL_BY_TASK, input.task)) {
        throw new TypeError("Unsupported Gemini task");
      }
      if (typeof input.contents !== "string" || !input.contents.trim() || input.contents.length > 24_000) {
        throw new TypeError("Gemini input is empty or exceeds the 24000 character limit");
      }
      if (input.systemInstruction && input.systemInstruction.length > 4_000) {
        throw new TypeError("Gemini system instruction exceeds the 4000 character limit");
      }

      const model = MODEL_BY_TASK[input.task];
      try {
        const response = await client.models.generateContent({
          model,
          contents: input.contents,
          ...(input.systemInstruction
            ? { config: { systemInstruction: input.systemInstruction } }
            : {}),
        });
        return { text: typeof response.text === "string" ? response.text : "", model };
      } catch {
        // Do not propagate raw provider errors; they may contain request or credential metadata.
        throw new GeminiProviderError();
      }
    },
  };
}
