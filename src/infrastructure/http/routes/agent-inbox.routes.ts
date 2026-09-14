import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { authenticateAgentJwt } from '../middlewares/authenticate-agent-jwt.middleware.js';
import { ListAgentInboxUseCase } from '../../../application/use-cases/agent-inbox/list-agent-inbox.usecase.js';
import { GetConversationHistoryUseCase } from '../../../application/use-cases/agent-inbox/get-conversation-history.usecase.js';
import { SendAgentMessageUseCase } from '../../../application/use-cases/agent-inbox/send-agent-message.usecase.js';
import { MarkConversationReadUseCase } from '../../../application/use-cases/agent-inbox/mark-conversation-read.usecase.js';
import { ReturnConversationToBotUseCase } from '../../../application/use-cases/agent-inbox/return-conversation-to-bot.usecase.js';
import { TakeConversationUseCase } from '../../../application/use-cases/agent-inbox/take-conversation.usecase.js';
import { CloseConversationUseCase } from '../../../application/use-cases/agent-inbox/close-conversation.usecase.js';
import { UpdateLabelsUseCase } from '../../../application/use-cases/agent-inbox/update-labels.usecase.js';
import { PinConversationUseCase } from '../../../application/use-cases/agent-inbox/pin-conversation.usecase.js';
import { ArchiveConversationUseCase } from '../../../application/use-cases/agent-inbox/archive-conversation.usecase.js';
import { AddInternalNoteUseCase } from '../../../application/use-cases/agent-inbox/add-internal-note.usecase.js';
import { ReassignConversationUseCase } from '../../../application/use-cases/agent-inbox/reassign-conversation.usecase.js';
import { SendInteractiveMessageUseCase } from '../../../application/use-cases/agent-inbox/send-interactive-message.usecase.js';
import { ForbiddenError } from '../../../application/services/conversation-access.service.js';
import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { MessagingProviderPort } from '../../../application/ports/messaging-provider.port.js';
import type { FunnelMessageMongoRepository } from '../../database/mongodb/repositories/funnel-message.mongo-repository.js';
import type { NoOpFunnelMessageRepository } from '../../database/noop-funnel-message.repository.js';
import type { UserRepository } from '../../../domain/repositories/user.repository.js';
import type { FunnelUserPrismaRepository } from '../../database/prisma/repositories/funnel-user.prisma-repository.js';
import type { RealtimeNotifier } from '../../../application/services/realtime-notifier.service.js';
import type { MetaMediaService } from '../../webhooks/meta/meta-media.service.js';
import type { MediaStoragePort } from '../../../application/ports/media-storage.port.js';
import { logAgentAuditFromRequest, type AgentAuditFields } from '../../shared/agent-audit.logger.js';
import { resolveContactName } from '../../shared/resolve-contact-name.js';
import {
  agentMediaUpload,
  mimeToAgentContentType,
  validateAgentMediaMime,
} from '../middlewares/agent-media-upload.middleware.js';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import type { MessageRepository } from '../../../domain/repositories/message.repository.js';

async function auditConversationAction(
  conversationRepo: ConversationRepository,
  userRepo: UserRepository,
  funnelUserRepo: FunnelUserPrismaRepository,
  req: Request,
  conversationId: string,
  action: 'message_sent' | 'return_to_bot' | 'conversation_closed' | 'access_denied' | 'conversation_reassigned',
  extra?: { contentPreview?: string; detail?: string },
): Promise<void> {
  const conversation = await conversationRepo.findById(conversationId);
  const auditExtra: Omit<AgentAuditFields, 'action'> = { conversationId, ...extra };
  if (conversation?.phoneNumber) {
    auditExtra.phoneNumber = conversation.phoneNumber;
    const contactName = await resolveContactName(
      conversation.phoneNumber,
      conversation.userId,
      funnelUserRepo,
      userRepo,
    );
    if (contactName) auditExtra.contactName = contactName;
  }
  logAgentAuditFromRequest(req, action, auditExtra);
}

export function createAgentInboxRouter(
  conversationRepo: ConversationRepository,
  userRepo: UserRepository,
  funnelUserRepo: FunnelUserPrismaRepository,
  agentRepo: AgentRepository,
  messagingProvider: MessagingProviderPort,
  funnelMessageRepo: FunnelMessageMongoRepository | NoOpFunnelMessageRepository,
  metaMediaService: MetaMediaService,
  mediaStorage: MediaStoragePort,
  realtimeNotifier?: RealtimeNotifier,
  messageRepo?: MessageRepository,
): Router {
  const router = Router();

  const listInbox = new ListAgentInboxUseCase(conversationRepo, userRepo, funnelUserRepo, agentRepo);
  const getHistory = new GetConversationHistoryUseCase(conversationRepo, userRepo, funnelUserRepo, agentRepo);
  const sendMessage = new SendAgentMessageUseCase(
    conversationRepo,
    messagingProvider,
    funnelMessageRepo,
    metaMediaService,
    mediaStorage,
    realtimeNotifier,
  );
  const markRead = new MarkConversationReadUseCase(conversationRepo, realtimeNotifier);
  const returnToBot = new ReturnConversationToBotUseCase(conversationRepo);
  const takeConversation = new TakeConversationUseCase(
    conversationRepo,
    funnelUserRepo,
    agentRepo,
    messagingProvider,
    funnelMessageRepo,
    messageRepo,
    realtimeNotifier,
  );
  const closeConv = new CloseConversationUseCase(conversationRepo);
  const updateLabels = new UpdateLabelsUseCase(conversationRepo);
  const pinConversation = new PinConversationUseCase(conversationRepo);
  const archiveConversation = new ArchiveConversationUseCase(conversationRepo);
  const sendInteractive = new SendInteractiveMessageUseCase(
    conversationRepo,
    messagingProvider,
    funnelMessageRepo,
    realtimeNotifier,
  );
  const addNote = new AddInternalNoteUseCase(conversationRepo, realtimeNotifier);
  const reassign = new ReassignConversationUseCase(conversationRepo, agentRepo);

  router.use('/api/v1', authenticateAgentJwt);

  // GET /api/v1/agents — admin: list active agents for reassign modal
  router.get('/api/v1/agents', async (req: Request, res: Response) => {
    if (req.agent!.role !== 'admin') {
      res.status(403).json({ error: 'Solo administradores pueden listar agentes' });
      return;
    }
    const agents = await agentRepo.findActive();
    res.json({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: a.status,
      })),
    });
  });

  // GET /api/v1/inbox — filter=unread|unanswered|own|bot, inboxFilter=own|bot, q=search
  router.get('/api/v1/inbox', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const filterRaw = req.query['filter'];
    const inboxFilterRaw = req.query['inboxFilter'];

    let inboxFilter: 'own' | 'bot' | undefined;
    if (inboxFilterRaw === 'bot' || inboxFilterRaw === 'own') {
      inboxFilter = inboxFilterRaw;
    } else if (filterRaw === 'bot' || filterRaw === 'own') {
      inboxFilter = filterRaw;
    }

    let listFilter: 'unread' | 'unanswered' | undefined;
    if (filterRaw === 'unread' || filterRaw === 'unanswered') {
      listFilter = filterRaw;
    }

    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : undefined;

    const defaultLimit = role === 'admin' ? 100 : inboxFilter === 'bot' ? 100 : 20;
    const limit = Number(req.query['limit'] ?? defaultLimit);
    const offset = Number(req.query['offset'] ?? 0);
    const sinceRaw = req.query['since'];
    const since =
      typeof sinceRaw === 'string' && sinceRaw.trim()
        ? new Date(sinceRaw)
        : undefined;

    const label = typeof req.query['label'] === 'string' ? req.query['label'].trim() : undefined;
    const includeArchived =
      role === 'admin' && req.query['includeArchived'] === 'true' ? true : undefined;

    const result = await listInbox.execute({
      agentId,
      role,
      limit,
      offset,
      ...(since !== undefined && { since }),
      ...(inboxFilter !== undefined && { inboxFilter }),
      ...(listFilter !== undefined && { listFilter }),
      ...(q && { q }),
      ...(label && { label }),
      ...(includeArchived && { includeArchived }),
    });
    res.json(result);
  });

  // GET /api/v1/conversations/:id
  router.get('/api/v1/conversations/:id', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);

    try {
      const result = await getHistory.execute({ conversationId, agentId, role: req.agent!.role, limit: 0 });
      res.json({ ...result, messages: undefined });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'access_denied', {
          detail: err.message,
        });
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Conversación no encontrada') {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // GET /api/v1/conversations/:id/messages
  router.get('/api/v1/conversations/:id/messages', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);
    const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
    const sinceRaw = req.query['since'];
    const since =
      typeof sinceRaw === 'string' && sinceRaw.trim()
        ? new Date(sinceRaw)
        : undefined;

    try {
      const result = await getHistory.execute({
        conversationId,
        agentId,
        role: req.agent!.role,
        limit,
        ...(since !== undefined && !Number.isNaN(since.getTime()) && { since }),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'access_denied', {
          detail: err.message,
        });
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Conversación no encontrada') {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/messages — JSON (text) or multipart/form-data (file + optional content caption)
  router.post(
    '/api/v1/conversations/:id/messages',
    agentMediaUpload.single('file'),
    async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);
    const file = req.file;
    const bodyContent = typeof req.body?.content === 'string' ? req.body.content : undefined;

    if (!file && !bodyContent?.trim()) {
      res.status(400).json({ error: 'content o file es requerido' });
      return;
    }

    try {
      if (file) {
        validateAgentMediaMime(file.mimetype);
      }

      const result = await sendMessage.execute({
        conversationId,
        agentId,
        ...(bodyContent !== undefined && { content: bodyContent }),
        ...(file && {
          fileBuffer: file.buffer,
          mimeType: file.mimetype,
          contentType: mimeToAgentContentType(file.mimetype),
          ...(file.originalname && { fileName: file.originalname }),
        }),
      });

      const preview = bodyContent?.trim() || file?.originalname || result.contentType;
      await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'message_sent', {
        contentPreview: preview.slice(0, 120),
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'access_denied', {
          detail: err.message,
        });
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Conversación no encontrada') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'La conversación no está en modo humano') {
        res.status(409).json({ error: 'La conversación está en modo bot. Toma el chat primero.' });
        return;
      }
      if (err instanceof Error && err.message.includes('Ventana de 24 horas')) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Archivo demasiado grande (máximo 16 MB para audio/video, 5 MB para imágenes)' });
        return;
      }
      if (err instanceof Error && err.message.includes('Tipo de archivo no permitido')) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('Sin permiso de escritura')) {
        res.status(500).json({ error: 'Error de almacenamiento en el servidor. Intenta de nuevo.' });
        return;
      }
      // Last-resort: log and return 500 instead of crashing the process
      const e = err as Error;
      res.status(500).json({ error: e.message ?? 'Error interno del servidor' });
    }
  },
  );

  // POST /api/v1/conversations/:id/read
  router.post('/api/v1/conversations/:id/read', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);

    try {
      await markRead.execute({ conversationId, agentId });
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'access_denied', {
          detail: err.message,
        });
        res.status(403).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/take
  router.post('/api/v1/conversations/:id/take', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);

    try {
      const result = await takeConversation.execute({
        conversationId,
        agentId,
        agentUsername: req.agent!.username,
      });
      const conversation = await conversationRepo.findById(conversationId);
      const auditExtra: Omit<AgentAuditFields, 'action'> = {
        conversationId,
        handoffBy: 'agent',
      };
      if (conversation?.phoneNumber) {
        auditExtra.phoneNumber = conversation.phoneNumber;
        const contactName = await resolveContactName(
          conversation.phoneNumber,
          conversation.userId,
          funnelUserRepo,
          userRepo,
        );
        if (contactName) auditExtra.contactName = contactName;
      }
      logAgentAuditFromRequest(req, 'conversation_assigned', auditExtra);
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'Conversación no encontrada') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Este chat ya está en atención humana') {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Esta cuenta de prueba no puede tomar conversaciones') {
        res.status(403).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/return-to-bot
  router.post('/api/v1/conversations/:id/return-to-bot', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);

    try {
      await returnToBot.execute({ conversationId, agentId });
      await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'return_to_bot');
      res.json({ success: true, mode: 'bot' });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'access_denied', {
          detail: err.message,
        });
        res.status(403).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/close
  router.post('/api/v1/conversations/:id/close', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);

    try {
      await closeConv.execute({ conversationId, agentId });
      await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'conversation_closed');
      res.json({ success: true, status: 'closed' });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        await auditConversationAction(conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'access_denied', {
          detail: err.message,
        });
        res.status(403).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // PATCH /api/v1/conversations/:id/labels — C13
  router.patch('/api/v1/conversations/:id/labels', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const conversationId = String(req.params['id']);
    const labels = req.body?.labels;

    if (!Array.isArray(labels) || labels.some((l) => typeof l !== 'string')) {
      res.status(400).json({ error: 'labels debe ser un arreglo de strings' });
      return;
    }

    try {
      const result = await updateLabels.execute({ conversationId, agentId, role, labels });
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/pin — C14
  router.post('/api/v1/conversations/:id/pin', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const conversationId = String(req.params['id']);
    const pinned = Boolean(req.body?.pinned);

    try {
      const result = await pinConversation.execute({ conversationId, agentId, role, pinned });
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/archive — C15
  router.post('/api/v1/conversations/:id/archive', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const conversationId = String(req.params['id']);

    try {
      const result = await archiveConversation.execute({ conversationId, agentId, role, archive: true });
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/unarchive — C15
  router.post('/api/v1/conversations/:id/unarchive', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const conversationId = String(req.params['id']);

    try {
      const result = await archiveConversation.execute({ conversationId, agentId, role, archive: false });
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/notes — D13 (internal note)
  router.post('/api/v1/conversations/:id/notes', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const role = req.agent!.role;
    const conversationId = String(req.params['id']);
    const content = typeof req.body?.content === 'string' ? req.body.content : '';

    if (!content.trim()) {
      res.status(400).json({ error: 'content es requerido' });
      return;
    }

    try {
      const result = await addNote.execute({ conversationId, agentId, role, content });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  });

  // POST /api/v1/conversations/:id/reassign — D14 (admin only)
  router.post('/api/v1/conversations/:id/reassign', async (req: Request, res: Response) => {
    const requestingAgentId = req.agent!.id;
    const role = req.agent!.role;
    const conversationId = String(req.params['id']);
    const targetAgentId = typeof req.body?.agentId === 'string' ? req.body.agentId : '';

    if (!targetAgentId.trim()) {
      res.status(400).json({ error: 'agentId es requerido' });
      return;
    }

    try {
      const result = await reassign.execute({ conversationId, requestingAgentId, role, targetAgentId });
      await auditConversationAction(
        conversationRepo, userRepo, funnelUserRepo, req, conversationId, 'conversation_reassigned',
        { detail: `→ agentId:${targetAgentId}` },
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && (err.message === 'Conversación no encontrada' || err.message === 'Agente destino no encontrado')) {
        res.status(404).json({ error: err.message }); return;
      }
      throw err;
    }
  });

  // ── B1 Interactive buttons ──────────────────────────────────────────────────
  // POST /api/v1/conversations/:id/interactive-buttons
  router.post('/api/v1/conversations/:id/interactive-buttons', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    const buttons = Array.isArray(req.body?.buttons) ? req.body.buttons : [];

    if (!body.trim()) { res.status(400).json({ error: 'body es requerido' }); return; }
    if (!buttons.length) { res.status(400).json({ error: 'buttons[] es requerido (máx 3)' }); return; }

    try {
      const result = await sendInteractive.execute({ type: 'buttons', conversationId, agentId, body, buttons });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      if (err instanceof Error) { res.status(422).json({ error: err.message }); return; }
      throw err;
    }
  });

  // ── B2 Interactive list ─────────────────────────────────────────────────────
  // POST /api/v1/conversations/:id/interactive-list
  router.post('/api/v1/conversations/:id/interactive-list', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    const buttonText = typeof req.body?.buttonText === 'string' ? req.body.buttonText : '';
    const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];

    if (!body.trim()) { res.status(400).json({ error: 'body es requerido' }); return; }
    if (!buttonText.trim()) { res.status(400).json({ error: 'buttonText es requerido' }); return; }
    if (!sections.length) { res.status(400).json({ error: 'sections[] es requerido' }); return; }

    try {
      const result = await sendInteractive.execute({ type: 'list', conversationId, agentId, body, buttonText, sections });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      if (err instanceof Error) { res.status(422).json({ error: err.message }); return; }
      throw err;
    }
  });

  // ── B3 CTA URL ──────────────────────────────────────────────────────────────
  // POST /api/v1/conversations/:id/cta-url
  router.post('/api/v1/conversations/:id/cta-url', async (req: Request, res: Response) => {
    const agentId = req.agent!.id;
    const conversationId = String(req.params['id']);
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    const displayText = typeof req.body?.displayText === 'string' ? req.body.displayText : '';
    const url = typeof req.body?.url === 'string' ? req.body.url : '';

    if (!body.trim()) { res.status(400).json({ error: 'body es requerido' }); return; }
    if (!displayText.trim()) { res.status(400).json({ error: 'displayText es requerido' }); return; }
    if (!url.trim()) { res.status(400).json({ error: 'url es requerido' }); return; }

    try {
      const result = await sendInteractive.execute({ type: 'cta_url', conversationId, agentId, body, displayText, url });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ForbiddenError) { res.status(403).json({ error: err.message }); return; }
      if (err instanceof Error && err.message === 'Conversación no encontrada') { res.status(404).json({ error: err.message }); return; }
      if (err instanceof Error) { res.status(422).json({ error: err.message }); return; }
      throw err;
    }
  });

  return router;
}
