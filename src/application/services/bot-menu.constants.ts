/** list_reply.id values for the main bot menu. */
export const MENU_ROW_IDS = {
  CATALOG: 'catalog',
  STORE: 'store',
  HANDOFF: 'handoff',
  CONTACT: 'contact',
} as const;

export type MenuSelection = (typeof MENU_ROW_IDS)[keyof typeof MENU_ROW_IDS];

/** button_reply.id values for interactive handoff confirmation. */
export const HANDOFF_BUTTON_IDS = {
  YES: 'handoff_yes',
  NO: 'handoff_no',
} as const;

const GREETING_PATTERN =
  /^(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hi|hello|hey|ola|qué tal|que tal|buen\s*d[ií]a)(?:[\s!?.¡¿]|[\p{Extended_Pictographic}\p{Emoji_Presentation}])*$/iu;

export function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim());
}
