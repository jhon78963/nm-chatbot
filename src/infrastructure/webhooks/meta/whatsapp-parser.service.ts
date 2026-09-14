import type {
  MetaContact,
  MetaInboundMessage,
  MetaMessageStatus,
  MetaWebhookPayload,
  MetaWebhookValue,
  ParsedWhatsAppInboundMessage,
  ParsedWhatsAppStatusUpdate,
} from './meta-whatsapp.types.js';
import { logger } from '../../shared/logger.js';

/**
 * Parses nested Meta WhatsApp Cloud API webhook payloads into normalized messages.
 */
export class WhatsAppParserService {
  parseInboundMessages(payload: MetaWebhookPayload): ParsedWhatsAppInboundMessage[] {
    if (payload.object !== 'whatsapp_business_account') {
      return [];
    }

    const messages: ParsedWhatsAppInboundMessage[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        messages.push(...this.parseChangeValue(change.value));
      }
    }

    return messages;
  }

  parseStatusUpdates(payload: MetaWebhookPayload): ParsedWhatsAppStatusUpdate[] {
    if (payload.object !== 'whatsapp_business_account') {
      return [];
    }

    const statuses: ParsedWhatsAppStatusUpdate[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        statuses.push(...this.parseStatusChangeValue(change.value));
      }
    }

    return statuses;
  }

  parseFirstInboundMessage(payload: MetaWebhookPayload): ParsedWhatsAppInboundMessage | null {
    const entry = payload.entry[0];
    const change = entry?.changes[0];
    const value = change?.value;

    if (!value?.messages?.length) {
      return null;
    }

    const message = value.messages[0];
    if (!message) {
      return null;
    }

    return this.parseInboundMessage(value, message);
  }

  private parseChangeValue(value: MetaWebhookValue): ParsedWhatsAppInboundMessage[] {
    const inbound = value.messages;
    if (!inbound?.length) {
      return [];
    }

    return inbound
      .map((message) => this.parseInboundMessage(value, message))
      .filter((message): message is ParsedWhatsAppInboundMessage => message !== null);
  }

  private parseInboundMessage(
    value: MetaWebhookValue,
    message: MetaInboundMessage,
  ): ParsedWhatsAppInboundMessage | null {
    const waId = message.from?.trim();
    if (!waId) {
      logger.warn('[WhatsApp] Inbound message missing sender (from)', {
        messageId: message.id,
        type: message.type,
      });
      return null;
    }
    const profileName = this.resolveProfileName(value.contacts, waId);
    const base = {
      waId,
      ...(profileName !== undefined && { profileName }),
      externalMessageId: message.id,
      timestampMs: Number.parseInt(message.timestamp, 10) * 1000,
    };

    switch (message.type) {
      case 'text': {
        const body = message.text?.body?.trim();
        if (!body) return null;
        return { ...base, text: body, contentType: 'text' };
      }
      case 'image': {
        const media = message.image;
        if (!media?.id) return null;
        const caption = media.caption?.trim();
        return {
          ...base,
          text: caption || '[image]',
          contentType: 'image',
          mediaId: media.id,
          ...(media.mime_type !== undefined && { mimeType: media.mime_type }),
          ...(caption !== undefined && { caption }),
        };
      }
      case 'document': {
        const media = message.document;
        if (!media?.id) return null;
        const caption = media.caption?.trim();
        const fileName = media.filename?.trim();
        return {
          ...base,
          text: caption || fileName || '[document]',
          contentType: 'document',
          mediaId: media.id,
          ...(media.mime_type !== undefined && { mimeType: media.mime_type }),
          ...(fileName !== undefined && { fileName }),
          ...(caption !== undefined && { caption }),
        };
      }
      case 'location': {
        const loc = message.location;
        if (loc === undefined || loc.latitude === undefined || loc.longitude === undefined) {
          return null;
        }
        const address = loc.address?.trim();
        const name = loc.name?.trim();
        const text = address || name || `${loc.latitude},${loc.longitude}`;
        return {
          ...base,
          text,
          contentType: 'location',
          latitude: loc.latitude,
          longitude: loc.longitude,
          ...(name !== undefined && { locationName: name }),
          ...(address !== undefined && { locationAddress: address }),
        };
      }
      case 'interactive': {
        const interactive = message.interactive;
        if (!interactive) {
          logger.debug('[WhatsApp] Interactive message missing payload', { messageId: message.id });
          return null;
        }

        let text: string;
        let interactiveReplyId: string | undefined;
        switch (interactive.type) {
          case 'button_reply':
            interactiveReplyId = interactive.button_reply?.id;
            text = interactive.button_reply?.title ?? interactiveReplyId ?? '[button_reply]';
            break;
          case 'list_reply':
            interactiveReplyId = interactive.list_reply?.id;
            text = interactive.list_reply?.title ?? interactiveReplyId ?? '[list_reply]';
            break;
          case 'nfm_reply':
            text = interactive.nfm_reply?.body ?? '[nfm_reply]';
            break;
          default:
            text = '[interactive]';
        }

        logger.debug('[WhatsApp] Interactive inbound parsed', {
          messageId: message.id,
          interactiveType: interactive.type,
          text,
          interactiveReplyId,
        });

        return {
          ...base,
          text,
          contentType: 'text',
          ...(interactiveReplyId !== undefined && { interactiveReplyId }),
        };
      }
      case 'audio':
      case 'video': {
        const media = message[message.type];
        if (!media?.id) return null;
        logger.debug('[WhatsApp] Audio/video inbound (A4/A5)', {
          type: message.type,
          mediaId: media.id,
          mimeType: media.mime_type,
        });
        return {
          ...base,
          text: `[${message.type}]`,
          contentType: message.type,
          mediaId: media.id,
          ...(media.mime_type !== undefined && { mimeType: media.mime_type }),
        };
      }
      case 'sticker': {
        const media = message.sticker;
        if (!media?.id) return null;
        return {
          ...base,
          text: '[sticker]',
          contentType: 'image',
          mediaId: media.id,
          ...(media.mime_type !== undefined && { mimeType: media.mime_type }),
        };
      }
      default:
        logger.debug('[WhatsApp] Ignoring unsupported inbound message type', { type: message.type });
        return null;
    }
  }

  private parseStatusChangeValue(value: MetaWebhookValue): ParsedWhatsAppStatusUpdate[] {
    const inbound = value.statuses;
    if (!inbound?.length) {
      return [];
    }

    return inbound
      .filter((status): status is MetaMessageStatus =>
        status.status === 'sent' ||
        status.status === 'delivered' ||
        status.status === 'read' ||
        status.status === 'failed',
      )
      .map((status) => ({
        externalMessageId: status.id,
        status: status.status,
        timestampMs: Number.parseInt(status.timestamp, 10) * 1000,
        recipientId: status.recipient_id,
      }));
  }

  private resolveProfileName(contacts: MetaContact[] | undefined, waId: string): string | undefined {
    const contact = contacts?.find((item) => item.wa_id === waId);
    const name = contact?.profile.name?.trim();
    return name || undefined;
  }
}
