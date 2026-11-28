export type LlmMessageRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface TextGenerationRequest {
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  neurons?: number;
}

export interface TextGenerationResult {
  text: string;
  provider: string;
  model: string;
  finishReason: "stop";
  usage: ProviderUsage;
}

export interface TextGenerationProvider {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}
