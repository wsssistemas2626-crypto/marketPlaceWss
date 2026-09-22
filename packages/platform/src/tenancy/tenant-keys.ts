import { ValidationError } from '@mkt/shared-kernel';

import { requireTenant } from './tenant-context.js';

const assertTenantId = (tenantId: string): string => {
  if (tenantId.trim() === '') {
    throw new ValidationError('tenantId é obrigatório para montar a chave', { field: 'tenantId' });
  }
  return tenantId;
};

/**
 * Chave de cache/fila no Redis: `t:{tenantId}:...`
 * (`06-multi-tenancy.md` §4). Prefixar por tenant impede que um `KEYS`/`SCAN`
 * mal escrito ou uma colisão de nome misture dados de tenants diferentes.
 */
export function tenantCacheKey(...parts: readonly string[]): string {
  return tenantCacheKeyFor(requireTenant().tenantId, ...parts);
}

export function tenantCacheKeyFor(tenantId: string, ...parts: readonly string[]): string {
  return [`t:${assertTenantId(tenantId)}`, ...parts].join(':');
}

/**
 * Prefixo no object storage: `t/{tenantId}/...`. As URLs pré-assinadas são
 * emitidas **somente** para o prefixo do tenant do contexto (ADR-014 §5).
 */
export function tenantStorageKey(...parts: readonly string[]): string {
  return tenantStorageKeyFor(requireTenant().tenantId, ...parts);
}

export function tenantStorageKeyFor(tenantId: string, ...parts: readonly string[]): string {
  return [`t/${assertTenantId(tenantId)}`, ...parts].join('/');
}

/** Um índice de busca por tenant (`products_{tenantId}`). */
export function tenantSearchIndex(entity: string, tenantId: string = requireTenant().tenantId): string {
  return `${entity}_${assertTenantId(tenantId)}`;
}

/**
 * Atributos de log/trace/métrica. `tenant.id` em tudo é o que torna um
 * dashboard filtrável por tenant (`06-multi-tenancy.md` §4).
 */
export function tenantTelemetryAttributes(): Record<string, string> {
  const tenant = requireTenant();
  return { 'tenant.id': tenant.tenantId, 'tenant.slug': tenant.slug };
}
