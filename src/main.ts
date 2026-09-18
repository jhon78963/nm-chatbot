import { connectPrisma, connectCatalogPrisma } from './infrastructure/database/prisma/prisma.client.js';
import { ConversationPrismaRepository } from './infrastructure/database/prisma/repositories/conversation.prisma-repository.js';
import { MessagePrismaRepository } from './infrastructure/database/prisma/repositories/message.prisma-repository.js';
import { AgentPrismaRepository } from './infrastructure/database/prisma/repositories/agent.prisma-repository.js';
import { QuickReplyPrismaRepository } from './infrastructure/database/prisma/repositories/quick-reply.prisma-repository.js';
import { FunnelUserPrismaRepository } from './infrastructure/database/prisma/repositories/funnel-user.prisma-repository.js';
import { UserPrismaRepository } from './infrastructure/database/prisma/repositories/user.prisma-repository.js';
import { NoOpFunnelMessageRepository } from './infrastructure/database/noop-funnel-message.repository.js';
import { DeepSeekAdapter } from './infrastructure/ai/deepseek/deepseek.adapter.js';
import { loadDeepSeekConfig } from './infrastructure/ai/deepseek/deepseek.config.js';
import { WhatsAppController } from './infrastructure/webhooks/meta/whatsapp.controller.js';
import { WhatsAppParserService } from './infrastructure/webhooks/meta/whatsapp-parser.service.js';
import {
  RoutingMetaMediaService,
  RoutingMetaWhatsAppAdapter,
  TenantWhatsAppRegistry,
  type WhatsAppAccount,
} from './infrastructure/whatsapp/tenant-whatsapp-registry.js';
import { LocalMediaStorage } from './infrastructure/storage/local-media.storage.js';
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
import { isPlatformSubdomainOrigin } from './infrastructure/http/platform-cors.js';
import { WebSocketRealtimeAdapter } from './infrastructure/realtime/websocket-realtime.adapter.js';
import { logger } from './infrastructure/shared/logger.js';

async function bootstrap(): Promise<void> {
  await connectPrisma();
  await connectCatalogPrisma();

  if (process.env['CHATBOT_MONGO_ENABLED'] === 'true') {
    logger.warn('[Bootstrap] CHATBOT_MONGO_ENABLED=true — path Mongo/UPRIT opt-in (no es el modo NM)');
  } else {
    logger.info('[Bootstrap] Path Mongo/UPRIT aislado (CHATBOT_MONGO_ENABLED != true)');
  }

  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

  // ERP_JWT_SECRET siempre requerido — no debe usarse JWT_SECRET como fallback
  // para verificar tokens del ERP (evita que tokens del chatbot sean aceptados como ERP).
  if (!process.env['ERP_JWT_SECRET']) {
    throw new Error('ERP_JWT_SECRET environment variable is required');
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
  logger.info('[Bootstrap] Hybrid chat engine initialized', { knowledgeBaseChars: knowledgeBase.length });

  const messageDebounceMs = loadMessageDebounceMs();
  const messageDebouncer = new MessageBatchDebouncer(messageDebounceMs);
  logger.info('[Bootstrap] Message batch debounce configured', {
    delayMs: messageDebounceMs,
    enabled: messageDebouncer.enabled,
  });

  const promptBuilder = new SystemPromptBuilderService();

  // ── Messaging provider + Media (env = Maritex; el resto sale de Integraciones) ──
  const envToken = process.env['META_WHATSAPP_TOKEN']?.trim() ?? '';
  const envPhoneNumberId = process.env['META_WHATSAPP_PHONE_NUMBER_ID']?.trim() ?? '';
  const platformTenantId =
    process.env['CHATBOT_TENANT_ID']?.trim() ||
    process.env['ECOMMERCE_TENANT_ID']?.trim() ||
    'b14b2a6d-ff01-57e4-9004-7ece99dc46d9';
  const envAccount: WhatsAppAccount | null =
    envToken && envPhoneNumberId
      ? {
          tenantId: platformTenantId,
          isPlatform: true,
          botName: process.env['CHATBOT_BOT_NAME']?.trim() || 'Malu',
          token: envToken,
          phoneNumberId: envPhoneNumberId,
          ...(process.env['META_WEBHOOK_VERIFY_TOKEN']?.trim()
            ? { verifyToken: process.env['META_WEBHOOK_VERIFY_TOKEN'].trim() }
            : {}),
          ...(process.env['WEBHOOK_SECRET']?.trim()
            ? { appSecret: process.env['WEBHOOK_SECRET'].trim() }
            : {}),
          ...(process.env['META_WHATSAPP_DISPLAY_PHONE']?.trim()
            ? { displayPhone: process.env['META_WHATSAPP_DISPLAY_PHONE'].trim() }
            : {}),
          ...(process.env['STORE_URL']?.trim()
            ? { storeUrl: process.env['STORE_URL'].trim() }
            : {}),
        }
      : null;
  const whatsAppRegistry = new TenantWhatsAppRegistry(envAccount);
  const chatController = new ChatController(
    hybridChatService,
    chatSessionStore,
    whatsAppRegistry,
    knowledgeBase,
  );
  const metaMediaService = new RoutingMetaMediaService(whatsAppRegistry);
  const localMediaStorage = new LocalMediaStorage(
    process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads',
  );
  const metaAdapter = new RoutingMetaWhatsAppAdapter(whatsAppRegistry);

  logger.info('[Bootstrap] Media storage initialized', {
    path: process.env['MEDIA_STORAGE_PATH'] ?? '/app/uploads',
    platformWhatsApp: Boolean(envAccount),
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
    whatsAppRegistry,
  );

  const webhookRouter = createWebhookRouter(whatsAppController, whatsAppRegistry);
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
    whatsAppRegistry,
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
    isAllowedOrigin: async (origin) => {
      if (isPlatformSubdomainOrigin(origin, process.env['PLATFORM_PUBLIC_DOMAIN'])) {
        return true;
      }
      return whatsAppRegistry.getByHost(origin).then(Boolean);
    },
  }, quickRepliesRouter, chatRouter);

  realtimeAdapter.start(httpServer);
}

bootstrap().catch((err: unknown) => {
  logger.error('[Bootstrap] Fatal error starting application', { error: err });
  process.exit(1);
});
