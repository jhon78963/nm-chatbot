import { z, ZodError } from 'zod';
import { IntentionCode } from '../../../domain/enums/intention-code.enum.js';
import { IntentParseError } from '../../exceptions/intent-parse.exception.js';
import { ParsedIntent } from './parse-intent.dto.js';
import type { ParseIntentDto, ParseIntentResult } from './parse-intent.dto.js';

const cleanString = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === '' ? null : v));

const IntentMetaDataSchema = z
  .object({
    filterType: cleanString.nullable().default(null),
    filterValue: z
      .union([
        z.array(z.string()),
        z.string().transform((v) => (v.trim() === '' ? [] : [v.trim()])),
      ])
      .default([]),
  })
  .optional();

const ParsedIntentSchema = z
  .object({
    intent: z
      .string({ required_error: "Field 'intent' is required" })
      .transform((v) => v.trim().toUpperCase())
      .pipe(
        z.nativeEnum(IntentionCode, {
          errorMap: () => ({
            message: `Unrecognized 'intent' value. Valid values: ${Object.values(IntentionCode).join(', ')}`,
          }),
        }),
      ),
    careerId: cleanString.nullable().optional().default(null),
    metaData: IntentMetaDataSchema,
  })
  .strict();

type ValidatedIntent = z.infer<typeof ParsedIntentSchema>;

function extractJsonBlock(raw: string): { block: string; wasNoisy: boolean } {
  const start = raw.indexOf('{');

  if (start === -1) {
    throw new IntentParseError(
      'LLM response does not contain a JSON block ({ ... })',
      'NO_JSON_BLOCK_FOUND',
      raw,
    );
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i] as string;

    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\' && inString) { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const block = raw.slice(start, i + 1);
        const wasNoisy = start > 0 || i < raw.length - 1;
        return { block, wasNoisy };
      }
    }
  }

  throw new IntentParseError(
    'Extracted JSON block is incomplete (unclosed braces)',
    'INCOMPLETE_JSON_BLOCK',
    raw,
  );
}

/**
 * Parses and validates the raw LLM response when identifying user intent.
 */
export class ParseIntentUseCase {
  execute(dto: ParseIntentDto): ParseIntentResult {
    const raw = dto.rawAiResponse;
    const { block, wasNoisy } = extractJsonBlock(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch (syntaxError) {
      throw new IntentParseError(
        `JSON block is not valid JSON: ${(syntaxError as SyntaxError).message}`,
        'INVALID_JSON_SYNTAX',
        raw,
      );
    }

    let data: ValidatedIntent;
    try {
      data = ParsedIntentSchema.parse(parsed);
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues
          .map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`)
          .join(' | ');

        throw new IntentParseError(
          `Invalid schema — ${issues}`,
          'SCHEMA_VALIDATION_FAILED',
          raw,
        );
      }
      throw err;
    }

    const parsedIntent = new ParsedIntent(
      data.intent,
      data.careerId ?? null,
      data.metaData,
    );

    return { parsedIntent, wasExtractedFromNoise: wasNoisy };
  }
}
