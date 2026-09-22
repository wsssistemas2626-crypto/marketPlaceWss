import { normalizeHost } from './resolve-tenant.js';
import type { TenantDirectoryPort, TenantRecord } from './tenant-directory.port.js';

/**
 * Registro de tenants em memória. Vale para desenvolvimento e testes até a
 * US-075 trazer o módulo `tenancy` com banco e cache.
 */
export class InMemoryTenantDirectory implements TenantDirectoryPort {
  private readonly byId = new Map<string, TenantRecord>();
  private readonly byHost = new Map<string, TenantRecord>();

  constructor(records: readonly TenantRecord[] = []) {
    records.forEach((record) => this.upsert(record));
  }

  upsert(record: TenantRecord): void {
    this.byId.set(record.tenantId, record);
    record.hosts.forEach((host) => this.byHost.set(normalizeHost(host), record));
  }

  async findByHost(host: string): Promise<TenantRecord | undefined> {
    return this.byHost.get(normalizeHost(host));
  }

  async findById(tenantId: string): Promise<TenantRecord | undefined> {
    return this.byId.get(tenantId);
  }
}

/**
 * Tenants de desenvolvimento (`06-plano-execucao.md`, critério de saída da Fase 0).
 * Os ids são UUID v7 fixos para o seed ser reprodutível entre execuções.
 */
export const DEVELOPMENT_TENANTS: readonly TenantRecord[] = [
  {
    tenantId: '0193a000-0000-7000-8000-00000000000a',
    slug: 'loja-a',
    status: 'active',
    cell: 'shared-1',
    hosts: ['loja-a.localhost', 'loja-a.plataforma.local'],
  },
  {
    tenantId: '0193a000-0000-7000-8000-00000000000b',
    slug: 'loja-b',
    status: 'active',
    cell: 'shared-1',
    hosts: ['loja-b.localhost', 'loja-b.plataforma.local'],
  },
];
