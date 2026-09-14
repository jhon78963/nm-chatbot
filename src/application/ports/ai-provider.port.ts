/**
 * A single function/tool call requested by the model.
 * `arguments` is a raw JSON string (as returned by the LLM) — callers must
 * parse it themselves, tolerating malformed JSON.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** JSON-schema based definition of a tool exposed to the LLM (OpenAI/DeepSeek "function calling" format). */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolChoice = 'auto' | 'none' | 'required';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Assistant messages that only carry tool_calls may have empty content. */
  content: string;
  /** Present on assistant messages that decided to call one or more tools. */
  tool_calls?: ToolCall[];
  /** Required on role:"tool" messages — links the result back to the originating call. */
  tool_call_id?: string;
  /** Optional — name of the tool that produced a role:"tool" message. */
  name?: string;
}

export interface AiCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  /** Tools the model is allowed to call. Omit to disable tool calling entirely. */
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  /** Present when the model decided to invoke one or more tools instead of answering directly. */
  toolCalls?: ToolCall[];
}

/**
 * Port that decouples the application layer from any AI provider.
 */
export interface AiProviderPort {
  complete(messages: ChatMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult>;
}
