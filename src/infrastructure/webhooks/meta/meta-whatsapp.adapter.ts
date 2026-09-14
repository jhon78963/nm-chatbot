import axios, { type AxiosInstance } from 'axios';
import type {
  MessagingProviderPort,
  OutboundTextMessage,
  OutboundMediaMessage,
  OutboundMessageResult,
  OutboundInteractiveButtonsMessage,
  OutboundInteractiveListMessage,
  OutboundCtaUrlMessage,
  OutboundLocationMessage,
} from '../../../application/ports/messaging-provider.port.js';
import { logger } from '../../shared/logger.js';
import { formatMetaApiError } from './meta-api-error.js';
import { formatWhatsAppText, toMetaRecipientId } from './format-whatsapp-text.js';
import type { MetaMediaService } from './meta-media.service.js';

interface MetaConfig {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  baseUrl: string;
  timeoutMs?: number;
}

interface MetaSendMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

/**
 * Adapter that implements MessagingProviderPort using the Meta WhatsApp Cloud API.
 */
export class MetaWhatsAppAdapter implements MessagingProviderPort {
  private readonly client: AxiosInstance;
  private readonly phoneNumberId: string;
  private readonly mediaService: MetaMediaService | undefined;

  constructor(config: MetaConfig, mediaService?: MetaMediaService) {
    this.phoneNumberId = config.phoneNumberId;
    this.mediaService = mediaService;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/${config.apiVersion}`,
      timeout: config.timeoutMs ?? 10_000,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendTextMessage(message: OutboundTextMessage): Promise<OutboundMessageResult> {
    const to = toMetaRecipientId(message.to);
    const body = formatWhatsAppText(message.body);

    logger.debug('[Meta] Sending text message', { to });

    try {
      const response = await this.client.post<MetaSendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body },
        },
      );

      const messageId = response.data.messages[0]?.id ?? '';
      logger.debug('[Meta] Message sent', { messageId, to });

      return { messageId, status: 'sent' };
    } catch (err) {
      logger.error('[Meta] Failed to send message', {
        to,
        ...formatMetaApiError(err),
      });
      throw err;
    }
  }

  async sendMediaMessage(message: OutboundMediaMessage): Promise<OutboundMessageResult> {
    const to = toMetaRecipientId(message.to);

    logger.debug('[Meta] Sending media message', { to, type: message.type });

    // Build the media object — prefer mediaId over link
    const mediaObject: Record<string, unknown> = {};
    if (message.mediaId) {
      mediaObject['id'] = message.mediaId;
    } else if (message.link) {
      mediaObject['link'] = message.link;
    } else {
      throw new Error('[MetaWhatsAppAdapter] sendMediaMessage requires either mediaId or link');
    }
    if (message.caption) mediaObject['caption'] = message.caption;
    if (message.fileName && message.type === 'document') mediaObject['filename'] = message.fileName;

    try {
      const response = await this.client.post<MetaSendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: message.type,
          [message.type]: mediaObject,
        },
      );

      const messageId = response.data.messages[0]?.id ?? '';
      logger.debug('[Meta] Media message sent', { messageId, to, type: message.type });

      return { messageId, status: 'sent' };
    } catch (err) {
      logger.error('[Meta] Failed to send media message', {
        to,
        type: message.type,
        ...formatMetaApiError(err),
      });
      throw err;
    }
  }

  async sendLocation(message: OutboundLocationMessage): Promise<OutboundMessageResult> {
    const to = toMetaRecipientId(message.to);

    logger.debug('[Meta] Sending location', { to, lat: message.latitude, lng: message.longitude });

    const locationPayload: Record<string, unknown> = {
      latitude: message.latitude,
      longitude: message.longitude,
    };
    if (message.name) locationPayload['name'] = message.name;
    if (message.address) locationPayload['address'] = message.address;

    try {
      const response = await this.client.post<MetaSendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'location',
          location: locationPayload,
        },
      );

      const messageId = response.data.messages[0]?.id ?? '';
      logger.debug('[Meta] Location sent', { messageId, to });
      return { messageId, status: 'sent' };
    } catch (err) {
      logger.error('[Meta] Failed to send location', { to, ...formatMetaApiError(err) });
      throw err;
    }
  }

  async sendInteractiveButtons(
    message: OutboundInteractiveButtonsMessage,
  ): Promise<OutboundMessageResult> {
    const to = toMetaRecipientId(message.to);
    const buttons = message.buttons.slice(0, 3); // Meta max = 3

    logger.debug('[Meta] Sending interactive buttons', { to, count: buttons.length });

    try {
      const response = await this.client.post<MetaSendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: message.body },
            action: {
              buttons: buttons.map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title },
              })),
            },
          },
        },
      );

      const messageId = response.data.messages[0]?.id ?? '';
      logger.debug('[Meta] Interactive buttons sent', { messageId, to });
      return { messageId, status: 'sent' };
    } catch (err) {
      logger.error('[Meta] Failed to send interactive buttons', { to, ...formatMetaApiError(err) });
      throw err;
    }
  }

  async sendInteractiveList(
    message: OutboundInteractiveListMessage,
  ): Promise<OutboundMessageResult> {
    const to = toMetaRecipientId(message.to);

    logger.debug('[Meta] Sending interactive list', { to });

    try {
      const response = await this.client.post<MetaSendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: message.body },
            action: {
              button: message.buttonText,
              sections: message.sections.map((s) => ({
                title: s.title,
                rows: s.rows.map((r) => ({
                  id: r.id,
                  title: r.title,
                  ...(r.description !== undefined && { description: r.description }),
                })),
              })),
            },
          },
        },
      );

      const messageId = response.data.messages[0]?.id ?? '';
      logger.debug('[Meta] Interactive list sent', { messageId, to });
      return { messageId, status: 'sent' };
    } catch (err) {
      logger.error('[Meta] Failed to send interactive list', { to, ...formatMetaApiError(err) });
      throw err;
    }
  }

  async sendCtaUrl(message: OutboundCtaUrlMessage): Promise<OutboundMessageResult> {
    const to = toMetaRecipientId(message.to);

    logger.debug('[Meta] Sending CTA URL', { to, url: message.url });

    try {
      const response = await this.client.post<MetaSendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: { text: message.body },
            action: {
              name: 'cta_url',
              parameters: {
                display_text: message.displayText,
                url: message.url,
              },
            },
          },
        },
      );

      const messageId = response.data.messages[0]?.id ?? '';
      logger.debug('[Meta] CTA URL sent', { messageId, to });
      return { messageId, status: 'sent' };
    } catch (err) {
      logger.error('[Meta] Failed to send CTA URL', { to, ...formatMetaApiError(err) });
      throw err;
    }
  }

  /** Expose MediaService so use-cases can upload/download without importing infra directly. */
  getMediaService(): MetaMediaService | undefined {
    return this.mediaService;
  }
}
