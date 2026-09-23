import type { OrganizationKind } from '@mkt/contracts';
import { audienceOf, PUBLIC_ROUTE } from '@mkt/platform';

import { CONSOLE_AUTH } from './console-auth.js';
import { PANEL_AUTH, REQUIRES_PERMISSION } from './panel-auth.guard.js';

/** O que uma rota declara sobre quem pode chamá-la (RNF-SEG-03). */
export type RouteAccess =
  | { readonly policy: 'panel'; readonly kind: OrganizationKind; readonly permission?: string }
  | { readonly policy: 'console' }
  | { readonly policy: 'customer' }
  | { readonly policy: 'public'; readonly reason: string }
  | { readonly policy: 'none' };

/** Metadado de rota do comprador — o decorator `@CustomerAuth` é registrado pelo storefront (US-011). */
export const CUSTOMER_AUTH = 'mkt:customer-auth';

/** Controller (classe) ou handler (método) — onde o Nest grava os metadados. */
type Target = object;

const read = <T>(key: string, handler: Target, controller: Target): T | undefined =>
  (Reflect.getMetadata(key, handler) as T | undefined) ??
  (Reflect.getMetadata(key, controller) as T | undefined);

/** Lê os decorators de acesso do método e, na falta, do controller — mesma regra do `Reflector`. */
export function describeRouteAccess(controller: Target, handler: Target): RouteAccess {
  const kind = read<OrganizationKind>(PANEL_AUTH, handler, controller);
  if (kind !== undefined) {
    const permission = read<string>(REQUIRES_PERMISSION, handler, controller);
    return permission === undefined ? { policy: 'panel', kind } : { policy: 'panel', kind, permission };
  }
  if (read<boolean>(CONSOLE_AUTH, handler, controller) === true) return { policy: 'console' };
  if (read<boolean>(CUSTOMER_AUTH, handler, controller) === true) return { policy: 'customer' };

  const reason = read<string>(PUBLIC_ROUTE, handler, controller);
  if (reason !== undefined) return { policy: 'public', reason };

  return { policy: 'none' };
}

export interface RouteToAudit {
  readonly method: string;
  readonly path: string;
  readonly access: RouteAccess;
}

/**
 * Regras de RNF-SEG-03 sobre as rotas registradas. Devolve uma frase por
 * violação — o teste imprime a lista, e quem criou a rota sabe o que fazer.
 *
 * - toda rota declara uma política (nada de "sem guard" por omissão);
 * - rota de painel declara a permissão (`@Requires`) — tipo de organização
 *   sozinho deixaria qualquer papel daquela organização passar;
 * - o público do caminho casa com a política: `/admin` é organização de
 *   tenant, `/seller` é de seller, `/platform` é console, `/store` é
 *   comprador ou aberta. Uma rota de admin marcada `@Public` por engano cai aqui.
 */
export function findRouteAccessViolations(routes: readonly RouteToAudit[]): string[] {
  const violations: string[] = [];

  for (const { method, path, access } of routes) {
    const route = `${method} ${path}`;
    const audience = audienceOf(path);

    if (access.policy === 'none') {
      violations.push(
        `${route}: não declara guard (@PanelAuth/@Requires, @ConsoleAuth, @CustomerAuth ou @Public)`,
      );
      continue;
    }

    if (access.policy === 'panel' && access.permission === undefined) {
      violations.push(`${route}: rota de painel sem @Requires`);
    }

    const expected: Partial<Record<typeof audience, (a: RouteAccess) => boolean>> = {
      admin: (a) => a.policy === 'panel' && a.kind === 'tenant',
      seller: (a) => a.policy === 'panel' && a.kind === 'seller',
      platform: (a) => a.policy === 'console',
      store: (a) => a.policy === 'customer' || a.policy === 'public',
    };

    const matches = expected[audience];
    if (matches !== undefined && !matches(access)) {
      violations.push(`${route}: política "${access.policy}" não combina com o público /${audience}`);
    }
  }

  return violations;
}
