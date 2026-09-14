import type { Conversation } from '../../domain/entities/conversation.entity.js';
import { isGreeting, MENU_ROW_IDS } from './bot-menu.service.js';
import { parseB2bQuoteMessage } from './ecommerce-b2b-quote.service.js';
import { parseAllPdpPurchaseIntents, parsePdpPurchaseMessage } from './ecommerce-pdp-purchase.service.js';
import { isExplicitHandoffRequest } from './handoff-detection.service.js';

/** Gambling, scams and common international spam (incl. Indonesian / SEA). */
const SPAM_PATTERN =
  /\b(casino|jud[ií]|apuesta|betting|slot|poker|togel|situs|judi|bodong|kapok|namanya\s+jp|akun\s+bodong|main\s+di\s+situs|free\s+money|crypto\s+signal|forex\s+signal|whatsapp\s+group|join\s+group|click\s+here|claim\s+now|bonus\s+deposit)\b/i;

const FOREIGN_SPAM_PATTERN =
  /\b(ga|gak|ngga|nnti|akun|kapok|situs|namanya|bodong|wkwk|anjir|gue|lu|loh|dong|nih|banget|kak|min|bos)\b/i;

/**
 * Strict retail signals only — no vague intent words (quiero, info, hola, etc.).
 * User must mention products, store, prices, categories or Maritex by name.
 */
const STRICT_COMMERCIAL_PATTERN =
  /\b(maritex|novedadesmaritex|ropa|polos?|pantal[oó]n|vestidos?|blusas?|shorts?|casacas?|chompas?|moda|talla|precio|costos?|cu[aá]nto\s+cuesta|catalogo|cat[aá]logo|productos?|modelos?|stock|disponible|oferta|descuento|promoci[oó]n|tienda\s+online|tienda|comprar|compra|pedidos?|env[ií]os?|delivery|entrega|recojo|ni[nñ]os?|ni[nñ]as?|joven|jóvenes|se[nñ]oritas?|adultos?\s+mayor|beb[eé]s?|familia|caballero|dama|mujer|hombre|horarios?|ubicaci[oó]n|direcci[oó]n|sucursal|cotizaci[oó]n|mayoreo|wholesale|por\s+mayor|venta\s+al\s+por\s+mayor)\b/i;

const CATEGORY_SELECTION_PATTERN = /^[1-4]\s*$/;

const NM_ECOMMERCE_TOKEN_PATTERN = /\[NM-(?:PDP|B2B):/i;

const URL_ONLY_PATTERN = /^https?:\/\/\S+$/i;

const MIN_COMMERCIAL_MESSAGE_LENGTH = 6;

function combinedText(content: string, caption?: string): string {
  return [content, caption].filter(Boolean).join(' ').trim();
}

export function isLikelySpam(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return SPAM_PATTERN.test(trimmed) || FOREIGN_SPAM_PATTERN.test(trimmed);
}

function hasLowLatinRatio(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 8) return false;
  const latin = letters.filter((char) => /[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/u.test(char)).length;
  return latin / letters.length < 0.9;
}

export function isSuspiciousInboundText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (URL_ONLY_PATTERN.test(trimmed)) return true;
  if (isGreeting(trimmed)) return true;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(trimmed)) return true;
  if (hasLowLatinRatio(trimmed)) return true;
  if (trimmed.length < MIN_COMMERCIAL_MESSAGE_LENGTH && !STRICT_COMMERCIAL_PATTERN.test(trimmed)) {
    return true;
  }
  return false;
}

export function hasCommercialInterest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (NM_ECOMMERCE_TOKEN_PATTERN.test(trimmed)) return true;
  if (parsePdpPurchaseMessage(trimmed)) return true;
  if (parseAllPdpPurchaseIntents(trimmed).length > 0) return true;
  if (parseB2bQuoteMessage(trimmed)) return true;
  if (isExplicitHandoffRequest(trimmed)) return true;
  if (STRICT_COMMERCIAL_PATTERN.test(trimmed)) return true;

  return false;
}

function conversationHasBotEngagement(conversation: Conversation): boolean {
  return conversation.messages.some((message) => message.role === 'assistant');
}

export function isCommercialInterestFilterEnabled(): boolean {
  const raw = process.env['COMMERCIAL_INTEREST_FILTER_ENABLED'];
  if (raw === undefined || raw === '') return true;
  return raw.toLowerCase() !== 'false' && raw !== '0';
}

export interface InboundCommercialFilterInput {
  content: string;
  caption?: string;
  interactiveReplyId?: string;
  conversation: Conversation | null;
}

/**
 * Strict gate: cold contacts must show clear retail interest.
 * Ongoing chats (after a bot reply) stay open, except obvious spam.
 */
export function shouldBotRespondToInbound(input: InboundCommercialFilterInput): boolean {
  if (!isCommercialInterestFilterEnabled()) return true;

  const text = combinedText(input.content, input.caption);

  if (input.interactiveReplyId) {
    const menuIds = Object.values(MENU_ROW_IDS) as string[];
    if (menuIds.includes(input.interactiveReplyId)) return true;
  }

  const conversation = input.conversation;
  if (conversation?.isHumanMode()) return true;
  if (conversation?.handoffState === 'pending') return true;

  if (!text) return false;
  if (isLikelySpam(text)) return false;

  // Saludos iniciales (ej. "Hola") deben llegar al mensaje de bienvenida de Malu.
  const trimmed = text.trim();
  if (isGreeting(trimmed)) {
    if (!conversation || !conversationHasBotEngagement(conversation)) {
      return true;
    }
  }

  if (conversation && conversationHasBotEngagement(conversation)) {
    if (CATEGORY_SELECTION_PATTERN.test(text)) return true;
    if (isSuspiciousInboundText(text)) return false;
    return true;
  }

  if (isSuspiciousInboundText(text)) return false;
  return hasCommercialInterest(text);
}
