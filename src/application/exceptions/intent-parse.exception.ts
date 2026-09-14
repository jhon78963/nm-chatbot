export type IntentParseReason =
  | 'NO_JSON_BLOCK_FOUND'
  | 'INCOMPLETE_JSON_BLOCK'
  | 'INVALID_JSON_SYNTAX'
  | 'SCHEMA_VALIDATION_FAILED';

/**
 * Raised when the raw LLM response cannot be converted into a valid ParsedIntent.
 * The reason field lets the chatbot decide whether to retry the LLM call or escalate.
 */
export class IntentParseError extends Error {
  readonly reason: IntentParseReason;
  readonly rawSnippet: string;

  constructor(message: string, reason: IntentParseReason, rawResponse: string) {
    super(message);
    this.name = 'IntentParseError';
    this.reason = reason;
    this.rawSnippet = rawResponse.slice(0, 500);
    Error.captureStackTrace(this, this.constructor);
  }

  isRetryable(): boolean {
    return this.reason === 'INVALID_JSON_SYNTAX' || this.reason === 'NO_JSON_BLOCK_FOUND';
  }
}
