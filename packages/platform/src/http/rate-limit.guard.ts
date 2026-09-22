import { CanActivate, ExecutionContext, Inject, Injectable, Optional, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DomainError } from '@mkt/shared-kernel';

import { currentTenant } from '../tenancy/tenant-context.js';
import { checkTenantRateLimit, type RateLimitStore } from '../tenancy/tenant-rate-limit.js';

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');
export const RATE_LIMIT_DEFAULTS = Symbol('RATE_LIMIT_DEFAULTS');
const RATE_LIMIT_KEY = 'mkt:rate-limit';

export interface RateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
}

/** Limite específico de uma rota; sem isso vale o padrão do guard. */
export const RateLimit = (config: RateLimitConfig): MethodDecorator => SetMetadata(RATE_LIMIT_KEY, config);

export class RateLimitExceededError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super('rate_limit_exceeded', 'Muitas requisições. Tente de novo em instantes.', {
      retry_after_seconds: retryAfterSeconds,
    });
  }
}

interface IdentifiedRequest {
  readonly ip?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly user?: { id?: string };
  readonly apiKeyId?: string;
}

interface RetryAfterResponse {
  setHeader?(name: string, value: string): unknown;
}

/**
 * Limita por **IP, usuário, API key e tenant** (CLAUDE.md §4.12 e US-007).
 *
 * As quatro dimensões existem porque resolvem coisas diferentes: IP contém
 * abuso anônimo, usuário/API key contêm um cliente específico e a cota por
 * tenant é o que o plano vende (US-073) — e impede que um tenant consuma a
 * capacidade dos outros.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly reflector: Reflector,
    @Optional()
    @Inject(RATE_LIMIT_DEFAULTS)
    private readonly defaults: RateLimitConfig = { limit: 120, windowMs: 60_000 },
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config =
      this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.defaults;

    const http = context.switchToHttp();
    const request = http.getRequest<IdentifiedRequest>();
    const tenantId = currentTenant()?.tenantId ?? 'platform';

    for (const bucket of subjectsOf(request)) {
      const decision = await checkTenantRateLimit(this.store, tenantId, {
        limit: config.limit,
        windowMs: config.windowMs,
        bucket,
      });

      if (!decision.allowed) {
        const retryAfter = Math.ceil(decision.resetInMs / 1_000);
        http.getResponse<RetryAfterResponse>()?.setHeader?.('Retry-After', String(retryAfter));
        throw new RateLimitExceededError(retryAfter);
      }
    }

    return true;
  }
}

/** Dimensões a contar nesta requisição. */
function subjectsOf(request: IdentifiedRequest): string[] {
  const forwarded = request.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? request.ip;

  return [
    'tenant',
    ...(ip === undefined ? [] : [`ip:${ip}`]),
    ...(request.user?.id === undefined ? [] : [`user:${request.user.id}`]),
    ...(request.apiKeyId === undefined ? [] : [`apikey:${request.apiKeyId}`]),
  ];
}
