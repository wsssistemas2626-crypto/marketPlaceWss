import { integrationCategories } from '@mkt/contracts';
import { FAKE_PROVIDER, fakeAdapterFactories } from '@mkt/adapters-fakes';
import { AdapterRegistry } from '@mkt/modules-integrations';

/**
 * Quais provedores existem nesta instalação.
 *
 * O registro é montado aqui, no composition root, e não dentro do módulo
 * `integrations`: um módulo não depende de `packages/adapters/*` (CLAUDE.md
 * §4.4) — ele conhece apenas categorias e ports. Adapter real entra somando
 * uma linha, sem tocar em quem usa o hub.
 */
export function createAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();

  // fakes de todas as categorias: é o que permite desenvolver e testar antes
  // de existir conta em provedor (CLAUDE.md §4.17)
  for (const category of integrationCategories) {
    const factory = fakeAdapterFactories[category];
    registry.register(category, FAKE_PROVIDER, () => factory() as never);
  }

  return registry;
}
