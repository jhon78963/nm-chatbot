/**
 * Base exception for the Application layer.
 * Unlike DomainException (business rules), ApplicationException covers
 * orchestration failures: parsing, external data validation, etc.
 */
export class ApplicationException extends Error {
  readonly code: string;

  constructor(message: string, code = 'APPLICATION_ERROR') {
    super(message);
    this.name = 'ApplicationException';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
