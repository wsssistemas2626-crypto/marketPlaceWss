import type { IntegrationCategory } from '@mkt/contracts';

export interface ProviderConfigRecord {
  readonly id: string;
  readonly category: IntegrationCategory;
  readonly provider: string;
  readonly credentials: Readonly<Record<string, string>>;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly isActive: boolean;
}

/**
 * Configurações de provedor **do tenant do contexto** — o repositório aplica o
 * filtro pelo RLS, ninguém passa tenantId aqui.
 */
export interface ProviderConfigRepositoryPort {
  findActive(category: IntegrationCategory): Promise<ProviderConfigRecord | undefined>;
  list(): Promise<ProviderConfigRecord[]>;
  upsert(input: Omit<ProviderConfigRecord, 'id'> & { id?: string }): Promise<ProviderConfigRecord>;
  deactivate(category: IntegrationCategory, provider: string): Promise<void>;
}

export const PROVIDER_CONFIG_REPOSITORY = Symbol('PROVIDER_CONFIG_REPOSITORY');
