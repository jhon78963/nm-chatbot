export interface WhatsAppGuestCartItemInput {
  productId?: string;
  productSizeId?: string;
  colorId?: string;
  productIdPrefix?: string;
  sku?: string;
  name: string;
  variation?: string;
  imageUrl?: string;
  productUrl?: string;
  quantity: number;
  unitPrice?: number;
}

export interface WhatsAppGuestCartPayload {
  sessionId: string;
  warehouseId: string;
  channel: 'whatsapp';
  currency: 'PEN';
  items: Array<WhatsAppGuestCartItemInput & { lineTotal: number; unitPrice: number }>;
  itemCount: number;
  subtotal: number;
  total: number;
  source: 'pdp' | 'bot' | 'handoff';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface WhatsAppGuestCartHandoffResult {
  sessionId: string;
  cart: WhatsAppGuestCartPayload | null;
  handoffUrl: string;
  ttlSeconds: number;
}

const REQUEST_TIMEOUT_MS = 5_000;

export class EcommerceGuestCartClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
  ) {}

  static fromEnv(): EcommerceGuestCartClient {
    return new EcommerceGuestCartClient(
      (process.env['ECOMMERCE_SERVICE_URL'] ?? '').replace(/\/$/, ''),
      process.env['INTERNAL_SERVICE_KEY'] ?? '',
    );
  }

  get enabled(): boolean {
    return Boolean(this.baseUrl && this.serviceKey);
  }

  async upsertCart(input: {
    customerPhone: string;
    warehouseId?: string;
    items: WhatsAppGuestCartItemInput[];
    /** When true, drops previous lines instead of merging by product key. */
    replace?: boolean;
    source?: 'pdp' | 'bot' | 'handoff';
  }): Promise<WhatsAppGuestCartHandoffResult | null> {
    return this.request('PUT', '/ecommerce/whatsapp/internal/guest-cart', input);
  }

  async getHandoff(input: {
    customerPhone?: string;
    sessionId?: string;
  }): Promise<WhatsAppGuestCartHandoffResult | null> {
    return this.request('POST', '/ecommerce/whatsapp/internal/guest-cart/handoff', input);
  }

  async getBySessionId(sessionId: string): Promise<WhatsAppGuestCartHandoffResult | null> {
    return this.request(
      'GET',
      `/ecommerce/whatsapp/internal/guest-cart/${encodeURIComponent(sessionId)}`,
    );
  }

  private async request(
    method: 'GET' | 'PUT' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<WhatsAppGuestCartHandoffResult | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-service-key': this.serviceKey,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as WhatsAppGuestCartHandoffResult;
    } catch {
      return null;
    }
  }
}
