import { connectPrisma } from './infrastructure/database/prisma/prisma.client.js';
import { ConversationPrismaRepository } from './infrastructure/database/prisma/repositories/conversation.prisma-repository.js';
import { MessagePrismaRepository } from './infrastructure/database/prisma/repositories/message.prisma-repository.js';
import { AgentPrismaRepository } from './infrastructure/database/prisma/repositories/agent.prisma-repository.js';
import { QuickReplyPrismaRepository } from './infrastructure/database/prisma/repositories/quick-reply.prisma-repository.js';
import { FunnelUserPrismaRepository } from './infrastructure/database/prisma/repositories/funnel-user.prisma-repository.js';
import { UserPrismaRepository } from './infrastructure/database/prisma/repositories/user.prisma-repository.js';
import { NoOpFunnelMessageRepository } from './infrastructure/database/noop-funnel-message.repository.js';
import { DeepSeekAdapter } from './infrastructure/ai/deepseek/deepseek.adapter.js';
import { loadDeepSeekConfig } from './infrastructure/ai/deepseek/deepseek.config.js';
import { MetaWhatsAppAdapter } from './infrastructure/webhooks/meta/meta-whatsapp.adapter.js';
import { MetaMediaService } from './infrastructure/webhooks/meta/meta-media.service.js';
import { LocalMediaStorage } from './infrastructure/storage/local-media.storage.js';
import { WhatsAppController } from './infrastructure/webhooks/meta/whatsapp.controller.js';
import { WhatsAppParserService } from './infrastructure/webhooks/meta/whatsapp-parser.service.js';
import { HandleIncomingMessageUseCase } from './application/use-cases/handle-incoming-message/handle-incoming-message.usecase.js';
import { HandleMessageStatusUseCase } from './application/use-cases/handle-message-status/handle-message-status.usecase.js';
import { SystemPromptBuilderService } from './application/services/system-prompt-builder.service.js';
import { RealtimeNotifier } from './application/services/realtime-notifier.service.js';
import { createWebhookRouter } from './infrastructure/http/routes/webhook.routes.js';
import { createAuthRouter } from './infrastructure/http/routes/auth.routes.js';
import { createAgentInboxRouter } from './infrastructure/http/routes/agent-inbox.routes.js';
import { createQuickRepliesRouter } from './infrastructure/http/routes/quick-replies.routes.js';
import { ProductToolsService } from './infrastructure/ai/tools/product-tools.service.js';
import { EcommerceGuestCartClient } from './infrastructure/http/ecommerce-guest-cart.client.js';
import { loadKnowledgeBase, resolveKnowledgeBasePath } from './infrastructure/ai/knowledge/knowledge-base.loader.js';
import { ChatSessionStore } from './infrastructure/ai/chat-session.store.js';
import { HybridChatService } from './application/services/hybrid-chat.service.js';
import {
  MessageBatchDebouncer,
  loadMessageDebounceMs,
} from './application/services/message-batch-debouncer.service.js';
import { ChatController } from './infrastructure/http/controllers/chat.controller.js';
import { createChatRouter } from './infrastructure/http/routes/chat.routes.js';
import { createServer } from './infrastructure/http/server.js';
import { WebSocketRealtimeAdapter } from './infrastructure/realtime/websocket-realtime.adapter.js';
import { logger } from './infrastructure/shared/logger.js';

async function bootstrap(): Promise<void> {
  await connectPrisma();

  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

  if (process.env['ERP_SSO_ONLY'] === 'true' && !process.env['ERP_JWT_SECRET']) {
    throw new Error('ERP_JWT_SECRET environment variable is required when ERP_SSO_ONLY=true');
  }

  // ── Repositories (PostgreSQL / Prisma) ────────────────────────────────────
  const conversationRepo = new ConversationPrismaRepository();
  const messageRepo = new MessagePrismaRepository();
  const agentRepo = new AgentPrismaRepository();
  const funnelUserRepo = new FunnelUserPrismaRepository();
  const quickReplyRepo = new QuickReplyPrismaRepository();
  const userRepo = new UserPrismaRepository();
  const funnelMessageRepo = new NoOpFunnelMessageRepository();

  // ── AI ────────────────────────────────────────────────────────────────────
  const deepSeekConfig = loadDeepSeekConfig();
  const deepSeekAdapter = new DeepSeekAdapter(deepSeekConfig);
  logger.info('[Bootstrap] AI engine initialized', { model: deepSeekConfig.model });

  const guestCartClient = EcommerceGuestCartClient.fromEnv();
  logger.info('[Bootstrap] Ecommerce guest cart client configured', {
    enabled: guestCartClient.enabled,
  });

  // ── Hybrid chat (DeepSeek + knowledge_base.md + catálogo NM) ──────────────
  const productToolsService = new ProductToolsService(guestCartClient);
  const knowledgeBase = loadKnowledgeBase(resolveKnowledgeBasePath());
  const hybridChatService = new HybridChatService(deepSeekAdapter, productToolsService, knowledgeBase);
  const chatSessionStore = new ChatSessionStore();
  const chatController = new ChatController(hybridChatService, chatSessionStore);
  logger.info('[Bootstrap] Hybrid chat engine initialized', { knowledgeBaseChars: knowledgeBase.length });

  const messageDebounceMs = loadMessageDebounceMs();
  const messageDebouncer = new MessageBatchDebouncer(messageDebounceMs);
  logger.info('[Bootstrap] Message batch debounce configured', {
    delayMs: messageDebounceMs,
    enabled: messageDebouncer.enabled,
  });

  const promptBuilder = new SystemPromptBuilderService();

  // ── Messaging provider + Media ────────────────────────────────────────────
  const metaMediaConfig = {
    token: process.env['META_WHATSAPP_TOKEN'] ?? '',
    phoneNumberId: process.env['META_WHATSAPP_PHONE_NUMBER_ID'] ?? '',
    apiVersion: process.env['META_API_VERSION'] ?? 'v20.0',
    baseUrl: process.env['META_API_BASE_URL'] ?? 'https://graph.facebook.com',
  };
  const metaMediaService = new MetaMediaService(metaMediaConfig);
  const localMediaStorage = new LocalMediaStorage(
    process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads',
  );
  const metaAdapter = new MetaWhatsAppAdapter(metaMediaConfig, metaMediaService);

  logger.info('[Bootstrap] Media storage initialized', {
    path: process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads',
  });

  // ── Realtime ──────────────────────────────────────────────────────────────
  const realtimeAdapter = new WebSocketRealtimeAdapter({
    jwtSecret,
    heartbeatMs: Number(process.env['WS_HEARTBEAT_MS'] ?? 30_000),
  });
  const realtimeNotifier = new RealtimeNotifier(realtimeAdapter);

  // ── Use cases ─────────────────────────────────────────────────────────────
  const handleIncomingMessage = new HandleIncomingMessageUseCase(
    conversationRepo,
    userRepo,
    deepSeekAdapter,
    metaAdapter,
    undefined,
    promptBuilder,
    agentRepo,
    undefined,
    funnelUserRepo,
    funnelMessageRepo,
    messageRepo,
    realtimeNotifier,
    metaMediaService,
    localMediaStorage,
    undefined,
    hybridChatService,
    productToolsService,
    knowledgeBase,
    messageDebouncer,
    guestCartClient,
  );

  const handleMessageStatus = new HandleMessageStatusUseCase(
    messageRepo,
    conversationRepo,
    realtimeNotifier,
  );

  // ── HTTP + WebSocket ───────────────────────────────────────────────────────
  const whatsAppParser = new WhatsAppParserService();
  const whatsAppController = new WhatsAppController(
    whatsAppParser,
    handleIncomingMessage,
    handleMessageStatus,
    process.env['META_WEBHOOK_VERIFY_TOKEN'] ?? '',
  );

  const webhookRouter = createWebhookRouter(whatsAppController);
  const authRouter = createAuthRouter(agentRepo);
  const agentInboxRouter = createAgentInboxRouter(
    conversationRepo,
    userRepo,
    funnelUserRepo,
    agentRepo,
    metaAdapter,
    funnelMessageRepo,
    metaMediaService,
    localMediaStorage,
    realtimeNotifier,
    messageRepo,
  );
  const quickRepliesRouter = createQuickRepliesRouter(quickReplyRepo);
  const chatRouter = createChatRouter(chatController);

  const corsOrigins = [
    ...(process.env['CORS_ORIGINS'] ?? '').split(',').filter(Boolean),
    ...(process.env['ADMIN_CORS_ORIGIN'] ? [process.env['ADMIN_CORS_ORIGIN']] : []),
    'http://localhost:5173',
  ];

  const { httpServer } = createServer(webhookRouter, authRouter, agentInboxRouter, {
    port: Number(process.env['PORT'] ?? 3000),
    corsOrigins: [...new Set(corsOrigins)],
    mediaStoragePath: process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads',
  }, quickRepliesRouter, chatRouter);

  realtimeAdapter.start(httpServer);
}

bootstrap().catch((err: unknown) => {
  logger.error('[Bootstrap] Fatal error starting application', { error: err });
  process.exit(1);
});
