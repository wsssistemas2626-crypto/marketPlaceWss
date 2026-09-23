import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';

import { resolveTenantByHost } from './resolve-tenant.js';
import { runWithTenant } from './tenant-context.js';
import { TENANT_DIRECTORY, type TenantDirectoryPort } from './tenant-directory.port.js';

/** Só o que o middleware precisa da requisição — evita acoplar ao Express. */
export interface HostCarrier {
  readonly headers: Record<string, string | string[] | undefined>;
}

export interface TenantResolutionConfig {
  /** Célula deste processo (ADR-012). */
  readonly cell: string;
  /**
   * Segredo combinado com o edge (Cloudflare Worker → Railway). Só com ele o
   * `X-Forwarded-Host` é aceito; sem isso qualquer cliente se passaria por
   * outro tenant (ADR-014 §6, US-085).
   */
  readonly edgeSharedSecret?: string;
}

export const TENANT_RESOLUTION_CONFIG = Symbol('TENANT_RESOLUTION_CONFIG');

const header = (request: HostCarrier, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Host efetivo da requisição. `X-Forwarded-Host` só vale com `X-Edge-Secret`
 * correto; caso contrário é ignorado em favor do `Host`.
 */
export function resolveRequestHost(request: HostCarrier, config: TenantResolutionConfig): string {
  const forwarded = header(request, 'x-forwarded-host');
  const edgeSecret = header(request, 'x-edge-secret');
  const trusted =
    forwarded !== undefined &&
    config.edgeSharedSecret !== undefined &&
    config.edgeSharedSecret !== '' &&
    edgeSecret === config.edgeSharedSecret;

  return (trusted ? forwarded : header(request, 'host')) ?? '';
}

/**
 * IP de quem está do outro lado (consentimento LGPD, auditoria).
 *
 * Mesma regra do host: `X-Forwarded-For` só vale acompanhado do segredo do
 * edge — senão qualquer cliente escolheria o IP que fica registrado. Sem
 * borda confiável, vale o endereço da conexão.
 */
export function resolveClientIp(
  request: HostCarrier & { readonly ip?: string; readonly socket?: { readonly remoteAddress?: string } },
  config: Pick<TenantResolutionConfig, 'edgeSharedSecret'>,
): string {
  const trusted =
    config.edgeSharedSecret !== undefined &&
    config.edgeSharedSecret !== '' &&
    header(request, 'x-edge-secret') === config.edgeSharedSecret;

  const forwarded = trusted ? header(request, 'x-forwarded-for')?.split(',')[0]?.trim() : undefined;
  const address = forwarded ?? request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0';

  // IPv4 mapeado em IPv6 (`::ffff:1.2.3.4`) vira o IPv4
  return address.replace(/^::ffff:/, '');
}

/**
 * Abre o `TenantContext` para rotas do storefront e da API pública por host.
 *
 * Note que **nada** aqui lê `tenantId` do corpo, da query ou de header livre
 * (CLAUDE.md §4.11): o único sinal é o host (ou o forwarded host assinado).
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectoryPort,
    @Inject(TENANT_RESOLUTION_CONFIG) private readonly config: TenantResolutionConfig,
  ) {}

  async use(request: HostCarrier, _response: unknown, next: (error?: unknown) => void): Promise<void> {
    try {
      const context = await resolveTenantByHost(resolveRequestHost(request, this.config), {
        directory: this.directory,
        cell: this.config.cell,
      });
      runWithTenant(context, next);
    } catch (error) {
      next(error);
    }
  }
}
