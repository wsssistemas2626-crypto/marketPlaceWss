import type { TenantStatus } from './tenant-context.js';

/** O que o registro de tenants (módulo `tenancy`, US-075) devolve. */
export interface TenantRecord {
  readonly tenantId: string;
  readonly slug: string;
  readonly status: TenantStatus;
  readonly cell: string;
  /** Hosts que respondem por este tenant (subdomínio e domínios próprios). */
  readonly hosts: readonly string[];
}

/**
 * Porta de leitura do registro de tenants. A implementação real (banco +
 * cache Redis de 60 s) chega na US-075; até lá roda a versão em memória.
 */
export interface TenantDirectoryPort {
  findByHost(host: string): Promise<TenantRecord | undefined>;
  findById(tenantId: string): Promise<TenantRecord | undefined>;
}

/** Token de injeção do Nest. */
export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');
