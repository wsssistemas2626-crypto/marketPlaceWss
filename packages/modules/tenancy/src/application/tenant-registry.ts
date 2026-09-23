import type { TenantStatus } from '@mkt/platform';

export interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly cell: string;
  readonly planId?: string;
  readonly hosts: readonly string[];
}

export interface ProvisionTenantInput {
  readonly slug: string;
  readonly name: string;
  readonly planId?: string;
  /** Host do storefront; o padrão é `{slug}.{PLATFORM_ROOT_DOMAIN}`. */
  readonly hostname?: string;
  /** Status inicial. O provisionamento (US-076) começa em `provisioning`. */
  readonly status?: TenantStatus;
}

/**
 * Operações do registro de tenants, usadas pelas rotas `/v1/platform/*`
 * (staff) — nunca por um tenant.
 */
export interface TenantRegistryPort {
  list(): Promise<TenantSummary[]>;
  findBySlug(slug: string): Promise<TenantSummary | undefined>;
  provision(input: ProvisionTenantInput): Promise<TenantSummary>;
  changeStatus(tenantId: string, status: TenantStatus): Promise<TenantSummary>;
}

export const TENANT_REGISTRY = Symbol('TENANT_REGISTRY');
