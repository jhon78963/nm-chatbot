/**
 * Domain port for the AI engine.
 * Defines the high-level contract consumed by the application layer.
 * Concrete implementations (DeepSeekService, OpenAIService, etc.) live in infrastructure.
 */
export interface IIAService {
  generateResponse(request: IAIRequest): Promise<IAIResponse>;
}

export interface IAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface IAIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface IAIResponse {
  content: string;
  model: string;
  finishReason: 'stop' | 'length' | 'content_filter' | string;
  usage: IAIUsage;
}

export interface IAIRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface IAIRequest {
  systemPromptTemplate: string;
  userMessage: string;
  context?: Record<string, unknown>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  options?: IAIRequestOptions;
}
