import type { AiProviderPort, ChatMessage, ToolDefinition } from '../../application/ports/ai-provider.port.js';
import { logger } from '../shared/logger.js';

/** Safety net against infinite tool-call loops (a misbehaving model re-calling tools forever). */
const MAX_TOOL_ROUNDS = 4;

export interface ExecutedToolCall {
  name: string;
  arguments: string;
}

export interface ToolLoopResult {
  content: string;
  model: string;
  totalTokens: number;
  toolCallsExecuted: ExecutedToolCall[];
}

export type ToolExecutor = (toolName: string, rawArguments: string) => Promise<string>;

/**
 * Shared hybrid-architecture primitive: runs a chat completion, and whenever the model
 * requests a tool call, executes it via `executeTool` and feeds the JSON result back as a
 * role:"tool" message until the model produces a final answer (or the round limit is hit,
 * in which case one last call is forced without tool access so the user always gets a reply).
 *
 * Used by every production entry point that talks to DeepSeek (IntentRouterService,
 * HandleIncomingMessageUseCase's monolithic fallback, and the standalone HybridChatService)
 * so that costs, curriculum and vacancy answers are ALWAYS grounded in a live Mongo lookup
 * instead of text baked into a prompt.
 */
export async function completeWithTools(
  aiProvider: AiProviderPort,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeTool: ToolExecutor,
): Promise<ToolLoopResult> {
  const conversation: ChatMessage[] = [...messages];
  let totalTokens = 0;
  const toolCallsExecuted: ExecutedToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await aiProvider.complete(conversation, { tools, toolChoice: 'auto' });
    totalTokens += result.totalTokens;

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return { content: result.content, model: result.model, totalTokens, toolCallsExecuted };
    }

    logger.info('[ToolCallingLoop] Model requested tool call(s)', {
      round,
      tools: result.toolCalls.map((c) => c.function.name),
    });

    conversation.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls });

    for (const call of result.toolCalls) {
      const toolResult = await executeTool(call.function.name, call.function.arguments);
      toolCallsExecuted.push({ name: call.function.name, arguments: call.function.arguments });
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: toolResult,
      });
    }
  }

  logger.warn('[ToolCallingLoop] Max tool-call rounds reached — forcing final answer without tools', {
    maxRounds: MAX_TOOL_ROUNDS,
  });
  const finalResult = await aiProvider.complete(conversation);
  totalTokens += finalResult.totalTokens;
  return { content: finalResult.content, model: finalResult.model, totalTokens, toolCallsExecuted };
}
