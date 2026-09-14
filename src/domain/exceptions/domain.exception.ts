export class DomainException extends Error {
  readonly code: string;

  constructor(message: string, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainException';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
