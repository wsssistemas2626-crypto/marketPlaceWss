import type { IntegrationCategory, IntegrationPortByCategory } from '@mkt/contracts';
import { DomainError } from '@mkt/shared-kernel';
import { requireTenant } from '@mkt/platform';

import type { AdapterRegistry } from './adapter-registry.js';
import type { ProviderConfigRepositoryPort } from './provider-config.port.js';

export class NoActiveProviderError extends DomainError {
  constructor(category: string) {
    super('no_active_provider', `Nenhum provedor de "${category}" está configurado para este tenant.`, {
      category,
    });
  }
}

/**
 * Resolve o adapter ativo da categoria **para o tenant da requisição atual**.
 *
 * Ponto central da US-009: a resolução acontece em tempo de requisição, a
 * partir do `TenantContext`. Guardar o adapter num singleton faria o primeiro
 * tenant a chamar definir o gateway de todos os outros.
 */
export class IntegrationHub {
  constructor(
    private readonly configs: ProviderConfigRepositoryPort,
    private readonly registry: AdapterRegistry,
  ) {}

  async resolve<C extends IntegrationCategory>(category: C): Promise<IntegrationPortByCategory[C]> {
    const tenantId = requireTenant().tenantId;
    const config = await this.configs.findActive(category);
    if (config === undefined) throw new NoActiveProviderError(category);

    return this.registry.create(category, config.provider, {
      tenantId,
      credentials: config.credentials,
      settings: config.settings,
    });
  }

  /** Provedor ativo sem construir o adapter — para telas de configuração. */
  async activeProvider(category: IntegrationCategory): Promise<string | undefined> {
    return (await this.configs.findActive(category))?.provider;
  }

  availableProviders(category: IntegrationCategory): string[] {
    return this.registry.providersOf(category);
  }
}
