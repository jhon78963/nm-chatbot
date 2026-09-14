import pino, { type Logger as PinoLogger } from 'pino';
import type { ILogger, LogContext } from '../../domain/ports/ilogger.port.js';

const isDev = process.env['NODE_ENV'] !== 'production';

function createPinoInstance(bindings: LogContext = {}): PinoLogger {
  const base = {
    service: process.env['SERVICE_NAME'] ?? 'chatbot-uprit',
    env: process.env['NODE_ENV'] ?? 'development',
    ...bindings,
  };

  if (isDev) {
    return pino({
      level: process.env['LOG_LEVEL'] ?? 'debug',
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    base,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export class LoggerService implements ILogger {
  private readonly pino: PinoLogger;

  constructor(pinoInstance?: PinoLogger) {
    this.pino = pinoInstance ?? createPinoInstance();
  }

  fatal(message: string, context?: LogContext): void {
    this.pino.fatal(context ?? {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.pino.error(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.pino.warn(context ?? {}, message);
  }

  info(message: string, context?: LogContext): void {
    this.pino.info(context ?? {}, message);
  }

  debug(message: string, context?: LogContext): void {
    this.pino.debug(context ?? {}, message);
  }

  trace(message: string, context?: LogContext): void {
    this.pino.trace(context ?? {}, message);
  }

  child(bindings: LogContext): ILogger {
    return new LoggerService(this.pino.child(bindings));
  }
}

export const logger: ILogger = new LoggerService();
