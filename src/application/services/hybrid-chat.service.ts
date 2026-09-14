import type { AiProviderPort, ChatMessage } from '../ports/ai-provider.port.js';
import type { ProductToolsService } from '../../infrastructure/ai/tools/product-tools.service.js';
import { PRODUCT_TOOLS } from '../../infrastructure/ai/tools/product-tools.definitions.js';
import { completeWithTools, type ToolLoopResult } from '../../infrastructure/ai/tool-calling-loop.js';
import { withCurrentDateContext } from '../../infrastructure/shared/current-date-context.js';

export type HybridChatResult = ToolLoopResult;

/**
 * Hybrid chat: static knowledge in system prompt + dynamic catalog data via tool calling.
 */
export class HybridChatService {
  constructor(
    private readonly aiProvider: AiProviderPort,
    private readonly toolsService: ProductToolsService,
    private readonly systemPrompt: string,
  ) {}

  async chat(
    history: ChatMessage[],
    options?: { customerPhone?: string },
  ): Promise<HybridChatResult> {
    if (options?.customerPhone) {
      this.toolsService.setCartContext(options.customerPhone);
    }

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: withCurrentDateContext(this.systemPrompt) },
        ...history,
      ];
      return await completeWithTools(this.aiProvider, messages, PRODUCT_TOOLS, (name, args) =>
        this.toolsService.execute(name, args),
      );
    } finally {
      this.toolsService.clearCartContext();
    }
  }
}
