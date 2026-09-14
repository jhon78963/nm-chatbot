import { randomUUID } from 'node:crypto';
import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { UserRepository } from '../../../domain/repositories/user.repository.js';
import type { ProgramRepository } from '../../../domain/repositories/program.repository.js';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import {
  getHandoffAssignAgentUsername,
  getHandoffExcludedUsernames,
  isHandoffExcludedAgent,
} from '../../services/handoff-excluded-agents.js';
import {
  buildHandoffAssignedLeadMessage,
  buildHandoffPendingLeadMessage,
  appendCartHandoffDeepLink,
} from '../../services/handoff-lead-messages.service.js';
import type { AiProviderPort, ChatMessage } from '../../ports/ai-provider.port.js';
import type { MessagingProviderPort } from '../../ports/messaging-provider.port.js';
import type { MediaStoragePort } from '../../ports/media-storage.port.js';
import type { SystemPromptBuilderService } from '../../services/system-prompt-builder.service.js';
import type { HybridChatService } from '../../services/hybrid-chat.service.js';
import type { IntentRouterService, ForcedRoutingGroup } from '../../services/intent-router.service.js';
import {
  parseMenuSelection,
  parseCategoryDigitSelection,
  getCategoryDigitResponse,
  isMainMenuTrigger,
  isGreeting,
  buildMainMenuList,
  getCampusLocationFromEnv,
  getWelcomeMessage,
  getStoreLinkMessage,
  isInteractiveHandoffEnabled,
  MENU_ROW_IDS,
  MENU_INTENT_PHRASES,
  HANDOFF_BUTTON_IDS,
  type MenuSelection,
} from '../../services/bot-menu.service.js';
import type { FunnelUserPrismaRepository } from '../../../infrastructure/database/prisma/repositories/funnel-user.prisma-repository.js';
import type { FunnelMessageMongoRepository } from '../../../infrastructure/database/mongodb/repositories/funnel-message.mongo-repository.js';
import type { MessageRepository } from '../../../domain/repositories/message.repository.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';
import { PhoneNumber } from '../../../domain/value-objects/phone-number.vo.js';
import { MessageId } from '../../../domain/value-objects/message-id.vo.js';
import { User } from '../../../domain/entities/user.entity.js';
import { Message } from '../../../domain/entities/message.entity.js';
import type { MessageContentType } from '../../../domain/entities/message.entity.js';
import { Conversation } from '../../../domain/entities/conversation.entity.js';
import type { MetaMediaService } from '../../../infrastructure/webhooks/meta/meta-media.service.js';
import {
  SendProgramBrochureUseCase,
  isBrochureRequest,
} from '../send-program-brochure/send-program-brochure.usecase.js';
import type { Program } from '../../../domain/entities/program.entity.js';
import type {
  HandleIncomingMessageDto,
  HandleIncomingMessageResult,
} from './handle-incoming-message.dto.js';
import { formatWhatsAppText } from '../../../infrastructure/webhooks/meta/format-whatsapp-text.js';
import { logAgentAudit } from '../../../infrastructure/shared/agent-audit.logger.js';
import { resolveContactName } from '../../../infrastructure/shared/resolve-contact-name.js';
import { logger } from '../../../infrastructure/shared/logger.js';
import type { Agent } from '../../../domain/entities/agent.entity.js';
import type { HandoffBy } from '../../../domain/entities/conversation.entity.js';
import type { ProductToolsService } from '../../../infrastructure/ai/tools/product-tools.service.js';
import type {
  EcommerceGuestCartClient,
  WhatsAppGuestCartHandoffResult,
} from '../../../infrastructure/http/ecommerce-guest-cart.client.js';
import { PRODUCT_TOOLS } from '../../../infrastructure/ai/tools/product-tools.definitions.js';
import { completeWithTools } from '../../../infrastructure/ai/tool-calling-loop.js';
import { parseStructuredAiResponse } from '../../../infrastructure/ai/parse-structured-ai-response.js';
import { withCurrentDateContext } from '../../../infrastructure/shared/current-date-context.js';
import {
  MessageBatchDebouncer,
  joinBatchedUserTexts,
  type BatchedInboundText,
} from '../../services/message-batch-debouncer.service.js';
import {
  detectHandoffTriggerToken,
  detectImplicitHandoffPromise,
  isExplicitHandoffRequest,
  isHandoffAffirmative,
  isStaleHandoffConfirmation,
} from '../../services/handoff-detection.service.js';
import {
  buildPdpBatchPurchaseHandoffPrompt,
  buildPdpPurchaseHandoffPrompt,
  mapPdpIntentToGuestCartItem,
  parseAllPdpPurchaseIntents,
  parsePdpPurchaseMessage,
  type ParsedPdpPurchaseIntent,
} from '../../services/ecommerce-pdp-purchase.service.js';
import {
  buildB2bQuoteHandoffPrompt,
  parseB2bQuoteMessage,
} from '../../services/ecommerce-b2b-quote.service.js';
import { shouldBotRespondToInbound } from '../../services/commercial-interest-filter.service.js';
import {
  buildGuestCartCheckoutHandoffPrompt,
  fetchGuestCartOpeningSummary,
  isGuestCartCheckoutRequest,
  isGuestCartSyncRequest,
  prependGuestCartSummary,
} from '../../services/whatsapp-guest-cart-summary.service.js';

const CONTEXT_WINDOW_SIZE = 10;
const MAX_CONSECUTIVE_HANDOFFS = 3;

/** IntentRouter canned replies when DB prompts fail — hybrid chat should take over instead. */
const ROUTER_FALLBACK_PATTERN =
  /no pude procesar esa consulta|no pude obtener esa informaci[oó]n/i;

function botName(): string {
  return process.env['BOT_NAME'] ?? 'Malu';
}

const FALLBACK_SYSTEM_PROMPT =
  `Eres ${botName()}, asistente virtual de Maritex (Novedades Maritex). Responde de manera concisa, amable y en el mismo idioma que el usuario. Usa texto plano sin markdown porque el canal es WhatsApp. ` +
  'REGLA CRITICA: Cuando no tengas informacion suficiente o el usuario pida hablar con un asesor, tu respuesta debe ser EXCLUSIVAMENTE el token: HANDOFF_TRIGGER — sin ningún texto antes ni después.';

const HANDOFF_CONFIRMATION_MSG =
  '¿Deseas que te contacte un asesor de Maritex para brindarte información personalizada?';

const HANDOFF_DECLINED_MSG =
  'Entendido, con gusto seguiré ayudándote. ¿En qué más puedo asistirte?';

const HANDOFF_LOOP_MSG =
  'Veo que no he podido darte la información que buscas. Un asesor de Maritex se pondrá en contacto contigo para ayudarte de forma personalizada.';

const DEFAULT_AUTO_REPLY_UNSUPPORTED_MEDIA =
  'Recibí tu archivo. Por favor cuéntame en texto tu consulta o espera a un asesor.';

/**
 * Orchestrates inbound WhatsApp messages: persist, call AI, and reply.
 * Handles the full handoff flow (HANDOFF_TRIGGER detection, confirmation, agent notification,
 * and loop detection after 3 consecutive unanswered interactions).
 */
export class HandleIncomingMessageUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly userRepo: UserRepository,
    private readonly aiProvider: AiProviderPort,
    private readonly messagingProvider: MessagingProviderPort,
    private readonly programRepo?: ProgramRepository,
    private readonly promptBuilder?: SystemPromptBuilderService,
    private readonly agentRepo?: AgentRepository,
    private readonly intentRouter?: IntentRouterService,
    private readonly funnelUserRepo?: FunnelUserPrismaRepository,
    private readonly funnelMessageRepo?: FunnelMessageMongoRepository,
    private readonly messageRepo?: MessageRepository,
    private readonly realtimeNotifier?: RealtimeNotifier,
    private readonly metaMediaService?: MetaMediaService,
    private readonly mediaStorage?: MediaStoragePort,
    private readonly sendProgramBrochure?: SendProgramBrochureUseCase,
    /** Primary hybrid engine (knowledge_base.md + Mongo tool calling) for menu routes and router fallbacks. */
    private readonly hybridChat?: HybridChatService,
    /** Hybrid-architecture guardrail — used only by the monolithic prompt fallback (runMonolithicPrompt). */
    private readonly productToolsService?: ProductToolsService,
    /** Static institutional knowledge (context/knowledge_base.md) + strict tool-usage rule. */
    private readonly knowledgeBaseOverlay?: string,
    /**
     * Batches rapid consecutive text messages per phone into one AI turn.
     * Does not change reply style — only when AI is invoked.
     */
    private readonly messageDebouncer?: MessageBatchDebouncer,
    /** Guest checkout Redis cart in ecommerce-service (hashed session, never POS). */
    private readonly guestCartClient?: EcommerceGuestCartClient,
  ) {}

  async execute(dto: HandleIncomingMessageDto): Promise<HandleIncomingMessageResult> {
    const phoneNumber = PhoneNumber.create(dto.fromPhoneNumber);

    const existingConversation = await this.conversationRepo.findActiveByPhoneNumber(phoneNumber.value);
    if (
      !shouldBotRespondToInbound({
        content: dto.content,
        ...(dto.caption !== undefined && { caption: dto.caption }),
        ...(dto.interactiveReplyId !== undefined && { interactiveReplyId: dto.interactiveReplyId }),
        conversation: existingConversation,
      })
    ) {
      logger.info('[HandleIncomingMessage] Ignoring message without commercial interest', {
        phone: phoneNumber.value,
        preview: dto.content.slice(0, 120),
        externalMessageId: dto.externalMessageId,
      });
      return {
        conversationId: existingConversation?.id ?? '',
        userMessageId: '',
        aiResponseId: '',
        aiResponseContent: '',
      };
    }

    // ── 1. Upsert user — always resolved before anything else ────────────
    let user = await this.userRepo.findByPhoneNumber(phoneNumber);
    if (!user) {
      user = User.create({
        id: randomUUID(),
        phoneNumber,
        ...(dto.profileName !== undefined && { name: dto.profileName }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      user = await this.userRepo.save(user);
      logger.info('[HandleIncomingMessage] New user created', { phone: phoneNumber.value });
    } else if (dto.profileName && !user.name) {
      user = user.updateName(dto.profileName);
      user = await this.userRepo.save(user);
    }

    // ── 2. Upsert conversation — persist to DB immediately so context is never lost ──
    let conversation = existingConversation;
    let isFirstMessage = false;
    if (!conversation) {
      isFirstMessage = true;
      const systemPrompt = await this.buildSystemPrompt();
      conversation = Conversation.create({
        id: randomUUID(),
        userId: user.id,
        phoneNumber: phoneNumber.value,
        status: 'active',
        messages: [],
        systemPrompt,
        mode: 'bot',
        handoffState: 'none',
        consecutiveHandoffs: 0,
        assignedAgentId: null,
        handoffAt: null,
        handoffBy: null,
        lastUserMessageAt: null,
        lastAgentMessageAt: null,
        unreadCountAgent: 0,
        careerId: null,
        metaData: null,
        currentProgramName: null,
        labels: [],
        pinned: false,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Persist immediately so a simultaneous message won't create a duplicate conversation
      await this.conversationRepo.save(conversation);
      logger.info('[HandleIncomingMessage] New conversation created and persisted', {
        conversationId: conversation.id,
        phone: phoneNumber.value,
      });
    }

    // ── Idempotency: skip duplicate Meta message IDs ─────────────────────
    if (this.messageRepo && dto.externalMessageId) {
      const existing = await this.messageRepo.findByExternalId(dto.externalMessageId);
      if (existing) {
        logger.debug('[HandleIncomingMessage] Duplicate externalMessageId — skipping', {
          externalMessageId: dto.externalMessageId,
          conversationId: existing.conversationId,
        });
        return {
          conversationId: existing.conversationId,
          userMessageId: existing.id.value,
          aiResponseId: '',
          aiResponseContent: '',
        };
      }
    }

    // Guest cart must update even in human mode (post-handoff NM-PDP / batch cart sync).
    await this.tryPersistGuestCartFromInbound(phoneNumber.value, dto.content);

    // ── 3. Human mode: bot silenced — queue message for assigned agent ───
    if (conversation.isHumanMode()) {
      this.messageDebouncer?.cancel(phoneNumber.value);
      return this.handleHumanModeInbound(conversation, dto, phoneNumber.value);
    }

    // ── 4. Handoff pending: user is answering the yes/no confirmation ────
    if (conversation.handoffState === 'pending') {
      this.messageDebouncer?.cancel(phoneNumber.value);
      return this.handlePendingHandoffReply(conversation, dto, phoneNumber.value);
    }

    // ── 5. Bot mode + non-text media: auto-reply, no DeepSeek ────────────
    if (this.isNonTextMedia(dto)) {
      return this.handleBotModeMediaInbound(conversation, dto, phoneNumber.value);
    }

    // --- Normal text message processing ---
    const userMessage = await this.createUserMessage(conversation, dto);

    conversation = conversation
      .addMessage(userMessage)
      .withLastUserMessageAt(new Date(dto.timestamp));
    await this.conversationRepo.save(conversation);

    // ── Upsert funnel_users so the admin panel can see this lead ──────────
    const funnelUserId = await this.upsertFunnelUser(phoneNumber.value, dto.profileName);

    // Save the inbound message to funnel_messages
    await this.saveFunnelMessage(
      funnelUserId,
      dto.content,
      'user',
      this.funnelMediaMeta(dto, userMessage.mediaUrl),
    );

    // ── F8: menu list selection → mapped flow ─────────────────────────────
    const menuSelection = parseMenuSelection(dto.interactiveReplyId);
    if (menuSelection) {
      this.messageDebouncer?.cancel(phoneNumber.value);
      return this.handleMenuSelection({
        selection: menuSelection,
        conversation,
        dto,
        phoneNumberValue: phoneNumber.value,
        funnelUserId,
        userMessage,
      });
    }

    // ── F8: saludo inicial → bienvenida fija + resumen de carrito si aplica ─
    if (isFirstMessage && isGreeting(dto.content)) {
      this.messageDebouncer?.cancel(phoneNumber.value);
      const cartSummary = await fetchGuestCartOpeningSummary(
        this.guestCartClient,
        phoneNumber.value,
      );
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue: phoneNumber.value,
        funnelUserId,
        userMessage,
        aiContent: prependGuestCartSummary(getWelcomeMessage(), cartSummary),
        aiModel: 'welcome',
        aiTokens: 0,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    // ── F8: main menu (keyword) — send fixed Maritex welcome ─
    if (isMainMenuTrigger(dto.content, isFirstMessage)) {
      this.messageDebouncer?.cancel(phoneNumber.value);
      const cartSummary = await fetchGuestCartOpeningSummary(
        this.guestCartClient,
        phoneNumber.value,
      );
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue: phoneNumber.value,
        funnelUserId,
        userMessage,
        aiContent: prependGuestCartSummary(getWelcomeMessage(), cartSummary),
        aiModel: 'welcome',
        aiTokens: 0,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    // ── Welcome menu digit (1–4) → fixed category reply without AI ─────────
    const categoryDigit = parseCategoryDigitSelection(dto.content);
    if (categoryDigit) {
      this.messageDebouncer?.cancel(phoneNumber.value);
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue: phoneNumber.value,
        funnelUserId,
        userMessage,
        aiContent: getCategoryDigitResponse(categoryDigit),
        aiModel: 'category-menu',
        aiTokens: 0,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    // ── F7: explicit brochure request → send PDF or link without AI ────────
    if (
      this.sendProgramBrochure &&
      (dto.contentType ?? 'text') === 'text' &&
      isBrochureRequest(dto.content)
    ) {
      this.messageDebouncer?.cancel(phoneNumber.value);
      const program = await this.resolveProgramForBrochure(conversation, dto.content);
      if (program) {
        return this.handleBrochureRequest({
          conversation,
          phoneNumberValue: phoneNumber.value,
          funnelUserId,
          userMessage,
          program,
        });
      }
    }

    // ── Debounce rapid consecutive texts into one AI turn ─────────────────
    // Messages are already persisted above; only the AI reply is delayed.
    if (this.messageDebouncer?.enabled) {
      const pending: BatchedInboundText = {
        content: dto.content,
        externalMessageId: dto.externalMessageId,
        userMessageId: userMessage.id.value,
        conversationId: conversation.id,
        funnelUserId,
        isFirstMessage,
        timestamp: dto.timestamp,
        ...(dto.profileName !== undefined && { profileName: dto.profileName }),
      };

      this.messageDebouncer.schedule(phoneNumber.value, pending, async (batch) => {
        await this.flushDebouncedTextBatch(phoneNumber.value, batch);
      });

      return {
        conversationId: conversation.id,
        userMessageId: userMessage.id.value,
        aiResponseId: '',
        aiResponseContent: '',
      };
    }

    return this.generateAndDeliverAiReply({
      conversation,
      phoneNumberValue: phoneNumber.value,
      funnelUserId,
      userMessage,
      userContent: dto.content,
      isFirstMessage,
      ...(dto.profileName !== undefined && { profileName: dto.profileName }),
    });
  }

  /**
   * After the debounce window, reload conversation and answer once for the whole batch.
   */
  private async flushDebouncedTextBatch(
    phoneNumberValue: string,
    batch: BatchedInboundText[],
  ): Promise<void> {
    if (batch.length === 0) return;

    const last = batch[batch.length - 1]!;
    const conversation = await this.conversationRepo.findById(last.conversationId);
    if (!conversation) {
      logger.warn('[HandleIncomingMessage] Debounced batch dropped — conversation missing', {
        conversationId: last.conversationId,
        batchSize: batch.length,
      });
      return;
    }

    if (conversation.isHumanMode() || conversation.handoffState === 'pending') {
      logger.info('[HandleIncomingMessage] Debounced batch skipped — conversation left bot mode', {
        conversationId: conversation.id,
        mode: conversation.mode,
        handoffState: conversation.handoffState,
        batchSize: batch.length,
      });
      return;
    }

    const combinedContent = joinBatchedUserTexts(batch.map((item) => item.content));
    if (!combinedContent) {
      logger.warn('[HandleIncomingMessage] Debounced batch dropped — empty combined text', {
        conversationId: last.conversationId,
        batchSize: batch.length,
      });
      return;
    }

    const userMessage =
      conversation.messages.find((m) => m.id.value === last.userMessageId) ??
      conversation.messages.filter((m) => m.role === 'user').at(-1);

    if (!userMessage) {
      logger.warn('[HandleIncomingMessage] Debounced batch dropped — user message missing', {
        conversationId: conversation.id,
        userMessageId: last.userMessageId,
      });
      return;
    }

    logger.info('[HandleIncomingMessage] Processing debounced text batch', {
      conversationId: conversation.id,
      phone: phoneNumberValue,
      batchSize: batch.length,
      combinedLength: combinedContent.length,
    });

    await this.generateAndDeliverAiReply({
      conversation,
      phoneNumberValue,
      funnelUserId: last.funnelUserId,
      userMessage,
      userContent: combinedContent,
      isFirstMessage: batch.some((item) => item.isFirstMessage),
      ...(last.profileName !== undefined && { profileName: last.profileName }),
      ...(batch.length > 1 && { collapseTrailingUserMessages: batch.length }),
    });
  }

  /**
   * Existing AI pipeline (intent router → hybrid → monolithic). Unchanged reply behavior;
   * only the userContent may be a joined multi-bubble batch.
   */
  private async generateAndDeliverAiReply(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
    userContent: string;
    isFirstMessage: boolean;
    profileName?: string;
    /** When set, collapse the last N consecutive user bubbles into one turn for hybrid chat. */
    collapseTrailingUserMessages?: number;
  }): Promise<HandleIncomingMessageResult> {
    let {
      conversation,
      phoneNumberValue,
      funnelUserId,
      userMessage,
      userContent,
      isFirstMessage,
      profileName,
      collapseTrailingUserMessages,
    } = params;

    const recentAssistantTexts = conversation
      .getLastNMessages(5)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content);

    if (isStaleHandoffConfirmation(userContent, recentAssistantTexts)) {
      logger.info('[HandleIncomingMessage] Stale handoff confirmation — activating handoff', {
        phone: phoneNumberValue,
      });
      const agent = await this.pickAgent();
      return this.activateHumanHandoff({
        conversation,
        phoneNumberValue,
        funnelUserId,
        handoffBy: 'user',
        userMessage,
        agent,
      });
    }

    if (isExplicitHandoffRequest(userContent)) {
      logger.info('[HandleIncomingMessage] Explicit handoff request detected', {
        phone: phoneNumberValue,
      });
      return this.startHandoffConfirmation({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
      });
    }

    const pdpPurchaseIntents = parseAllPdpPurchaseIntents(userContent);
    if (pdpPurchaseIntents.length > 0) {
      const primary = pdpPurchaseIntents[0]!;
      logger.info('[HandleIncomingMessage] PDP WhatsApp purchase intent detected', {
        phone: phoneNumberValue,
        productCount: pdpPurchaseIntents.length,
        productName: primary.productName,
        sku: primary.sku,
      });

      await this.updateFunnelUserCategory(funnelUserId, 'ready_to_buy');

      const confirmBody =
        pdpPurchaseIntents.length > 1
          ? buildPdpBatchPurchaseHandoffPrompt(pdpPurchaseIntents.length)
          : buildPdpPurchaseHandoffPrompt(primary);

      return this.startHandoffConfirmation({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
        confirmBody,
      });
    }

    if (isGuestCartSyncRequest(userContent)) {
      const cartHandoff = await this.resolveCartHandoff(phoneNumberValue);
      if (cartHandoff?.cart && cartHandoff.cart.itemCount > 0) {
        logger.info('[HandleIncomingMessage] Guest cart sync intent detected', {
          phone: phoneNumberValue,
          itemCount: cartHandoff.cart.itemCount,
        });
        await this.updateFunnelUserCategory(funnelUserId, 'ready_to_buy');
        return this.startHandoffConfirmation({
          conversation,
          phoneNumberValue,
          funnelUserId,
          userMessage,
          confirmBody: buildGuestCartCheckoutHandoffPrompt(
            cartHandoff.cart.itemCount,
            cartHandoff.cart.total,
          ),
        });
      }
    }

    const b2bQuoteIntent = parseB2bQuoteMessage(userContent);
    if (b2bQuoteIntent) {
      logger.info('[HandleIncomingMessage] B2B wholesale quote intent detected', {
        phone: phoneNumberValue,
        quoteNumber: b2bQuoteIntent.quoteNumber,
        businessName: b2bQuoteIntent.businessName,
      });

      await this.updateFunnelUserCategory(funnelUserId, 'ready_to_buy');

      return this.startHandoffConfirmation({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
        confirmBody: buildB2bQuoteHandoffPrompt(b2bQuoteIntent),
      });
    }

    if (isGuestCartCheckoutRequest(userContent)) {
      const cartHandoff = await this.resolveCartHandoff(phoneNumberValue);
      if (cartHandoff?.cart && cartHandoff.cart.itemCount > 0) {
        logger.info('[HandleIncomingMessage] Guest cart checkout intent detected', {
          phone: phoneNumberValue,
          itemCount: cartHandoff.cart.itemCount,
        });
        await this.updateFunnelUserCategory(funnelUserId, 'ready_to_buy');
        return this.startHandoffConfirmation({
          conversation,
          phoneNumberValue,
          funnelUserId,
          userMessage,
          confirmBody: buildGuestCartCheckoutHandoffPrompt(
            cartHandoff.cart.itemCount,
            cartHandoff.cart.total,
          ),
        });
      }
    }

    let aiContent: string;
    let aiModel: string;
    let aiTokens: number;
    let newCareerId = conversation.careerId;
    let newMetaData = conversation.metaData;
    let newProgramName = conversation.currentProgramName;
    let purchaseCategory: string | null = null;

    if (this.intentRouter) {
      try {
        const routerResult = await this.intentRouter.route({
          messages: conversation.messages,
          userMessage: userContent,
          careerId: conversation.careerId,
          metaData: conversation.metaData,
          programName: conversation.currentProgramName,
          isFirstMessage,
        });
        aiContent = routerResult.content;
        aiModel = routerResult.model;
        aiTokens = routerResult.totalTokens;
        newCareerId = routerResult.newCareerId ?? conversation.careerId;
        newMetaData = routerResult.newMetaData ?? conversation.metaData;
        newProgramName = routerResult.newProgramName ?? conversation.currentProgramName;
        purchaseCategory = routerResult.purchaseCategory;

        if (this.isRouterFallbackResponse(aiContent)) {
          const hybridResult = await this.runHybridChat(
            conversation,
            userContent,
            collapseTrailingUserMessages,
            phoneNumberValue,
          );
          aiContent = hybridResult.content;
          aiModel = hybridResult.model;
          aiTokens = hybridResult.totalTokens;
        }
      } catch (routerErr) {
        logger.warn('[HandleIncomingMessage] IntentRouter failed — falling back to hybrid chat', {
          error: routerErr instanceof Error ? routerErr.message : String(routerErr),
        });
        const fallbackResult = this.hybridChat
          ? await this.runHybridChat(
            conversation,
            userContent,
            collapseTrailingUserMessages,
            phoneNumberValue,
          )
          : await this.runMonolithicPrompt(conversation, userContent, phoneNumberValue);
        aiContent = fallbackResult.content;
        aiModel = fallbackResult.model;
        aiTokens = fallbackResult.totalTokens;
      }
    } else if (this.hybridChat) {
      const hybridResult = await this.runHybridChat(
        conversation,
        userContent,
        collapseTrailingUserMessages,
        phoneNumberValue,
      );
      aiContent = hybridResult.content;
      aiModel = hybridResult.model;
      aiTokens = hybridResult.totalTokens;
    } else {
      const fallbackResult = await this.runMonolithicPrompt(conversation, userContent, phoneNumberValue);
      aiContent = fallbackResult.content;
      aiModel = fallbackResult.model;
      aiTokens = fallbackResult.totalTokens;
    }

    const structured = parseStructuredAiResponse(aiContent);
    if (structured.purchaseCategory && !purchaseCategory) {
      purchaseCategory = structured.purchaseCategory;
    }
    const aiContentClean = structured.message
      .replace(/\s*<<HANDOFF_TRIGGER>>\s*$/g, '')
      .replace(/\s*HANDOFF_TRIGGER\s*$/g, '')
      .trim();

    const isHandoff = this.detectHandoffTrigger(aiContent);

    if (isHandoff) {
      const newConsecutive = conversation.consecutiveHandoffs + 1;

      if (newConsecutive >= MAX_CONSECUTIVE_HANDOFFS) {
        logger.warn('[HandleIncomingMessage] Loop detected — triggering automatic handoff', {
          phone: phoneNumberValue,
          consecutiveHandoffs: newConsecutive,
        });

        const resolvedFunnelUserId = await this.upsertFunnelUser(phoneNumberValue, profileName);
        return this.activateHumanHandoff({
          conversation: conversation.incrementHandoffs(),
          phoneNumberValue,
          funnelUserId: resolvedFunnelUserId,
          handoffBy: 'bot',
          leadMessage: HANDOFF_LOOP_MSG,
          userMessage,
        });
      }

      conversation = conversation.incrementHandoffs().withHandoffState('pending');
      await this.conversationRepo.save(conversation);

      const { body: confirmBody } = await this.sendHandoffConfirmation(phoneNumberValue);

      await this.saveFunnelMessage(funnelUserId, confirmBody, 'bot');
      await this.updateFunnelUserStage(funnelUserId, 'DECISION', null);

      logger.info('[HandleIncomingMessage] HANDOFF_TRIGGER detected — asking for confirmation', {
        phone: phoneNumberValue,
        consecutiveHandoffs: conversation.consecutiveHandoffs,
      });

      return {
        conversationId: conversation.id,
        userMessageId: userMessage.id.value,
        aiResponseId: '',
        aiResponseContent: confirmBody,
      };
    }

    return this.deliverBotTextResponse({
      conversation,
      phoneNumberValue,
      funnelUserId,
      userMessage,
      aiContent: aiContentClean,
      aiModel,
      aiTokens,
      newCareerId,
      newMetaData,
      newProgramName,
      purchaseCategory,
      isFirstMessage,
    });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Sends the AI-generated text reply, persists state, and notifies realtime. */
  private async deliverBotTextResponse(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
    aiContent: string;
    aiModel: string;
    aiTokens: number;
    newCareerId: string | null;
    newMetaData: Conversation['metaData'];
    newProgramName: string | null;
    purchaseCategory: string | null;
    isFirstMessage?: boolean;
  }): Promise<HandleIncomingMessageResult> {
    const {
      conversation, phoneNumberValue, funnelUserId, userMessage,
      aiContent, aiModel, aiTokens, newCareerId, newMetaData, newProgramName, purchaseCategory,
      isFirstMessage = false,
    } = params;

    let outboundRaw = aiContent;
    if (isFirstMessage) {
      const cartSummary = await fetchGuestCartOpeningSummary(
        this.guestCartClient,
        phoneNumberValue,
      );
      outboundRaw = prependGuestCartSummary(outboundRaw, cartSummary);
    }

    const structured = parseStructuredAiResponse(outboundRaw);
    const outboundText = structured.message
      .replace(/\s*<<HANDOFF_TRIGGER>>\s*$/g, '')
      .replace(/\s*HANDOFF_TRIGGER\s*$/g, '')
      .trim();
    const effectiveCategory = purchaseCategory ?? structured.purchaseCategory;

    if (!outboundText) {
      logger.warn('[HandleIncomingMessage] AI returned empty reply — skipping outbound message', {
        conversationId: conversation.id,
        phone: phoneNumberValue,
        model: aiModel,
      });
      return {
        conversationId: conversation.id,
        userMessageId: userMessage.id.value,
        aiResponseId: '',
        aiResponseContent: '',
      };
    }

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      role: 'assistant',
      content: outboundText,
      status: 'processing',
      timestamp: new Date(),
      metadata: { model: aiModel, tokens: aiTokens },
    });

    const updatedConversation = conversation
      .addMessage(assistantMessage)
      .resetHandoffs()
      .withIntentContext(newCareerId, newMetaData, newProgramName);
    await this.conversationRepo.save(updatedConversation);

    const replyText = formatWhatsAppText(outboundText);

    const sendResult = await this.messagingProvider.sendTextMessage({
      to: phoneNumberValue,
      body: replyText,
    });

    if (this.messageRepo && sendResult.messageId) {
      const sentMessage = assistantMessage
        .withExternalId(sendResult.messageId)
        .markAs('sent');
      await this.messageRepo.save(sentMessage);

      this.realtimeNotifier?.notifyNewMessage({
        conversationId: conversation.id,
        conversationMode: conversation.mode,
        assignedAgentId: conversation.assignedAgentId,
        message: sentMessage,
      });
    }

    await this.saveFunnelMessage(funnelUserId, replyText, 'bot');
    if (effectiveCategory) {
      await this.updateFunnelUserCategory(funnelUserId, effectiveCategory);
    }

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: assistantMessage.id.value,
      aiResponseContent: replyText,
    };
  }

  private async handleMenuSelection(params: {
    selection: MenuSelection;
    conversation: Conversation;
    dto: HandleIncomingMessageDto;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
  }): Promise<HandleIncomingMessageResult> {
    const { selection, conversation, phoneNumberValue, funnelUserId, userMessage } = params;

    logger.info('[HandleIncomingMessage] Menu selection', { selection, phone: phoneNumberValue });

    switch (selection) {
      case MENU_ROW_IDS.CATALOG:
        return this.handleMenuIntentRoute(
          conversation, phoneNumberValue, funnelUserId, userMessage,
          'INFO_PROGRAM', MENU_INTENT_PHRASES[MENU_ROW_IDS.CATALOG],
        );
      case MENU_ROW_IDS.STORE:
        return this.deliverBotTextResponse({
          conversation,
          phoneNumberValue,
          funnelUserId,
          userMessage,
          aiContent: getStoreLinkMessage(),
          aiModel: 'menu-store-link',
          aiTokens: 0,
          newCareerId: conversation.careerId,
          newMetaData: conversation.metaData,
          newProgramName: conversation.currentProgramName,
          purchaseCategory: null,
        });
      case MENU_ROW_IDS.HANDOFF:
        return this.startHandoffConfirmation({
          conversation,
          phoneNumberValue,
          funnelUserId,
          userMessage,
        });
      case MENU_ROW_IDS.CONTACT:
        return this.sendCampusLocationReply({
          conversation,
          phoneNumberValue,
          funnelUserId,
          userMessage,
        });
    }
  }

  private async handleMenuIntentRoute(
    conversation: Conversation,
    phoneNumberValue: string,
    funnelUserId: string,
    userMessage: Message,
    forcedGroup: ForcedRoutingGroup,
    intentPhrase: string,
  ): Promise<HandleIncomingMessageResult> {
    // Menu items (carreras / costos) bypass the legacy Handlebars prompt pipeline — those
    // DB templates are brittle and fail compilation in prod. The hybrid engine always has
    // knowledge_base.md + Mongo tool calling available.
    if (this.hybridChat) {
      try {
        const hybridResult = await this.runHybridChat(conversation, intentPhrase, undefined, phoneNumberValue);
        return this.deliverBotTextResponse({
          conversation,
          phoneNumberValue,
          funnelUserId,
          userMessage,
          aiContent: hybridResult.content,
          aiModel: hybridResult.model,
          aiTokens: hybridResult.totalTokens,
          newCareerId: conversation.careerId,
          newMetaData: conversation.metaData,
          newProgramName: conversation.currentProgramName,
          purchaseCategory: null,
        });
      } catch (err) {
        logger.error('[HandleIncomingMessage] Hybrid menu route failed — trying IntentRouter', {
          forcedGroup,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!this.intentRouter) {
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
        aiContent: 'En este momento no puedo consultar esa información. Escribe "menu" para ver otras opciones.',
        aiModel: 'menu-fallback',
        aiTokens: 0,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    const routerResult = await this.intentRouter.routeForced({
      messages: conversation.messages,
      userMessage: intentPhrase,
      careerId: conversation.careerId,
      metaData: conversation.metaData,
      programName: conversation.currentProgramName,
      forcedGroup,
    });

    const structured = parseStructuredAiResponse(routerResult.content);
    const aiContentClean = structured.message
      .replace(/\s*<<HANDOFF_TRIGGER>>\s*$/g, '')
      .replace(/\s*HANDOFF_TRIGGER\s*$/g, '')
      .trim();

    if (this.isRouterFallbackResponse(aiContentClean) && this.hybridChat) {
      const hybridResult = await this.runHybridChat(
        conversation,
        intentPhrase,
        undefined,
        phoneNumberValue,
      );
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
        aiContent: hybridResult.content,
        aiModel: hybridResult.model,
        aiTokens: hybridResult.totalTokens,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    if (this.detectHandoffTrigger(routerResult.content)) {
      return this.startHandoffConfirmation({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
      });
    }

    return this.deliverBotTextResponse({
      conversation,
      phoneNumberValue,
      funnelUserId,
      userMessage,
      aiContent: aiContentClean,
      aiModel: routerResult.model,
      aiTokens: routerResult.totalTokens,
      newCareerId: routerResult.newCareerId ?? conversation.careerId,
      newMetaData: routerResult.newMetaData ?? conversation.metaData,
      newProgramName: routerResult.newProgramName ?? conversation.currentProgramName,
      purchaseCategory: routerResult.purchaseCategory ?? structured.purchaseCategory,
    });
  }

  private async sendMainMenu(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
  }): Promise<HandleIncomingMessageResult> {
    const { conversation, phoneNumberValue, funnelUserId, userMessage } = params;

    if (!this.messagingProvider.sendInteractiveList) {
      logger.warn('[HandleIncomingMessage] sendInteractiveList not available — welcome text');
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
        aiContent: getWelcomeMessage(),
        aiModel: 'welcome-fallback',
        aiTokens: 0,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    const menuPayload = buildMainMenuList(phoneNumberValue);
    const cartSummary = await fetchGuestCartOpeningSummary(
      this.guestCartClient,
      phoneNumberValue,
    );
    if (cartSummary) {
      menuPayload.body = prependGuestCartSummary(menuPayload.body, cartSummary);
    }
    const sendResult = await this.messagingProvider.sendInteractiveList(menuPayload);

    const summaryContent = menuPayload.body;

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      externalId: sendResult.messageId,
      role: 'assistant',
      content: summaryContent,
      contentType: 'interactive',
      status: 'sent',
      timestamp: new Date(),
      metadata: { interactiveType: 'list', menu: 'main' },
    });

    const updatedConversation = conversation.addMessage(assistantMessage);
    await this.conversationRepo.save(updatedConversation);

    if (this.messageRepo) {
      await this.messageRepo.save(assistantMessage);
    }

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      message: assistantMessage,
    });

    await this.saveFunnelMessage(funnelUserId, summaryContent, 'bot');

    logger.info('[HandleIncomingMessage] Main menu sent (F8)', { phone: phoneNumberValue });

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: assistantMessage.id.value,
      aiResponseContent: summaryContent,
    };
  }

  private async sendCampusLocationReply(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
  }): Promise<HandleIncomingMessageResult> {
    const { conversation, phoneNumberValue, funnelUserId, userMessage } = params;
    const campus = getCampusLocationFromEnv();

    if (!this.messagingProvider.sendLocation) {
      const fallbackText = `Nuestra sede: ${campus.name}, ${campus.address}`;
      return this.deliverBotTextResponse({
        conversation,
        phoneNumberValue,
        funnelUserId,
        userMessage,
        aiContent: fallbackText,
        aiModel: 'menu-location',
        aiTokens: 0,
        newCareerId: conversation.careerId,
        newMetaData: conversation.metaData,
        newProgramName: conversation.currentProgramName,
        purchaseCategory: null,
      });
    }

    const sendResult = await this.messagingProvider.sendLocation({
      to: phoneNumberValue,
      latitude: campus.latitude,
      longitude: campus.longitude,
      name: campus.name,
      address: campus.address,
    });

    const summaryContent = `📍 ${campus.name} — ${campus.address}`;

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      externalId: sendResult.messageId,
      role: 'assistant',
      content: summaryContent,
      contentType: 'location',
      status: 'sent',
      timestamp: new Date(),
      metadata: {
        latitude: campus.latitude,
        longitude: campus.longitude,
        locationName: campus.name,
        locationAddress: campus.address,
        menu: 'location',
      },
    });

    const updatedConversation = conversation.addMessage(assistantMessage);
    await this.conversationRepo.save(updatedConversation);

    if (this.messageRepo) {
      await this.messageRepo.save(assistantMessage);
    }

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      message: assistantMessage,
    });

    await this.saveFunnelMessage(funnelUserId, summaryContent, 'bot');

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: assistantMessage.id.value,
      aiResponseContent: summaryContent,
    };
  }

  private async startHandoffConfirmation(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
    confirmBody?: string;
  }): Promise<HandleIncomingMessageResult> {
    const { phoneNumberValue, funnelUserId, userMessage } = params;

    const updatedConversation = params.conversation
      .incrementHandoffs()
      .withHandoffState('pending');
    await this.conversationRepo.save(updatedConversation);

    const { body: confirmBody } = await this.sendHandoffConfirmation(
      phoneNumberValue,
      params.confirmBody,
    );
    await this.saveFunnelMessage(funnelUserId, confirmBody, 'bot');
    await this.updateFunnelUserStage(funnelUserId, 'DECISION', null);

    logger.info('[HandleIncomingMessage] Handoff confirmation requested (menu/trigger)', {
      phone: phoneNumberValue,
    });

    return {
      conversationId: updatedConversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: '',
      aiResponseContent: confirmBody,
    };
  }

  private async sendHandoffConfirmation(
    to: string,
    customBody?: string,
  ): Promise<{ messageId: string; body: string }> {
    const prompt = customBody?.trim() || HANDOFF_CONFIRMATION_MSG;

    if (isInteractiveHandoffEnabled() && this.messagingProvider.sendInteractiveButtons) {
      const result = await this.messagingProvider.sendInteractiveButtons({
        to,
        body: prompt,
        buttons: [
          { id: HANDOFF_BUTTON_IDS.YES, title: 'Sí' },
          { id: HANDOFF_BUTTON_IDS.NO, title: 'No' },
        ],
      });
      return { messageId: result.messageId, body: `${prompt} [Botones: Sí / No]` };
    }

    const result = await this.messagingProvider.sendTextMessage({
      to,
      body: `${prompt} (Sí/No)`,
    });
    return { messageId: result.messageId, body: `${prompt} (Sí/No)` };
  }

  private resolveHandoffAffirmative(dto: HandleIncomingMessageDto): boolean {
    if (dto.interactiveReplyId === HANDOFF_BUTTON_IDS.YES) return true;
    if (dto.interactiveReplyId === HANDOFF_BUTTON_IDS.NO) return false;
    const text = (dto.caption?.trim() || dto.content).trim();
    return isHandoffAffirmative(text);
  }

  // -----------------------------------------------------------------------
  // Private helpers (continued)
  // -----------------------------------------------------------------------

  private async handlePendingHandoffReply(
    conversation: Conversation,
    dto: HandleIncomingMessageDto,
    phoneNumberValue: string,
  ): Promise<HandleIncomingMessageResult> {
    if (this.isNonTextMedia(dto) && !dto.caption?.trim()) {
      return this.handleBotModeMediaInbound(conversation, dto, phoneNumberValue);
    }

    const userMessage = await this.createUserMessage(conversation, dto);

    conversation = conversation
      .addMessage(userMessage)
      .withLastUserMessageAt(new Date(dto.timestamp));

    // Ensure funnel user exists for this phone
    const funnelUserId = await this.upsertFunnelUser(phoneNumberValue, dto.profileName);
    await this.saveFunnelMessage(
      funnelUserId,
      dto.content,
      'user',
      this.funnelMediaMeta(dto, userMessage.mediaUrl),
    );

    const replyText = dto.caption?.trim() || dto.content;
    const isAffirmative = this.resolveHandoffAffirmative(dto);

    if (isAffirmative) {
      const agent = await this.pickAgent();
      return this.activateHumanHandoff({
        conversation,
        phoneNumberValue,
        funnelUserId,
        handoffBy: 'user',
        userMessage,
        agent,
      });
    }

    // User declined the advisor offer
    conversation = conversation.resetHandoffs();
    await this.conversationRepo.save(conversation);

    await this.messagingProvider.sendTextMessage({
      to: phoneNumberValue,
      body: HANDOFF_DECLINED_MSG,
    });

    await this.saveFunnelMessage(funnelUserId, HANDOFF_DECLINED_MSG, 'bot');

    logger.info('[HandleIncomingMessage] Handoff declined by user', { phone: phoneNumberValue });

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: '',
      aiResponseContent: HANDOFF_DECLINED_MSG,
    };
  }

  /** Inbound message while conversation is in human mode — no AI, no auto-reply. */
  private async handleHumanModeInbound(
    conversation: Conversation,
    dto: HandleIncomingMessageDto,
    phoneNumberValue: string,
  ): Promise<HandleIncomingMessageResult> {
    const userMessage = await this.createUserMessage(conversation, dto);

    conversation = conversation
      .addMessage(userMessage)
      .withLastUserMessageAt(new Date(dto.timestamp))
      .incrementUnread();
    await this.conversationRepo.save(conversation);

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      message: userMessage,
    });

    const funnelUserId = await this.upsertFunnelUser(phoneNumberValue, dto.profileName);
    await this.saveFunnelMessage(
      funnelUserId,
      dto.content,
      'user',
      this.funnelMediaMeta(dto, userMessage.mediaUrl),
    );

    logger.info('[HandleIncomingMessage] Human mode — message queued for agent', {
      phone: phoneNumberValue,
      conversationId: conversation.id,
      assignedAgentId: conversation.assignedAgentId,
      unreadCount: conversation.unreadCountAgent,
    });

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: '',
      aiResponseContent: '',
    };
  }

  private async activateHumanHandoff(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    handoffBy: HandoffBy;
    userMessage: Message;
    agent?: Agent | null;
    /** Optional override (e.g. loop-detection message). */
    leadMessage?: string;
  }): Promise<HandleIncomingMessageResult> {
    const agent = params.agent ?? await this.pickAgent();
    const cartHandoff = await this.resolveCartHandoff(params.phoneNumberValue);
    let leadMessage =
      params.leadMessage?.trim()
        ? params.leadMessage
        : agent
          ? buildHandoffAssignedLeadMessage(agent)
          : buildHandoffPendingLeadMessage();

    if (cartHandoff?.cart && cartHandoff.cart.itemCount > 0) {
      leadMessage = appendCartHandoffDeepLink(
        leadMessage,
        cartHandoff.handoffUrl,
        cartHandoff.sessionId,
      );
    } else {
      leadMessage = leadMessage
        .replaceAll('{cartHandoffUrl}', '')
        .replaceAll('{cartSessionId}', '');
    }

    const replyText = formatWhatsAppText(leadMessage);

    let conversation = params.conversation.withHumanHandoff(agent?.id ?? null, params.handoffBy);

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      role: 'assistant',
      content: replyText,
      status: 'processing',
      timestamp: new Date(),
      metadata: { model: 'handoff-transition', assignedAgentId: agent?.id ?? null },
    });

    conversation = conversation.addMessage(assistantMessage);
    await this.conversationRepo.save(conversation);

    const sendResult = await this.messagingProvider.sendTextMessage({
      to: params.phoneNumberValue,
      body: replyText,
    });

    if (this.messageRepo && sendResult.messageId) {
      const sentMessage = assistantMessage.withExternalId(sendResult.messageId).markAs('sent');
      await this.messageRepo.save(sentMessage);
    }

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      message: assistantMessage,
    });

    await this.saveFunnelMessage(params.funnelUserId, replyText, 'bot');
    await this.updateFunnelUserStage(params.funnelUserId, 'HANDOFF', agent?.id ?? null);

    if (agent) {
      await this.tryNotifyAgent(
        conversation,
        params.phoneNumberValue,
        agent,
        cartHandoff?.sessionId,
      );
    } else {
      logger.warn('[HandleIncomingMessage] Human handoff without assigned agent — awaiting manual claim', {
        phone: params.phoneNumberValue,
        conversationId: conversation.id,
      });
    }

    logger.info('[HandleIncomingMessage] Human handoff activated', {
      phone: params.phoneNumberValue,
      conversationId: conversation.id,
      assignedAgentId: agent?.id ?? null,
      handoffBy: params.handoffBy,
      cartSessionId: cartHandoff?.sessionId ?? null,
    });

    if (agent && this.funnelUserRepo) {
      const contactName = await resolveContactName(
        params.phoneNumberValue,
        conversation.userId,
        this.funnelUserRepo,
        this.userRepo,
      );
      logAgentAudit({
        action: 'conversation_assigned',
        agentId: agent.id,
        agentName: agent.name,
        conversationId: conversation.id,
        phoneNumber: params.phoneNumberValue,
        handoffBy: params.handoffBy,
        ...(contactName ? { contactName } : {}),
      });
    }

    return {
      conversationId: conversation.id,
      userMessageId: params.userMessage.id.value,
      aiResponseId: assistantMessage.id.value,
      aiResponseContent: replyText,
    };
  }

  private isNonTextMedia(dto: HandleIncomingMessageDto): boolean {
    const type = dto.contentType ?? 'text';
    // Location shares coordinates/address — process through normal bot flow (A7)
    return type !== 'text' && type !== 'location';
  }

  private getAutoReplyUnsupportedMedia(): string {
    return process.env['AUTO_REPLY_UNSUPPORTED_MEDIA'] ?? DEFAULT_AUTO_REPLY_UNSUPPORTED_MEDIA;
  }

  private funnelMediaMeta(
    dto: HandleIncomingMessageDto,
    mediaUrl?: string,
  ): { contentType?: MessageContentType; mediaUrl?: string } {
    return {
      ...(dto.contentType !== undefined && { contentType: dto.contentType }),
      ...(mediaUrl !== undefined && { mediaUrl }),
    };
  }

  /** Bot mode inbound for image/document/audio/video/sticker — no DeepSeek. */
  private async handleBotModeMediaInbound(
    conversation: Conversation,
    dto: HandleIncomingMessageDto,
    phoneNumberValue: string,
  ): Promise<HandleIncomingMessageResult> {
    const userMessage = await this.createUserMessage(conversation, dto);

    conversation = conversation
      .addMessage(userMessage)
      .withLastUserMessageAt(new Date(dto.timestamp));
    await this.conversationRepo.save(conversation);

    const funnelUserId = await this.upsertFunnelUser(phoneNumberValue, dto.profileName);
    await this.saveFunnelMessage(
      funnelUserId,
      dto.content,
      'user',
      this.funnelMediaMeta(dto, userMessage.mediaUrl),
    );

    const autoReply = this.getAutoReplyUnsupportedMedia();
    await this.messagingProvider.sendTextMessage({
      to: phoneNumberValue,
      body: autoReply,
    });
    await this.saveFunnelMessage(funnelUserId, autoReply, 'bot');

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: '',
      aiResponseContent: autoReply,
    };
  }

  private async createUserMessage(
    conversation: Conversation,
    dto: HandleIncomingMessageDto,
  ): Promise<Message> {
    const contentType = dto.contentType ?? 'text';
    const mediaFields = await this.resolveMediaFields(conversation.id, dto);
    const locationMeta = this.buildLocationMetadata(dto);

    return Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      externalId: dto.externalMessageId,
      role: 'user',
      content: dto.content,
      contentType,
      ...(mediaFields.mediaUrl !== undefined && { mediaUrl: mediaFields.mediaUrl }),
      ...(mediaFields.mimeType !== undefined && { mimeType: mediaFields.mimeType }),
      ...(dto.fileName !== undefined && { fileName: dto.fileName }),
      ...(dto.caption !== undefined && { caption: dto.caption }),
      ...(locationMeta !== undefined && { metadata: locationMeta }),
      status: 'received',
      timestamp: new Date(dto.timestamp),
    });
  }

  private buildLocationMetadata(
    dto: HandleIncomingMessageDto,
  ): Record<string, unknown> | undefined {
    if ((dto.contentType ?? 'text') !== 'location') return undefined;
    const meta: Record<string, unknown> = {};
    if (dto.latitude !== undefined) meta['latitude'] = dto.latitude;
    if (dto.longitude !== undefined) meta['longitude'] = dto.longitude;
    if (dto.locationName !== undefined) meta['locationName'] = dto.locationName;
    if (dto.locationAddress !== undefined) meta['locationAddress'] = dto.locationAddress;
    return Object.keys(meta).length > 0 ? meta : undefined;
  }

  private async resolveMediaFields(
    conversationId: string,
    dto: HandleIncomingMessageDto,
  ): Promise<{ mediaUrl?: string; mimeType?: string }> {
    const contentType = dto.contentType ?? 'text';
    const DOWNLOADABLE = new Set(['image', 'document', 'audio', 'video']);
    if (!DOWNLOADABLE.has(contentType)) {
      return { ...(dto.mimeType !== undefined && { mimeType: dto.mimeType }) };
    }
    if (!dto.mediaId || !this.metaMediaService || !this.mediaStorage) {
      return { ...(dto.mimeType !== undefined && { mimeType: dto.mimeType }) };
    }

    try {
      const { buffer, mimeType } = await this.metaMediaService.downloadMedia(dto.mediaId);
      const resolvedMimeType = mimeType ?? dto.mimeType ?? 'application/octet-stream';
      const saved = await this.mediaStorage.save(buffer, {
        mimeType: resolvedMimeType,
        conversationId,
        ...(dto.fileName !== undefined && { originalName: dto.fileName }),
      });

      logger.info('[WhatsApp] Media received', {
        contentType,
        mimeType: resolvedMimeType,
        conversationId,
      });

      return { mediaUrl: saved.publicPath, mimeType: resolvedMimeType };
    } catch (err) {
      logger.error('[HandleIncomingMessage] Failed to download/save media', {
        conversationId,
        mediaId: dto.mediaId,
        contentType,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ...(dto.mimeType !== undefined && { mimeType: dto.mimeType }) };
    }
  }

  private async pickAgent(): Promise<Agent | null> {
    if (!this.agentRepo) return null;
    try {
      const pinnedUsername = getHandoffAssignAgentUsername();
      if (pinnedUsername) {
        const pinned = await this.agentRepo.findByUsername(pinnedUsername);
        if (
          pinned?.isActive
          && !isHandoffExcludedAgent(pinned.username)
        ) {
          return pinned;
        }
        logger.warn('[HandleIncomingMessage] HANDOFF_ASSIGN_AGENT_USERNAME not available', {
          username: pinnedUsername,
          found: Boolean(pinned),
          active: pinned?.isActive ?? false,
        });
        return null;
      }

      const agents = await this.agentRepo.findActive();
      const excluded = getHandoffExcludedUsernames();
      const eligible = agents.filter((a) => {
        const username = a.username?.toLowerCase();
        return !username || !excluded.has(username);
      });
      if (eligible.length === 0) {
        logger.warn('[HandleIncomingMessage] No eligible agents found for handoff', {
          totalActive: agents.length,
          excludedUsernames: [...excluded],
        });
        return null;
      }
      const fieldAgents = eligible.filter((a) => a.role === 'agent');
      const pool = fieldAgents.length > 0 ? fieldAgents : eligible;
      return pool[Math.floor(Math.random() * pool.length)]!;
    } catch (err) {
      logger.error('[HandleIncomingMessage] Failed to fetch agents for handoff', { error: err });
      return null;
    }
  }

  /** Returns true when the AI response signals a handoff (token or implicit promise text). */
  private detectHandoffTrigger(text: string): boolean {
    if (detectHandoffTriggerToken(text)) return true;
    if (detectImplicitHandoffPromise(text)) {
      logger.warn('[HandleIncomingMessage] Implicit handoff promise detected in AI response — converting to real handoff', {
        snippet: text.slice(0, 120),
      });
      return true;
    }
    return false;
  }

  /** Sends a WhatsApp alert to the assigned agent with panel link and conversation summary. */
  private async tryNotifyAgent(
    conversation: Conversation,
    leadPhone: string,
    agent: Agent,
    cartSessionId?: string,
  ): Promise<void> {
    const panelBase = (process.env['ADMIN_PANEL_URL'] ?? 'http://localhost:4200').replace(/\/$/, '');
    const inboxUrl = `${panelBase}/chatbot`;

    const lastMessages = conversation.getLastNMessages(5);
    const summary = lastMessages
      .map((m) => {
        const role = m.role === 'user' ? 'Cliente' : botName();
        const snippet = m.content.length > 120 ? `${m.content.slice(0, 120)}…` : m.content;
        return `${role}: ${snippet}`;
      })
      .join('\n');

    const notification =
      `NUEVO CHAT ASIGNADO\n\n` +
      `Lead: ${leadPhone}\n` +
      `Conversacion: ${conversation.id}\n` +
      (cartSessionId ? `Carrito: [${cartSessionId}]\n` : '') +
      `\nResumen:\n${summary}\n\n` +
      `Atiende desde el panel:\n${inboxUrl}`;

    try {
      await this.messagingProvider.sendTextMessage({ to: agent.whatsapp, body: notification });
      logger.info('[HandleIncomingMessage] Agent notified of handoff', {
        agent: agent.name,
        agentId: agent.id,
        leadPhone,
        inboxUrl,
      });
    } catch (err) {
      logger.error('[HandleIncomingMessage] Failed to send handoff notification to agent', {
        agent: agent.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async tryPersistGuestCartFromInbound(
    customerPhone: string,
    userContent: string,
  ): Promise<void> {
    const intents = parseAllPdpPurchaseIntents(userContent);
    if (intents.length === 0) {
      return;
    }

    await this.persistGuestCartFromPdpBatch(customerPhone, intents);
  }

  private async persistGuestCartFromPdpBatch(
    customerPhone: string,
    intents: ParsedPdpPurchaseIntent[],
  ): Promise<void> {
    if (!this.guestCartClient?.enabled || intents.length === 0) {
      return;
    }

    try {
      const result = await this.guestCartClient.upsertCart({
        customerPhone,
        items: intents.map((intent) => mapPdpIntentToGuestCartItem(intent)),
        source: 'pdp',
        // Multi-product batch message is the full cart snapshot from the storefront.
        replace: intents.length > 1,
      });
      if (result?.sessionId) {
        logger.info('[HandleIncomingMessage] WhatsApp guest cart persisted', {
          sessionId: result.sessionId,
          itemCount: result.cart?.itemCount ?? 0,
        });
      }
    } catch (err) {
      logger.warn('[HandleIncomingMessage] Failed to persist WhatsApp guest cart', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async persistGuestCartFromPdp(
    customerPhone: string,
    intent: ParsedPdpPurchaseIntent,
  ): Promise<void> {
    await this.persistGuestCartFromPdpBatch(customerPhone, [intent]);
  }

  private async resolveCartHandoff(
    customerPhone: string,
  ): Promise<WhatsAppGuestCartHandoffResult | null> {
    if (!this.guestCartClient?.enabled) {
      return null;
    }

    try {
      return await this.guestCartClient.getHandoff({ customerPhone });
    } catch (err) {
      logger.warn('[HandleIncomingMessage] Failed to resolve WhatsApp cart handoff', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // ── Funnel helpers (fire-and-forget; errors logged but never thrown) ─────

  private async upsertFunnelUser(phoneNumber: string, profileName?: string): Promise<string> {
    if (!this.funnelUserRepo) return '';
    try {
      return await this.funnelUserRepo.upsert({
        senderId: phoneNumber,
        ...(profileName !== undefined && { name: profileName }),
      });
    } catch (err) {
      logger.warn('[HandleIncomingMessage] Failed to upsert funnel_user', {
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }

  private async saveFunnelMessage(
    funnelUserId: string,
    text: string,
    role: 'user' | 'bot',
    media?: { contentType?: MessageContentType; mediaUrl?: string },
  ): Promise<void> {
    if (!this.funnelMessageRepo || !funnelUserId) return;
    try {
      if (role === 'user') {
        await this.funnelMessageRepo.saveUserMessage({
          funnelUserId,
          text,
          ...(media?.contentType !== undefined && { contentType: media.contentType }),
          ...(media?.mediaUrl !== undefined && { mediaUrl: media.mediaUrl }),
        });
      } else {
        await this.funnelMessageRepo.saveBotMessage({ funnelUserId, text });
      }
    } catch (err) {
      logger.warn('[HandleIncomingMessage] Failed to save funnel_message', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async updateFunnelUserStage(
    funnelUserId: string,
    stage: 'AWARENESS' | 'CONSIDERATION' | 'DECISION' | 'HANDOFF' | 'CLOSED',
    assignedAgent: string | null,
  ): Promise<void> {
    if (!this.funnelUserRepo || !funnelUserId) return;
    try {
      await this.funnelUserRepo.updateById({ id: funnelUserId, stage, assignedAgent });
    } catch { /* ignore */ }
  }

  private async updateFunnelUserCategory(funnelUserId: string, purchaseCategory: string): Promise<void> {
    if (!this.funnelUserRepo || !funnelUserId) return;
    const stage = await this.funnelUserRepo.stageFromCategory(purchaseCategory);
    try {
      await this.funnelUserRepo.updateById({
        id: funnelUserId,
        stage,
        userCategory: purchaseCategory as 'first_contact' | 'interested' | 'ready_to_buy' | 'not_interested' | 'unknown',
      });
    } catch { /* ignore */ }
  }

  private isRouterFallbackResponse(text: string): boolean {
    return ROUTER_FALLBACK_PATTERN.test(text);
  }

  private buildHybridChatHistory(
    conversation: Conversation,
    lastUserOverride?: string,
    collapseTrailingUserMessages?: number,
  ): ChatMessage[] {
    const history = conversation.getLastNMessages(CONTEXT_WINDOW_SIZE).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    if (collapseTrailingUserMessages && collapseTrailingUserMessages > 1 && lastUserOverride) {
      let removed = 0;
      while (
        history.length > 0 &&
        history[history.length - 1]!.role === 'user' &&
        removed < collapseTrailingUserMessages
      ) {
        history.pop();
        removed++;
      }
      history.push({ role: 'user', content: lastUserOverride });
      return history;
    }

    if (lastUserOverride && history.length > 0 && history[history.length - 1]!.role === 'user') {
      history[history.length - 1] = { role: 'user', content: lastUserOverride };
    }

    return history;
  }

  private async runHybridChat(
    conversation: Conversation,
    lastUserOverride?: string,
    collapseTrailingUserMessages?: number,
    customerPhone?: string,
  ): Promise<{ content: string; model: string; totalTokens: number }> {
    if (!this.hybridChat) {
      throw new Error('HybridChatService not configured');
    }

    logger.info('[HandleIncomingMessage] Running hybrid chat engine', {
      conversationId: conversation.id,
      overrideLastUser: !!lastUserOverride,
      collapseTrailingUserMessages: collapseTrailingUserMessages ?? 0,
    });

    const result = await this.hybridChat.chat(
      this.buildHybridChatHistory(conversation, lastUserOverride, collapseTrailingUserMessages),
      customerPhone ? { customerPhone } : undefined,
    );
    const structured = parseStructuredAiResponse(result.content);

    return {
      content: structured.message,
      model: result.model,
      totalTokens: result.totalTokens,
    };
  }

  private async runMonolithicPrompt(
    conversation: Conversation,
    _userContent: string,
    customerPhone?: string,
  ): Promise<{ content: string; model: string; totalTokens: number }> {
    // Prefer the system prompt already stored in the conversation (built fresh at creation).
    // Only fall back to a full DB rebuild if the stored prompt is missing/empty — this avoids
    // re-fetching 53 programs (~300 ms + ~40 KB tokens) on every single message.
    const baseSystemPrompt =
      conversation.systemPrompt?.trim()
        ? conversation.systemPrompt
        : await this.buildSystemPrompt();

    // Hybrid-architecture guardrail: overlay the static knowledge base + strict anti-hallucination
    // rule on top of whatever base prompt was resolved above — never invent costs/malla/vacantes,
    // always call the tool. This mirrors IntentRouterService's behavior for the fallback path.
    const systemPrompt = withCurrentDateContext(
      this.knowledgeBaseOverlay
        ? `${baseSystemPrompt}\n\n${this.knowledgeBaseOverlay}`
        : baseSystemPrompt,
    );

    const recentMessages = conversation.getLastNMessages(CONTEXT_WINDOW_SIZE);
    const chatHistory = recentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const messages = [{ role: 'system' as const, content: systemPrompt }, ...chatHistory];

    if (!this.productToolsService) {
      const result = await this.aiProvider.complete(messages);
      return { content: result.content, model: result.model, totalTokens: result.totalTokens };
    }

    if (customerPhone) {
      this.productToolsService.setCartContext(customerPhone);
    }

    try {
      const result = await completeWithTools(this.aiProvider, messages, PRODUCT_TOOLS, (name, args) =>
        this.productToolsService!.execute(name, args),
      );
      return { content: result.content, model: result.model, totalTokens: result.totalTokens };
    } finally {
      this.productToolsService.clearCartContext();
    }
  }

  private async resolveProgramForBrochure(
    conversation: Conversation,
    userContent: string,
  ): Promise<Program | null> {
    if (!this.programRepo) return null;

    if (conversation.careerId) {
      const byId = await this.programRepo.findById(conversation.careerId);
      if (byId?.brochureUrl.trim()) return byId;
    }

    const programs = await this.programRepo.findActive();

    if (conversation.currentProgramName) {
      const byName = programs.find(
        (p) => p.name.toLowerCase() === conversation.currentProgramName!.toLowerCase(),
      );
      if (byName?.brochureUrl.trim()) return byName;
    }

    const lower = userContent.toLowerCase();
    for (const p of programs) {
      if (p.brochureUrl.trim() && lower.includes(p.name.toLowerCase())) {
        return p;
      }
    }

    // Single active program with brochure when context is ambiguous
    const withBrochure = programs.filter((p) => p.brochureUrl.trim());
    if (withBrochure.length === 1) return withBrochure[0]!;

    return null;
  }

  private async handleBrochureRequest(params: {
    conversation: Conversation;
    phoneNumberValue: string;
    funnelUserId: string;
    userMessage: Message;
    program: Program;
  }): Promise<HandleIncomingMessageResult> {
    const { conversation, phoneNumberValue, funnelUserId, userMessage, program } = params;

    const result = await this.sendProgramBrochure!.execute({
      to: phoneNumberValue,
      programId: program.id,
    });

    const replyContent =
      result.sentAs === 'document'
        ? `Brochure PDF — ${program.name}`
        : `Brochure — ${program.name}: ${result.brochureUrl}`;

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      externalId: result.messageId,
      role: 'assistant',
      content: replyContent,
      contentType: result.sentAs === 'document' ? 'document' : 'text',
      status: 'sent',
      timestamp: new Date(),
      metadata: {
        brochureUrl: result.brochureUrl,
        programId: program.id,
        sentAs: result.sentAs,
      },
    });

    const updatedConversation = params.conversation
      .addMessage(assistantMessage)
      .resetHandoffs()
      .withIntentContext(program.id, params.conversation.metaData, program.name);
    await this.conversationRepo.save(updatedConversation);

    if (this.messageRepo) {
      await this.messageRepo.save(assistantMessage);
    }

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: updatedConversation.id,
      conversationMode: updatedConversation.mode,
      assignedAgentId: updatedConversation.assignedAgentId,
      message: assistantMessage,
    });

    await this.saveFunnelMessage(funnelUserId, replyContent, 'bot');

    logger.info('[HandleIncomingMessage] Brochure sent (F7)', {
      program: program.name,
      sentAs: result.sentAs,
      phone: phoneNumberValue,
    });

    return {
      conversationId: updatedConversation.id,
      userMessageId: userMessage.id.value,
      aiResponseId: assistantMessage.id.value,
      aiResponseContent: replyContent,
    };
  }

  private async buildSystemPrompt(): Promise<string> {
    if (this.knowledgeBaseOverlay) {
      return withCurrentDateContext(this.knowledgeBaseOverlay);
    }

    if (!this.programRepo || !this.promptBuilder) {
      logger.warn('[HandleIncomingMessage] Using Maritex fallback prompt');
      return FALLBACK_SYSTEM_PROMPT;
    }
    try {
      const programs = await this.programRepo.findActive();
      const prompt = this.promptBuilder.build(programs);
      logger.info('[HandleIncomingMessage] System prompt built fresh from DB', {
        programs: programs.length,
        promptLength: prompt.length,
      });
      return prompt;
    } catch (err) {
      logger.warn('[HandleIncomingMessage] Failed to load programs — using base prompt without program data', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Use the safe base instructions (no HANDOFF_TRIGGER for lack of data) rather than
      // the aggressive fallback that triggers handoff on any insufficient-info scenario.
      return this.promptBuilder.build([]);
    }
  }
}
