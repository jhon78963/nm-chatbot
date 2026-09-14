/**
 * Logging contract decoupled from the provider (Pino, Winston, etc.).
 * Output should be structured JSON in production for indexing in Loki.
 */
export interface ILogger {
  fatal(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  trace(message: string, context?: LogContext): void;
  child(bindings: LogContext): ILogger;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type LogContext = Record<string, unknown>;
