import type { Conversation } from '../../domain/entities/conversation.entity.js';

/** Gambling, scams and common international spam (incl. Indonesian / SEA). */
const SPAM_PATTERN =
  /\b(casino|jud[ií]|apuesta|betting|slot|poker|togel|situs|judi|bodong|kapok|namanya\s+jp|akun\s+bodong|main\s+di\s+situs|free\s+money|crypto\s+signal|forex\s+signal|whatsapp\s+group|join\s+group|click\s+here|claim\s+now|bonus\s+deposit)\b/i;

/** Distinctive SEA/Indonesian tokens only — short words like "min"/"bos" collide with Spanish retail chat. */
const FOREIGN_SPAM_PATTERN =
  /\b(gak|ngga|nnti|akun|kapok|situs|namanya|bodong|wkwk|anjir|gue|banget)\b/i;

const MENU_INTERACTIVE_IDS = new Set(['catalog', 'store', 'handoff', 'contact']);

const CATEGORY_SELECTION_PATTERN = /^[1-4]\s*$/;

const URL_ONLY_PATTERN = /^https?:\/\/\S+$/i;

/** Keep in sync with bot-menu.constants.ts — inlined so unit tests can load this file from source. */
const GREETING_PATTERN =
  /^(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hi|hello|hey|ola|qué tal|que tal|buen\s*d[ií]a)(?:[\s!?.¡¿]|[\p{Extended_Pictographic}\p{Emoji_Presentation}])*$/iu;

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
  if (hasLowLatinRatio(trimmed)) return true;
  return false;
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
 * Spam/foreign/URL gate only. Real customers (hola, consultas vagas, follow-ups)
 * must always get a reply — requiring retail keywords made the bot go silent.
 */
export function shouldBotRespondToInbound(input: InboundCommercialFilterInput): boolean {
  if (!isCommercialInterestFilterEnabled()) return true;

  const text = combinedText(input.content, input.caption);

  if (input.interactiveReplyId && MENU_INTERACTIVE_IDS.has(input.interactiveReplyId)) {
    return true;
  }

  const conversation = input.conversation;
  if (conversation?.isHumanMode()) return true;
  if (conversation?.handoffState === 'pending') return true;

  if (!text) return false;
  if (isLikelySpam(text)) return false;
  if (GREETING_PATTERN.test(text.trim())) return true;
  if (CATEGORY_SELECTION_PATTERN.test(text)) return true;
  if (isSuspiciousInboundText(text)) return false;
  return true;
}
