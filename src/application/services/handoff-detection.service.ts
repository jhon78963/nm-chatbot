/** Matches affirmative responses when user confirms wanting an advisor. */
export const HANDOFF_AFFIRMATIVE_PATTERN =
  /\b(s[íi]|si|yes|claro|ok|okay|dale|perfecto|de\s*acuerdo|est[aá]\s*bien|acepto|quiero|as[ií]gname|adelante|afirmativo|por\s*favor|bueno|correcto|exacto|listo|confirme|confirmo)\b/i;

/** Matches explicit negative responses to a handoff offer. */
export const HANDOFF_NEGATIVE_PATTERN =
  /\b(no|nope|nah|negativo|cancelar|cancel|no\s+gracias)\b/i;

/** Bot replies that promise a human advisor without triggering the backend handoff flow. */
const IMPLICIT_HANDOFF_PROMISE_PATTERN =
  /(?:te voy a comunicar|te estoy derivando|te comunicar[eé]|derivar(?:te)? con|comunicarte con).{0,80}asesor|(?:en breve|en unos momentos|un momento).{0,80}asesor|asesor especializado se comunicar[aá]|Para brindarte la informaci[oó]n exacta y una atenci[oó]n personalizada/i;

/** User messages that explicitly request a human advisor. */
const EXPLICIT_HANDOFF_REQUEST_PATTERN =
  /(?:quiero|necesito|deseo|podr[ií]a|puedo|me gustar[ií]a|d[eé]jame|d[eé]jeme).{0,40}(?:asesor|humano|persona|alguien que me atienda)|(?:hablar|comunicarme|contactarme|contactar|escribir).{0,40}asesor|(?:con|un)\s+asesor|asesor\s+especializado|atenci[oó]n\s+personalizada/i;

export function detectHandoffTriggerToken(text: string): boolean {
  return /HANDOFF_TRIGGER/.test(text) || /<<HANDOFF_TRIGGER>>/.test(text);
}

export function detectImplicitHandoffPromise(text: string): boolean {
  return IMPLICIT_HANDOFF_PROMISE_PATTERN.test(text);
}

export function isExplicitHandoffRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || HANDOFF_NEGATIVE_PATTERN.test(trimmed)) return false;
  return EXPLICIT_HANDOFF_REQUEST_PATTERN.test(trimmed);
}

export function isHandoffAffirmative(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || HANDOFF_NEGATIVE_PATTERN.test(trimmed)) return false;
  return HANDOFF_AFFIRMATIVE_PATTERN.test(trimmed);
}

/** User confirmed after the bot already promised (but never executed) a handoff. */
export function isStaleHandoffConfirmation(
  userText: string,
  recentAssistantTexts: string[],
): boolean {
  if (!isHandoffAffirmative(userText)) return false;
  return recentAssistantTexts.some((text) => detectImplicitHandoffPromise(text));
}
