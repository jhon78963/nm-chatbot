export interface StructuredAiResponse {
  message: string;
  purchaseCategory: string | null;
}

/** True when the payload is the internal {message, purchaseCategory} wire format. */
export function looksLikeStructuredAiResponse(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') && t.includes('"message"') && t.includes('"purchaseCategory"');
}

function containsStructuredFields(text: string): boolean {
  return text.includes('"message"') && text.includes('"purchaseCategory"');
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Extracts the first balanced `{...}` block, respecting quoted strings.
 * Returns null when the payload is incomplete or not JSON-shaped.
 */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** Last-resort extractor for pretty-printed / slightly malformed JSON from the LLM. */
function lenientExtractMessageAndCategory(raw: string): StructuredAiResponse | null {
  const purchaseMatch = raw.match(/"purchaseCategory"\s*:\s*"([^"]+)"/);
  const messageKeyMatch = raw.match(/"message"\s*:\s*"/);
  if (!messageKeyMatch) return null;

  const contentStart = messageKeyMatch.index! + messageKeyMatch[0].length;
  const purchaseKeyIdx = raw.search(/"purchaseCategory"\s*:/);
  if (purchaseKeyIdx === -1 || purchaseKeyIdx <= contentStart) return null;

  let messageBody = raw.slice(contentStart, purchaseKeyIdx).trim();
  messageBody = messageBody.replace(/"\s*,?\s*$/, '');

  if (!messageBody) return null;

  return {
    message: messageBody.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    purchaseCategory: purchaseMatch?.[1] ?? null,
  };
}

function parseStructuredBlock(block: string): StructuredAiResponse | null {
  const trimmed = stripCodeFences(block);
  if (!containsStructuredFields(trimmed)) return null;

  const jsonBlock = extractJsonObject(trimmed) ?? trimmed;
  try {
    const obj = JSON.parse(jsonBlock) as Record<string, unknown>;
    if (typeof obj['message'] === 'string') {
      return {
        message: obj['message'],
        purchaseCategory: typeof obj['purchaseCategory'] === 'string' ? obj['purchaseCategory'] : null,
      };
    }
  } catch {
    // fall through to lenient parser
  }

  return lenientExtractMessageAndCategory(trimmed);
}

/** Removes trailing ```json { ... } ``` wire-format blocks the model sometimes appends after plain text. */
function stripTrailingStructuredPayload(raw: string): string {
  return raw
    .replace(/\s*```(?:json)?\s*\{[\s\S]*?"message"[\s\S]*?"purchaseCategory"[\s\S]*?\}\s*```/gi, '')
    .replace(/\s*\{[\s\S]*?"message"\s*:\s*"[\s\S]*?"purchaseCategory"\s*:\s*"[^"]*"[\s\S]*?\}\s*$/i, '')
    .trim();
}

/**
 * Converts an LLM response that may be `{"message":"...","purchaseCategory":"..."}` into
 * user-facing plain text. Prompts 4/5 (General / Categoría) use this internal JSON format;
 * WhatsApp must only ever receive the `message` field.
 *
 * Also handles mixed replies where the model outputs human text and then appends a fenced
 * JSON block with the same wire format.
 */
export function parseStructuredAiResponse(raw: string): StructuredAiResponse {
  // 1. Fenced JSON anywhere in the response (common LLM mistake after plain-text preamble).
  const fencedBlocks = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedBlocks) {
    const parsed = parseStructuredBlock(match[1] ?? '');
    if (parsed) return parsed;
  }

  // 2. Whole string is JSON (original behaviour).
  const trimmed = stripCodeFences(raw);
  if (looksLikeStructuredAiResponse(trimmed)) {
    const parsed = parseStructuredBlock(trimmed);
    if (parsed) return parsed;
  }

  // 3. Inline JSON object anywhere (e.g. plain text followed by a raw { ... } block).
  if (containsStructuredFields(raw)) {
    const block = extractJsonObject(raw);
    if (block) {
      const parsed = parseStructuredBlock(block);
      if (parsed) return parsed;
    }
    const lenient = lenientExtractMessageAndCategory(raw);
    if (lenient) return lenient;
  }

  // 4. No structured payload — strip any trailing JSON debris and return plain text.
  return { message: stripTrailingStructuredPayload(raw), purchaseCategory: null };
}
