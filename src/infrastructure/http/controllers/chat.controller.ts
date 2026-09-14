import type { Request, Response } from 'express';
import { z } from 'zod';
import type { HybridChatService } from '../../../application/services/hybrid-chat.service.js';
import type { ChatSessionStore } from '../../ai/chat-session.store.js';
import { logger } from '../../shared/logger.js';

const SendMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1, 'message no puede estar vacío').max(2000),
});

/**
 * HTTP controller for the standalone hybrid chat engine (DeepSeek + tool calling + MongoDB).
 * Intended for testing/demoing the engine (e.g. from Postman or a web widget) independently
 * of the production WhatsApp pipeline.
 */
export class ChatController {
  constructor(
    private readonly hybridChat: HybridChatService,
    private readonly sessionStore: ChatSessionStore,
  ) {}

  async sendMessage(req: Request, res: Response): Promise<void> {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(', ') });
      return;
    }

    const { message } = parsed.data;
    const sessionId = parsed.data.sessionId ?? this.sessionStore.createSession();

    const history = this.sessionStore.getHistory(sessionId);
    if (history === null) {
      res.status(404).json({ error: `Sesión no encontrada: ${sessionId}` });
      return;
    }

    this.sessionStore.appendMessage(sessionId, { role: 'user', content: message });

    try {
      const result = await this.hybridChat.chat([...history, { role: 'user', content: message }]);

      this.sessionStore.appendMessage(sessionId, { role: 'assistant', content: result.content });

      res.json({
        sessionId,
        reply: result.content,
        model: result.model,
        tokensUsed: result.totalTokens,
        toolCallsExecuted: result.toolCallsExecuted,
      });
    } catch (err) {
      logger.error('[ChatController] Failed to generate hybrid chat response', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(502).json({
        error: 'No fue posible generar una respuesta en este momento. Intenta nuevamente en unos segundos.',
      });
    }
  }
}
