import type { Request, Response } from 'express';
import type { HandleIncomingMessageUseCase } from '../../../application/use-cases/handle-incoming-message/handle-incoming-message.usecase.js';
import type { HandleMessageStatusUseCase } from '../../../application/use-cases/handle-message-status/handle-message-status.usecase.js';
import type {
  MetaWebhookPayload,
  MetaWebhookVerifyQuery,
  ParsedMessageContentType,
  ParsedWhatsAppInboundMessage,
  ParsedWhatsAppStatusUpdate,
} from './meta-whatsapp.types.js';
import type { MessageContentType } from '../../../domain/entities/message.entity.js';
import type { WhatsAppParserService } from './whatsapp-parser.service.js';
import { PhoneNumber } from '../../../domain/value-objects/phone-number.vo.js';
import { logger } from '../../shared/logger.js';
import { formatMetaApiError } from './meta-api-error.js';

/**
 * Example Meta status webhook payload (delivery/read receipts):
 * ```json
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [{
 *     "id": "WABA_ID",
 *     "changes": [{
 *       "field": "messages",
 *       "value": {
 *         "messaging_product": "whatsapp",
 *         "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
 *         "statuses": [{
 *           "id": "wamid.OUTBOUND_MSG_ID",
 *           "status": "delivered",
 *           "timestamp": "1710000000",
 *           "recipient_id": "51999999999"
 *         }]
 *       }
 *     }]
 *   }]
 * }
 * ```
 */
export class WhatsAppController {
  constructor(
    private readonly parser: WhatsAppParserService,
    private readonly handleIncomingMessage: HandleIncomingMessageUseCase,
    private readonly handleMessageStatus: HandleMessageStatusUseCase,
    private readonly verifyToken: string,
  ) {}

  verify(req: Request, res: Response): void {
    const query = req.query as MetaWebhookVerifyQuery;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.verifyToken) {
      logger.info('[WhatsApp] Webhook verified successfully');
      res.status(200).send(challenge);
      return;
    }

    logger.warn('[WhatsApp] Webhook verification failed', { mode, token });
    res.sendStatus(403);
  }

  receive(req: Request, res: Response): void {
    res.sendStatus(200);

    const payload = req.body as MetaWebhookPayload;
    const inboundMessages = this.parser.parseInboundMessages(payload);
    const statusUpdates = this.parser.parseStatusUpdates(payload);

    for (const status of statusUpdates) {
      void this.dispatchStatusUpdate(status);
    }

    if (!inboundMessages.length && !statusUpdates.length) {
      logger.debug('[WhatsApp] Webhook received with no processable messages or statuses');
      return;
    }

    for (const message of inboundMessages) {
      void this.dispatchToAiFlow(message);
    }
  }

  private async dispatchStatusUpdate(status: ParsedWhatsAppStatusUpdate): Promise<void> {
    try {
      await this.handleMessageStatus.execute({
        externalMessageId: status.externalMessageId,
        status: status.status,
        timestampMs: status.timestampMs,
      });
    } catch (err) {
      logger.error('[WhatsApp] Error processing status webhook', {
        externalMessageId: status.externalMessageId,
        status: status.status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async dispatchToAiFlow(message: ParsedWhatsAppInboundMessage): Promise<void> {
    try {
      const fromPhoneNumber = this.toE164(message.waId);

      if (!PhoneNumber.isPeruvian(fromPhoneNumber)) {
        logger.info('[WhatsApp] Ignoring message from non-Peruvian number', {
          waId: message.waId,
          fromPhoneNumber,
          messageId: message.externalMessageId,
        });
        return;
      }

      await this.handleIncomingMessage.execute({
        fromPhoneNumber,
        ...(message.profileName !== undefined && { profileName: message.profileName }),
        externalMessageId: message.externalMessageId,
        content: message.text,
        timestamp: message.timestampMs,
        contentType: this.toDomainContentType(message.contentType),
        ...(message.mediaId !== undefined && { mediaId: message.mediaId }),
        ...(message.mimeType !== undefined && { mimeType: message.mimeType }),
        ...(message.fileName !== undefined && { fileName: message.fileName }),
        ...(message.caption !== undefined && { caption: message.caption }),
        ...(message.latitude !== undefined && { latitude: message.latitude }),
        ...(message.longitude !== undefined && { longitude: message.longitude }),
        ...(message.locationName !== undefined && { locationName: message.locationName }),
        ...(message.locationAddress !== undefined && { locationAddress: message.locationAddress }),
        ...(message.interactiveReplyId !== undefined && { interactiveReplyId: message.interactiveReplyId }),
      });

      logger.info('[WhatsApp] Message processed', {
        waId: message.waId,
        profileName: message.profileName,
        messageId: message.externalMessageId,
        contentType: message.contentType,
      });
    } catch (err) {
      logger.error('[WhatsApp] Error processing inbound message', {
        waId: message.waId,
        profileName: message.profileName,
        messageId: message.externalMessageId,
        ...formatMetaApiError(err),
      });
    }
  }

  private toE164(waId: string | undefined): string {
    const normalized = String(waId ?? '').trim();
    if (!normalized) {
      throw new Error('WhatsApp sender id (waId) is missing');
    }
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  private toDomainContentType(type: ParsedMessageContentType): MessageContentType {
    if (type === 'sticker') return 'image';
    return type;
  }
}
