import type {
  EcommerceGuestCartClient,
  WhatsAppGuestCartPayload,
} from '../../infrastructure/http/ecommerce-guest-cart.client.js';

export function formatGuestCartOpeningSummary(cart: WhatsAppGuestCartPayload | null): string {
  if (!cart || cart.itemCount <= 0) {
    return '';
  }

  const totalLabel = cart.total > 0 ? `aprox. S/ ${cart.total.toFixed(2)}` : 'tu selección';
  return (
    `🛒 Tienes ${cart.itemCount} producto(s) en tu carrito (${totalLabel}).\n` +
    '¿Deseas que armemos tu pedido? Responde *sí* o dime otra prenda que quieras agregar.'
  );
}

export async function fetchGuestCartOpeningSummary(
  client: EcommerceGuestCartClient | undefined,
  customerPhone: string,
): Promise<string> {
  if (!client?.enabled) {
    return '';
  }

  try {
    const result = await client.getHandoff({ customerPhone });
    return formatGuestCartOpeningSummary(result?.cart ?? null);
  } catch {
    return '';
  }
}

export function prependGuestCartSummary(baseMessage: string, cartSummary: string): string {
  const trimmedSummary = cartSummary.trim();
  if (!trimmedSummary) {
    return baseMessage;
  }
  return `${trimmedSummary}\n\n${baseMessage.trim()}`;
}

const CART_CHECKOUT_REQUEST_PATTERN =
  /\b(?:s[ií]|dale|ok|listo|confirmo|armemos|hagamos)\b.{0,40}\b(?:pedido|carrito|compra)\b|\b(?:quiero|deseo)\s+(?:comprar|pagar|cerrar)\s+(?:mi\s+)?carrito\b|\barmar\s+(?:mi\s+)?pedido\b/i;

const CART_SYNC_REQUEST_PATTERN =
  /\b(?:agregu[eé]|añad[ií]|puse|tengo)\b.{0,50}\b(?:productos?|prendas?|art[ií]culos?)\b.{0,30}\b(?:carrito|carro)\b|\b(?:varios|varias)\b.{0,20}\b(?:productos?|prendas?)\b.{0,30}\b(?:carrito|comprar)\b|\b(?:eso|estos|estas)\b.{0,20}\b(?:deseo|quiero)\s+comprar\b/i;

export function isGuestCartSyncRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\[NM-PDP:/i.test(trimmed)) return false;
  return CART_SYNC_REQUEST_PATTERN.test(trimmed);
}

export function isGuestCartCheckoutRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CART_CHECKOUT_REQUEST_PATTERN.test(trimmed);
}

export function buildGuestCartCheckoutHandoffPrompt(itemCount: number, total: number): string {
  const totalPart = total > 0 ? ` (aprox. S/ ${total.toFixed(2)})` : '';
  return (
    `Perfecto, vi que quieres concretar tu pedido con ${itemCount} producto(s)${totalPart} 🛍️\n\n` +
    '¿Te comunico con un asesor de Maritex para ayudarte a cerrar la compra por WhatsApp?'
  );
}
