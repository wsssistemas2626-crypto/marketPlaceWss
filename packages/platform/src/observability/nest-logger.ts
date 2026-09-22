import type { LoggerService } from '@nestjs/common';

import { contextualLogger, type PinoLogger } from './logger.js';

/**
 * Faz o Nest escrever no pino: log estruturado, com redação de PII e com
 * `tenant.id` e `correlation_id` do contexto (RNF-LGPD-04, RNF-OBS-01).
 */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
    message: unknown,
    context?: unknown,
  ): void {
    contextualLogger(this.logger)[level](
      typeof context === 'string' ? { context } : {},
      typeof message === 'string' ? message : JSON.stringify(message),
    );
  }

  log(message: unknown, context?: unknown): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: unknown, context?: unknown): void {
    contextualLogger(this.logger).error(
      {
        context: typeof context === 'string' ? context : undefined,
        stack: typeof stack === 'string' ? stack : undefined,
      },
      typeof message === 'string' ? message : JSON.stringify(message),
    );
  }

  warn(message: unknown, context?: unknown): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: unknown): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: unknown): void {
    this.write('trace', message, context);
  }
}
