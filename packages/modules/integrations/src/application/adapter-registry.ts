import type { IntegrationCategory, IntegrationPortByCategory } from '@mkt/contracts';
import { DomainError } from '@mkt/shared-kernel';

/** O que o adapter recebe para se construir: credenciais já decifradas. */
export interface AdapterContext {
  readonly tenantId: string;
  readonly credentials: Readonly<Record<string, string>>;
  readonly settings: Readonly<Record<string, unknown>>;
}

export type AdapterFactory<C extends IntegrationCategory = IntegrationCategory> = (
  context: AdapterContext,
) => IntegrationPortByCategory[C];

export class ProviderNotRegisteredError extends DomainError {
  constructor(category: string, provider: string) {
    super('provider_not_registered', `Nenhum adapter registrado para ${category}/${provider}.`, {
      category,
      provider,
    });
  }
}

/**
 * Registro de adapters disponíveis: categoria + provedor → fábrica.
 *
 * O registro é global (é código), mas a **escolha** é por tenant e acontece em
 * tempo de requisição, no hub — nunca um singleton por categoria
 * (CLAUDE.md §4.4 e US-009).
 */
export class AdapterRegistry {
  private readonly factories = new Map<string, AdapterFactory>();

  private static key(category: string, provider: string): string {
    return `${category}:${provider}`;
  }

  register<C extends IntegrationCategory>(category: C, provider: string, factory: AdapterFactory<C>): this {
    this.factories.set(AdapterRegistry.key(category, provider), factory as AdapterFactory);
    return this;
  }

  create<C extends IntegrationCategory>(
    category: C,
    provider: string,
    context: AdapterContext,
  ): IntegrationPortByCategory[C] {
    const factory = this.factories.get(AdapterRegistry.key(category, provider));
    if (factory === undefined) throw new ProviderNotRegisteredError(category, provider);

    return factory(context) as IntegrationPortByCategory[C];
  }

  providersOf(category: IntegrationCategory): string[] {
    return [...this.factories.keys()]
      .filter((key) => key.startsWith(`${category}:`))
      .map((key) => key.split(':')[1] ?? '');
  }

  has(category: IntegrationCategory, provider: string): boolean {
    return this.factories.has(AdapterRegistry.key(category, provider));
  }
}

export const ADAPTER_REGISTRY = Symbol('ADAPTER_REGISTRY');
