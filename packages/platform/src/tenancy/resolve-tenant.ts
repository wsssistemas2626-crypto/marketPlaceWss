import type { TenantContext } from './tenant-context.js';
import type { TenantDirectoryPort, TenantRecord } from './tenant-directory.port.js';
import { TenantMismatchError, TenantNotFoundError, TenantSuspendedError } from './tenant-errors.js';

/** Tenant fora destes estados não atende requisição (`06-multi-tenancy.md` §9). */
const SERVING_STATUSES = new Set(['trial', 'active']);

/** Remove porta, espaços e caixa alta — `Loja-A.localhost:3000` → `loja-a.localhost`. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().split(':')[0] ?? '';
}

function toContext(record: TenantRecord): TenantContext {
  return {
    tenantId: record.tenantId,
    slug: record.slug,
    status: record.status,
    cell: record.cell,
  };
}

function assertServing(record: TenantRecord, cell: string): TenantContext {
  // tenant de outra célula não existe para este processo — mesma resposta de host desconhecido
  if (record.cell !== cell) throw new TenantNotFoundError();
  if (record.status === 'suspended') throw new TenantSuspendedError(record.slug);
  if (!SERVING_STATUSES.has(record.status)) throw new TenantNotFoundError();
  return toContext(record);
}

export interface ResolveTenantOptions {
  readonly directory: TenantDirectoryPort;
  /** Célula deste processo. Padrão `shared-1` (ADR-012). */
  readonly cell?: string;
}

/** Resolve o tenant pelo host do storefront. */
export async function resolveTenantByHost(
  host: string,
  { directory, cell = 'shared-1' }: ResolveTenantOptions,
): Promise<TenantContext> {
  const record = await directory.findByHost(normalizeHost(host));
  if (record === undefined) throw new TenantNotFoundError();
  return assertServing(record, cell);
}

/** Resolve pelo id — usado pelos guards de painel (organização da Clerk) e por jobs. */
export async function resolveTenantById(
  tenantId: string,
  { directory, cell = 'shared-1' }: ResolveTenantOptions,
): Promise<TenantContext> {
  const record = await directory.findById(tenantId);
  if (record === undefined) throw new TenantNotFoundError();
  return assertServing(record, cell);
}

/**
 * Credencial (token de comprador, API key) precisa pertencer ao tenant do
 * contexto — senão é 403 `tenant_mismatch`, não 404.
 */
export function assertSameTenant(context: TenantContext, credentialTenantId: string): void {
  if (context.tenantId !== credentialTenantId) {
    throw new TenantMismatchError();
  }
}
