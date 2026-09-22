import { pino, type Logger as PinoLogger } from 'pino';

import { currentCorrelationId } from './correlation-id.js';
import { currentTenant } from '../tenancy/tenant-context.js';

/**
 * Campos cujo valor **nunca** vai para o log (RNF-LGPD-04 e CLAUDE.md §4.9).
 *
 * A lista cobre o nome do campo em qualquer profundidade (`*.cpf`), porque o
 * mesmo dado aparece dentro de DTO, evento, payload de webhook e erro.
 */
export const REDACTED_FIELDS = [
  'cpf',
  'cnpj',
  'document',
  'email',
  'phone',
  'mobile',
  'address',
  'street',
  'zipCode',
  'zip_code',
  'birthDate',
  'birth_date',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cardNumber',
  'card_number',
  'cvv',
  'bankAccount',
  'bank_account',
  'pixKey',
  'pix_key',
];

/** Caminhos efetivamente redigidos — exportado para o teste provar a cobertura. */
export const REDACT_PATHS = [
  ...REDACTED_FIELDS,
  ...REDACTED_FIELDS.map((field) => `*.${field}`),
  ...REDACTED_FIELDS.map((field) => `*.*.${field}`),
  ...REDACTED_FIELDS.map((field) => `*.*.*.${field}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
];

export interface LoggerOptions {
  readonly level?: string;
  readonly service: string;
  readonly environment?: string;
  /** Saída legível em desenvolvimento; JSON em produção. */
  readonly pretty?: boolean;
}

export function createLogger(options: LoggerOptions): PinoLogger {
  return pino({
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: {
      service: options.service,
      env: options.environment ?? process.env.NODE_ENV ?? 'development',
    },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(options.pretty === true
      ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
      : {}),
  });
}

/**
 * Campos que todo log carrega: quem é o tenant e qual requisição gerou isso.
 * É o que torna o log filtrável por tenant (`06-multi-tenancy.md` §4) e
 * permite seguir um erro do storefront até o adapter (RNF-OBS-01).
 */
export function logContext(): Record<string, string> {
  const tenant = currentTenant();
  const correlationId = currentCorrelationId();

  return {
    ...(tenant === undefined ? {} : { 'tenant.id': tenant.tenantId, 'tenant.slug': tenant.slug }),
    ...(correlationId === undefined ? {} : { correlation_id: correlationId }),
  };
}

/** Logger já com tenant e correlation id do contexto atual. */
export function contextualLogger(logger: PinoLogger): PinoLogger {
  return logger.child(logContext());
}

export type { PinoLogger };
