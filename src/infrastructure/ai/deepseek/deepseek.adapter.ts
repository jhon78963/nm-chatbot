import axios, { type AxiosInstance } from 'axios';
import type {
  AiProviderPort,
  ChatMessage,
  AiCompletionOptions,
  AiCompletionResult,
  ToolCall,
} from '../../../application/ports/ai-provider.port.js';
import type { DeepSeekConfig } from './deepseek.config.js';
import { logger } from '../../shared/logger.js';

interface DeepSeekResponseChoice {
  message: { role: string; content: string | null; tool_calls?: ToolCall[] };
  finish_reason: string;
}

interface DeepSeekApiResponse {
  id: string;
  model: string;
  choices: DeepSeekResponseChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface DeepSeekRequestBody {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  stream: boolean;
  tools?: AiCompletionOptions['tools'];
  tool_choice?: AiCompletionOptions['toolChoice'];
}

/**
 * Adapter that implements AiProviderPort using the DeepSeek API.
 * Supports OpenAI-compatible tool/function calling — pass `options.tools` to
 * let the model request calls to the hybrid engine's Mongo-backed tools.
 */
export class DeepSeekAdapter implements AiProviderPort {
  private readonly client: AxiosInstance;
  private readonly config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async complete(
    messages: ChatMessage[],
    options?: AiCompletionOptions,
  ): Promise<AiCompletionResult> {
    const model = options?.model ?? this.config.model;
    const hasTools = !!options?.tools && options.tools.length > 0;

    const body: DeepSeekRequestBody = {
      model,
      messages,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
      stream: options?.stream ?? false,
      ...(hasTools && { tools: options!.tools, tool_choice: options?.toolChoice ?? 'auto' }),
    };

    logger.debug('[DeepSeek] Sending request', {
      model,
      messageCount: messages.length,
      toolsEnabled: hasTools,
    });

    const response = await this.client.post<DeepSeekApiResponse>('/chat/completions', body);

    const choice = response.data.choices[0];
    if (!choice) {
      throw new Error('[DeepSeek] API returned no response choices');
    }

    logger.debug('[DeepSeek] Response received', {
      tokens: response.data.usage.total_tokens,
      finishReason: choice.finish_reason,
      toolCalls: choice.message.tool_calls?.length ?? 0,
    });

    return {
      content: choice.message.content ?? '',
      model: response.data.model,
      promptTokens: response.data.usage.prompt_tokens,
      completionTokens: response.data.usage.completion_tokens,
      totalTokens: response.data.usage.total_tokens,
      finishReason: choice.finish_reason,
      ...(choice.message.tool_calls && { toolCalls: choice.message.tool_calls }),
    };
  }
}
