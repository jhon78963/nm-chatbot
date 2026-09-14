import type { IntentionCode } from '../../../domain/enums/intention-code.enum.js';

export interface ParseIntentDto {
  rawAiResponse: string;
}

export interface IntentMetaData {
  filterType: string | null;
  filterValue: string[];
}

/**
 * Immutable value object representing a parsed user intent from the LLM.
 */
export class ParsedIntent {
  readonly intent: IntentionCode;
  readonly careerId: string | null;
  readonly metaData: Readonly<IntentMetaData> | undefined;

  constructor(
    intent: IntentionCode,
    careerId: string | null,
    metaData: IntentMetaData | undefined,
  ) {
    this.intent = intent;
    this.careerId = careerId;
    this.metaData = metaData !== undefined ? Object.freeze({ ...metaData }) : undefined;
    Object.freeze(this);
  }

  requiresProgram(): boolean {
    return this.careerId !== null;
  }

  hasFilter(): boolean {
    return (
      this.metaData !== undefined &&
      this.metaData.filterType !== null &&
      this.metaData.filterValue.length > 0
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      intent: this.intent,
      careerId: this.careerId,
      ...(this.metaData !== undefined && { metaData: this.metaData }),
    };
  }
}

export interface ParseIntentResult {
  parsedIntent: ParsedIntent;
  wasExtractedFromNoise: boolean;
}
