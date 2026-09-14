import type {
  IIAService,
  IAIRequest,
  IAIResponse,
  IAIMessage,
} from '../../../domain/ports/iai-service.port.js';
import type { DeepSeekConfig } from './deepseek.config.js';
import type { TemplateService } from '../template/template.service.js';
import { logger } from '../../shared/logger.js';

interface DeepSeekRequestBody {
  model: string;
  messages: IAIMessage[];
  max_tokens: number;
  temperature: number;
  stream: false;
}

interface DeepSeekChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

interface DeepSeekApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface DeepSeekErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(base: number, attempt: number): number {
  return Math.min(base * 2 ** attempt, 10_000) + Math.random() * 200;
}

/**
 * AI engine implementing IIAService via the DeepSeek API with Handlebars templates and retries.
 */
export class DeepSeekService implements IIAService {
  private readonly completionsUrl: string;

  constructor(
    private readonly config: DeepSeekConfig,
    private readonly templateService: TemplateService,
  ) {
    this.completionsUrl = `${config.baseUrl}/chat/completions`;
  }

  async generateResponse(request: IAIRequest): Promise<IAIResponse> {
    const { rendered: systemPrompt, missingVariables } = this.templateService.compile(
      request.systemPromptTemplate,
      request.context ?? {},
    );

    if (missingVariables.length > 0) {
      logger.warn('[DeepSeekService] System prompt has unresolved variables', {
        missing: missingVariables,
      });
    }

    const messages: IAIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(request.history ?? []).map((h) => ({
        role: h.role as IAIMessage['role'],
        content: h.content,
      })),
      { role: 'user', content: request.userMessage },
    ];

    const body: DeepSeekRequestBody = {
      model: request.options?.model ?? this.config.model,
      messages,
      max_tokens: request.options?.maxTokens ?? this.config.maxTokens,
      temperature: request.options?.temperature ?? this.config.temperature,
      stream: false,
    };

    logger.debug('[DeepSeekService] Generating response', {
      model: body.model,
      messages: messages.length,
      systemPromptLength: systemPrompt.length,
    });

    const raw = await this.callWithRetry(body);

    const choice = raw.choices[0];
    if (!choice) {
      throw new Error('[DeepSeekService] API returned no response choices');
    }

    const response: IAIResponse = {
      content: choice.message.content,
      model: raw.model,
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        completionTokens: raw.usage.completion_tokens,
        totalTokens: raw.usage.total_tokens,
      },
    };

    logger.debug('[DeepSeekService] Response received', {
      model: raw.model,
      finishReason: choice.finish_reason,
      totalTokens: raw.usage.total_tokens,
    });

    return response;
  }

  private async callWithRetry(
    body: DeepSeekRequestBody,
    attempt = 0,
  ): Promise<DeepSeekApiResponse> {
    try {
      return await this.callApi(body);
    } catch (err) {
      const isRetryable = this.isRetryableError(err);
      const hasAttemptsLeft = attempt < this.config.maxRetries;

      if (!isRetryable || !hasAttemptsLeft) {
        logger.error('[DeepSeekService] API call failed', {
          attempt,
          maxRetries: this.config.maxRetries,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const delay = retryDelay(this.config.retryBaseDelayMs, attempt);
      logger.warn('[DeepSeekService] Retrying request', {
        attempt: attempt + 1,
        maxRetries: this.config.maxRetries,
        delayMs: Math.round(delay),
      });

      await sleep(delay);
      return this.callWithRetry(body, attempt + 1);
    }
  }

  private async callApi(body: DeepSeekRequestBody): Promise<DeepSeekApiResponse> {
    const signal = AbortSignal.timeout(this.config.timeoutMs);

    const response = await fetch(this.completionsUrl, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;

      try {
        const errorBody = (await response.json()) as DeepSeekErrorBody;
        if (errorBody.error?.message) {
          errorMessage = `${errorMessage}: ${errorBody.error.message}`;
        }
      } catch {
        // ignore non-JSON error bodies
      }

      const error = new DeepSeekApiError(errorMessage, response.status);
      throw error;
    }

    return response.json() as Promise<DeepSeekApiResponse>;
  }

  private isRetryableError(err: unknown): boolean {
    if (err instanceof DeepSeekApiError) {
      return RETRYABLE_STATUS_CODES.has(err.statusCode);
    }
    if (err instanceof Error) {
      const name = err.name;
      const msg = err.message.toLowerCase();
      return (
        name === 'AbortError' ||
        name === 'TimeoutError' ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('network') ||
        msg.includes('fetch failed')
      );
    }
    return false;
  }
}

/**
 * Error thrown when the DeepSeek API returns a non-success HTTP status.
 */
export class DeepSeekApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'DeepSeekApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}
