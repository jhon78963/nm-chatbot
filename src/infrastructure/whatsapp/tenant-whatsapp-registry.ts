import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../shared/logger.js';
import { MetaWhatsAppAdapter } from '../webhooks/meta/meta-whatsapp.adapter.js';
import { MetaMediaService } from '../webhooks/meta/meta-media.service.js';
import type {
  MessagingProviderPort,
  OutboundCtaUrlMessage,
  OutboundInteractiveButtonsMessage,
  OutboundInteractiveListMessage,
  OutboundLocationMessage,
  OutboundMediaMessage,
  OutboundTextMessage,
} from '../../application/ports/messaging-provider.port.js';

export interface WhatsAppAccount {
  tenantId: string;
  isPlatform: boolean;
  botName: string;
  token: string;
  phoneNumberId: string;
  wabaId?: string;
  verifyToken?: string;
  appSecret?: string;
  displayPhone?: string;
  welcomeMessage?: string;
  storeUrl?: string;
  knowledge?: string;
}

interface TenantAccountPayload {
  tenantId?: string;
  isPlatform?: boolean;
  botName?: string;
  token?: string;
  phoneNumberId?: string;
  wabaId?: string;
  verifyToken?: string;
  appSecret?: string;
  displayPhone?: string;
  welcomeMessage?: string;
  storeUrl?: string;
  knowledge?: string;
}

const accountAls = new AsyncLocalStorage<WhatsAppAccount>();

export function runWithWhatsAppAccount<T>(account: WhatsAppAccount, fn: () => T): T {
  return accountAls.run(account, fn);
}

export function currentWhatsAppAccount(): WhatsAppAccount | undefined {
  return accountAls.getStore();
}

export async function runWithConversationAccount<T>(
  registry: TenantWhatsAppRegistry,
  conversation: { metaData?: { phoneNumberId?: string } | null } | null,
  fn: () => Promise<T>,
): Promise<T> {
  const account = await registry.getByPhoneNumberId(conversation?.metaData?.phoneNumberId);
  if (!account) {
    throw new Error(
      'WhatsApp no está configurado para esta tienda. Carga las llaves en Integraciones.',
    );
  }
  return runWithWhatsAppAccount(account, fn);
}

export class TenantWhatsAppRegistry {
  private accounts: WhatsAppAccount[] = [];
  private loadedAt = 0;
  private readonly ttlMs = 60_000;
  private readonly adapters = new Map<string, MetaWhatsAppAdapter>();
  private readonly media = new Map<string, MetaMediaService>();

  constructor(private readonly envAccount: WhatsAppAccount | null) {
    if (envAccount?.token && envAccount.phoneNumberId) {
      this.accounts = [envAccount];
    }
  }

  adapterFor(account: WhatsAppAccount): MetaWhatsAppAdapter {
    const cached = this.adapters.get(account.phoneNumberId);
    if (cached) return cached;
    const adapter = new MetaWhatsAppAdapter(
      {
        token: account.token,
        phoneNumberId: account.phoneNumberId,
        apiVersion: process.env['META_API_VERSION'] ?? 'v20.0',
        baseUrl: process.env['META_API_BASE_URL'] ?? 'https://graph.facebook.com',
      },
      this.mediaFor(account),
    );
    this.adapters.set(account.phoneNumberId, adapter);
    return adapter;
  }

  mediaFor(account: WhatsAppAccount): MetaMediaService {
    const cached = this.media.get(account.phoneNumberId);
    if (cached) return cached;
    const service = new MetaMediaService({
      token: account.token,
      phoneNumberId: account.phoneNumberId,
      apiVersion: process.env['META_API_VERSION'] ?? 'v20.0',
      baseUrl: process.env['META_API_BASE_URL'] ?? 'https://graph.facebook.com',
    });
    this.media.set(account.phoneNumberId, service);
    return service;
  }

  currentAdapter(): MetaWhatsAppAdapter | null {
    const account = accountAls.getStore();
    if (!account?.token || !account.phoneNumberId) return null;
    return this.adapterFor(account);
  }

  currentMedia(): MetaMediaService | null {
    const account = accountAls.getStore();
    if (!account?.token || !account.phoneNumberId) return null;
    return this.mediaFor(account);
  }

  async getByPhoneNumberId(phoneNumberId?: string | null): Promise<WhatsAppAccount | null> {
    const id = phoneNumberId?.trim();
    const accounts = await this.refresh();
    if (id) {
      return accounts.find((item) => item.phoneNumberId === id) ?? null;
    }
    return this.envAccount;
  }

  async getByVerifyToken(token?: string | null): Promise<WhatsAppAccount | null> {
    const value = token?.trim();
    if (!value) return null;
    const accounts = await this.refresh();
    return (
      accounts.find((item) => item.verifyToken && item.verifyToken === value) ??
      (this.envAccount?.verifyToken === value ? this.envAccount : null)
    );
  }

  async signatureSecrets(): Promise<string[]> {
    const accounts = await this.refresh();
    const secrets = [
      process.env['WEBHOOK_SECRET']?.trim(),
      ...accounts.map((item) => item.appSecret?.trim()),
    ].filter((item): item is string => Boolean(item));
    return Array.from(new Set(secrets));
  }

  private async refresh(): Promise<WhatsAppAccount[]> {
    if (Date.now() - this.loadedAt < this.ttlMs && this.accounts.length > 0) {
      return this.accounts;
    }

    const remote = await this.fetchRemoteAccounts();
    const merged = new Map<string, WhatsAppAccount>();
    if (this.envAccount?.phoneNumberId) {
      merged.set(this.envAccount.phoneNumberId, this.envAccount);
    }
    for (const account of remote) {
      if (account.phoneNumberId && account.token) {
        merged.set(account.phoneNumberId, account);
      }
    }
    this.accounts = Array.from(merged.values());
    this.loadedAt = Date.now();
    this.adapters.clear();
    this.media.clear();
    return this.accounts;
  }

  private async fetchRemoteAccounts(): Promise<WhatsAppAccount[]> {
    const base = (
      process.env['AUTH_SERVICE_URL'] ??
      process.env['AUTH_SERVICE_INTERNAL_URL'] ??
      ''
    ).replace(/\/$/, '');
    const key = process.env['INTERNAL_SERVICE_KEY']?.trim();
    if (!base || !key) return [];

    const url = `${base}/tenant-chatbot/internal/accounts`;
    try {
      const response = await fetch(url, {
        headers: { 'x-internal-service-key': key },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        logger.warn('[WhatsAppRegistry] No se pudieron leer cuentas por tenant', {
          status: response.status,
        });
        return [];
      }
      const payload = (await response.json()) as TenantAccountPayload[];
      if (!Array.isArray(payload)) return [];
      return payload
        .filter((row) => row.token && row.phoneNumberId && row.tenantId)
        .map((row) => ({
          tenantId: String(row.tenantId),
          isPlatform: row.isPlatform === true,
          botName: row.botName?.trim() || 'Asistente',
          token: String(row.token),
          phoneNumberId: String(row.phoneNumberId),
          ...(row.wabaId ? { wabaId: row.wabaId } : {}),
          ...(row.verifyToken ? { verifyToken: row.verifyToken } : {}),
          ...(row.appSecret ? { appSecret: row.appSecret } : {}),
          ...(row.displayPhone ? { displayPhone: row.displayPhone } : {}),
          ...(row.welcomeMessage ? { welcomeMessage: row.welcomeMessage } : {}),
          ...(row.storeUrl ? { storeUrl: row.storeUrl } : {}),
          ...(row.knowledge ? { knowledge: row.knowledge } : {}),
        }));
    } catch (error) {
      logger.warn('[WhatsAppRegistry] Error al leer cuentas por tenant', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

export class RoutingMetaWhatsAppAdapter implements MessagingProviderPort {
  constructor(private readonly registry: TenantWhatsAppRegistry) {}

  private adapter(): MetaWhatsAppAdapter {
    const adapter = this.registry.currentAdapter();
    if (!adapter) {
      throw new Error('WhatsApp no está configurado para esta tienda. Carga las llaves en Integraciones.');
    }
    return adapter;
  }

  sendTextMessage(message: OutboundTextMessage) {
    return this.adapter().sendTextMessage(message);
  }

  sendMediaMessage(message: OutboundMediaMessage) {
    return this.adapter().sendMediaMessage(message);
  }

  sendLocation(message: OutboundLocationMessage) {
    return this.adapter().sendLocation(message);
  }

  sendInteractiveButtons(message: OutboundInteractiveButtonsMessage) {
    return this.adapter().sendInteractiveButtons(message);
  }

  sendInteractiveList(message: OutboundInteractiveListMessage) {
    return this.adapter().sendInteractiveList(message);
  }

  sendCtaUrl(message: OutboundCtaUrlMessage) {
    return this.adapter().sendCtaUrl(message);
  }
}

export class RoutingMetaMediaService {
  constructor(private readonly registry: TenantWhatsAppRegistry) {}

  downloadMedia(mediaId: string) {
    const media = this.registry.currentMedia();
    if (!media) {
      throw new Error('WhatsApp no está configurado para esta tienda. Carga las llaves en Integraciones.');
    }
    return media.downloadMedia(mediaId);
  }

  uploadMedia(buffer: Buffer, mimeType: string) {
    const media = this.registry.currentMedia();
    if (!media) {
      throw new Error('WhatsApp no está configurado para esta tienda. Carga las llaves en Integraciones.');
    }
    return media.uploadMedia(buffer, mimeType);
  }
}
