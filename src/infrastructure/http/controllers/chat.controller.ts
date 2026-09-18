import type { Request, Response } from 'express';
import { z } from 'zod';
import type { HybridChatService } from '../../../application/services/hybrid-chat.service.js';
import type { ChatSessionStore } from '../../ai/chat-session.store.js';
import { logger } from '../../shared/logger.js';
import type { TenantWhatsAppRegistry, WhatsAppAccount } from '../../whatsapp/tenant-whatsapp-registry.js';

const SendMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1, 'message no puede estar vacío').max(2000),
});

export class ChatController {
  constructor(
    private readonly hybridChat: HybridChatService,
    private readonly sessionStore: ChatSessionStore,
    private readonly registry: TenantWhatsAppRegistry,
    private readonly platformKnowledge: string,
  ) {}

  async widgetConfig(req: Request, res: Response): Promise<void> {
    const account = await this.resolveAccount(req);
    if (!account || account.widgetEnabled === false) {
      res.status(404).json({ error: 'Widget no disponible' });
      return;
    }
    res.json(toPublicBranding(account));
  }

  async sendWidgetMessage(req: Request, res: Response): Promise<void> {
    const account = await this.resolveAccount(req);
    if (!account || account.widgetEnabled === false) {
      res.status(404).json({ error: 'Widget no disponible' });
      return;
    }

    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(', ') });
      return;
    }

    const { message } = parsed.data;
    const sessionId = parsed.data.sessionId ?? this.sessionStore.createSession(account.tenantId);
    const history = this.sessionStore.getHistory(sessionId, account.tenantId);
    if (history === null) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }

    this.sessionStore.appendMessage(sessionId, { role: 'user', content: message });

    try {
      const result = await this.hybridChat.chat(
        [...history, { role: 'user', content: message }],
        {
          systemPrompt: widgetSystemPrompt(account, this.platformKnowledge),
          disableTools: !account.isPlatform,
        },
      );
      this.sessionStore.appendMessage(sessionId, { role: 'assistant', content: result.content });
      res.json({
        sessionId,
        reply: result.content,
        botName: account.botName,
      });
    } catch (err) {
      logger.error('[ChatController] Widget chat failed', {
        tenantId: account.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(502).json({
        error: 'No fue posible generar una respuesta en este momento.',
      });
    }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    if (process.env['CHAT_PUBLIC_ENABLED'] !== 'true') {
      res.status(404).json({ error: 'Chat público deshabilitado' });
      return;
    }
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

  private async resolveAccount(req: Request): Promise<WhatsAppAccount | null> {
    const headerHost = headerValue(req.headers['x-store-domain']);
    const originHost = headerValue(req.headers.origin);
    const requestHost = req.hostname;
    return (
      (await this.registry.getByHost(headerHost)) ??
      (await this.registry.getByHost(originHost)) ??
      (await this.registry.getByHost(requestHost))
    );
  }
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function toPublicBranding(account: WhatsAppAccount) {
  return {
    botName: account.botName,
    primaryColor: account.primaryColor ?? null,
    logoUrl: account.logoUrl ?? null,
    welcomeMessage: account.welcomeMessage ?? `Hola, soy ${account.botName}. ¿En qué te ayudo?`,
    widgetEnabled: account.widgetEnabled !== false,
  };
}

function widgetSystemPrompt(account: WhatsAppAccount, platformKnowledge: string): string {
  const knowledge = account.isPlatform
    ? [platformKnowledge, account.knowledge].filter(Boolean).join('\n\n')
    : account.knowledge?.trim() ||
      `Eres el asistente de la tienda. Responde en español, con amabilidad, sin inventar políticas, precios ni stock.`;
  return [
    `Eres ${account.botName}, el asistente de esta tienda.`,
    account.welcomeMessage ? `Saludo: ${account.welcomeMessage}` : '',
    knowledge,
    'No uses datos de otras marcas. Si no sabes algo, pide que escriban por WhatsApp o al correo de la tienda.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
