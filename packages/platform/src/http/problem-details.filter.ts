import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { DomainError } from '@mkt/shared-kernel';

import { currentCorrelationId } from '../observability/correlation-id.js';
import { TenantError } from '../tenancy/tenant-errors.js';

/** Erro HTTP no formato RFC 9457 (Problem Details), usado em toda a API. */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code: string;
  /** Liga a resposta ao log e ao trace (RNF-OBS-01). */
  readonly correlation_id?: string;
  readonly [key: string]: unknown;
}

/** Códigos de erro de domínio → status HTTP (CLAUDE.md §5). */
const STATUS_BY_CODE: Record<string, number> = {
  validation_error: 422,
  invariant_violation: 409,
  conflict: 409,
  not_found: 404,
  idempotency_key_required: 400,
  idempotency_key_reused: 409,
  idempotent_request_in_flight: 409,
  rate_limit_exceeded: 429,
  module_not_enabled: 403,
  plan_limit_reached: 409,
  config_key_not_found: 500,
};

const statusOf = (error: DomainError): number =>
  error instanceof TenantError ? error.httpStatus : (STATUS_BY_CODE[error.code] ?? 400);

/** Resposta mínima de que o filtro precisa — evita acoplar ao Express. */
interface ProblemResponse {
  status(code: number): ProblemResponse;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

interface PathCarrier {
  readonly url?: string;
}

/**
 * Traduz exceções para Problem Details.
 *
 * A US-006 acrescenta `correlation_id`, log estruturado e redação de PII;
 * aqui já garantimos que erro de tenancy responde 404/403 (e não 500) e que
 * falha inesperada nunca vaza mensagem interna.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ProblemResponse>();
    const request = http.getRequest<PathCarrier>();
    const problem = this.toProblem(exception, request?.url);

    response.setHeader('Content-Type', 'application/problem+json');
    response.status(problem.status).json(problem);
  }

  private toProblem(exception: unknown, instance: string | undefined): ProblemDetails {
    const correlationId = currentCorrelationId();
    const base = {
      ...(instance === undefined ? {} : { instance }),
      ...(correlationId === undefined ? {} : { correlation_id: correlationId }),
    };

    if (exception instanceof DomainError) {
      const status = statusOf(exception);
      return {
        type: `https://errors.marketplace/${exception.code}`,
        title: exception.message,
        status,
        code: exception.code,
        ...exception.details,
        ...base,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: exception.message,
        status,
        code: status === 404 ? 'not_found' : 'http_error',
        ...base,
      };
    }

    // inesperado: registra o detalhe no log e devolve resposta genérica
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return {
      type: 'about:blank',
      title: 'Erro interno',
      status: 500,
      code: 'internal_error',
      ...base,
    };
  }
}
