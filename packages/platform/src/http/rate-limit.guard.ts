import { CanActivate, ExecutionContext, Inject, Injectable, Optional, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DomainError } from '@mkt/shared-kernel';

import { currentTenant } from '../tenancy/tenant-context.js';
import {
  resolveClientIp,
  TENANT_RESOLUTION_CONFIG,
  type TenantResolutionConfig,
} from '../tenancy/tenant-context.middleware.js';
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
  readonly socket?: { readonly remoteAddress?: string };
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
 *
 * Duas camadas, com contadores separados:
 * - **cota geral** (padrão do guard): tenant, IP, usuário e API key, somando
 *   todas as rotas;
 * - **limite da rota** (`@RateLimit`): só por cliente (IP, usuário, API key)
 *   e **naquela rota**. Nunca pelo tenant inteiro — um limite de 10 cadastros
 *   por minuto é por pessoa, não "10 cadastros por minuto na loja".
 *
 * O IP vem de `resolveClientIp`: `X-Forwarded-For` só vale com o segredo do
 * edge. Sem isso, trocar o header a cada requisição furaria o limite por IP.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly edge: Pick<TenantResolutionConfig, 'edgeSharedSecret'>;

  constructor(
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly reflector: Reflector,
    @Optional()
    @Inject(RATE_LIMIT_DEFAULTS)
    private readonly defaults: RateLimitConfig = { limit: 120, windowMs: 60_000 },
    @Optional() @Inject(TENANT_RESOLUTION_CONFIG) edge?: TenantResolutionConfig,
  ) {
    this.edge = edge ?? {};
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const route = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const http = context.switchToHttp();
    const request = http.getRequest<IdentifiedRequest>();
    const tenantId = currentTenant()?.tenantId ?? 'platform';
    const clients = clientSubjectsOf(request, this.edge);

    const checks: { bucket: string; config: RateLimitConfig }[] = [
      ...['tenant', ...clients].map((bucket) => ({ bucket, config: this.defaults })),
      ...(route === undefined
        ? []
        : clients.map((bucket) => ({
            bucket: `route:${context.getClass().name}.${context.getHandler().name}:${bucket}`,
            config: route,
          }))),
    ];

    for (const { bucket, config } of checks) {
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

/** Quem está chamando: IP (confiável), usuário e API key. */
function clientSubjectsOf(
  request: IdentifiedRequest,
  edge: Pick<TenantResolutionConfig, 'edgeSharedSecret'>,
): string[] {
  return [
    `ip:${resolveClientIp(request, edge)}`,
    ...(request.user?.id === undefined ? [] : [`user:${request.user.id}`]),
    ...(request.apiKeyId === undefined ? [] : [`apikey:${request.apiKeyId}`]),
  ];
}
