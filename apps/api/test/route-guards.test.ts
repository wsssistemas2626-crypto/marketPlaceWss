import { DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  describeRouteAccess,
  findRouteAccessViolations,
  PanelAuth,
  type RouteToAudit,
} from '@mkt/modules-identity';
import { listControllerRoutes, Public, type RegisteredRoute } from '@mkt/platform';

/**
 * RNF-SEG-03: **nenhuma rota fica sem guard** (US-013).
 *
 * Monta a API inteira — sem banco nem Redis, que são preguiçosos, como na
 * geração do OpenAPI — e audita cada rota registrada. Rota nova sem
 * `@PanelAuth`/`@Requires`, `@ConsoleAuth`, `@CustomerAuth` ou `@Public`
 * quebra este teste, com a lista do que falta.
 */
const toAudit = (routes: readonly RegisteredRoute[]): RouteToAudit[] =>
  routes.map((route) => ({
    method: route.method,
    path: route.path,
    access:
      route.controller === undefined || route.handler === undefined
        ? { policy: 'none' }
        : describeRouteAccess(route.controller, route.handler),
  }));

describe('cobertura de guards (RNF-SEG-03)', () => {
  let routes: RegisteredRoute[] = [];
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://app:app@localhost:5432/route-guards';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.CLERK_SECRET_KEY = '';
    process.env.CONSOLE_CLERK_SECRET_KEY = '';

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const application = moduleRef.createNestApplication({ logger: false });
    application.setGlobalPrefix('v1', { exclude: ['health'] });

    routes = listControllerRoutes(moduleRef.get(DiscoveryService), {
      globalPrefix: 'v1',
      excludedFromPrefix: ['health'],
    });
    close = () => application.close();
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it('enxerga as rotas da aplicação', () => {
    expect(routes.length).toBeGreaterThan(5);
    expect(routes.map((route) => `${route.method} ${route.path}`)).toContain('GET /v1/admin/theme');
  });

  it('toda rota declara quem pode chamá-la, coerente com o público do caminho', () => {
    const violations = findRouteAccessViolations(toAudit(routes));

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('rotas de admin exigem organização de tenant e permissão', () => {
    const admin = toAudit(routes).filter((route) => route.path.startsWith('/v1/admin/'));

    expect(admin.length).toBeGreaterThan(0);
    for (const route of admin) {
      expect(route.access, `${route.method} ${route.path}`).toMatchObject({
        policy: 'panel',
        kind: 'tenant',
      });
      expect(route.access).toHaveProperty('permission');
    }
  });
});

describe('findRouteAccessViolations — o teste pega o que deveria', () => {
  // decorators aplicados como função: o transformador do Vitest não aceita a sintaxe `@`
  const controllerCom = (...decorators: ClassDecorator[]) => {
    class Rota {
      listar(): string {
        return 'ok';
      }
    }
    decorators.forEach((decorator) => decorator(Rota));
    return Rota;
  };

  const SemGuard = controllerCom();
  const SemPermissao = controllerCom(PanelAuth('tenant'));
  const AdminAberta = controllerCom(Public('engano proposital'));
  const OrganizacaoErrada = controllerCom(PanelAuth('tenant'));

  const rota = (path: string, controller: { prototype: { listar: () => string } }): RouteToAudit => ({
    method: 'GET',
    path,
    access: describeRouteAccess(controller, controller.prototype.listar),
  });

  it('acusa rota sem guard, painel sem @Requires, admin pública e tipo de organização trocado', () => {
    const violations = findRouteAccessViolations([
      rota('/v1/admin/sem-guard', SemGuard),
      rota('/v1/admin/sem-permissao', SemPermissao),
      rota('/v1/admin/aberta', AdminAberta),
      rota('/v1/seller/organizacao-errada', OrganizacaoErrada),
    ]);

    expect(violations).toHaveLength(5);
    expect(violations.join('\n')).toContain('/v1/admin/sem-guard: não declara guard');
    expect(violations.join('\n')).toContain('/v1/admin/sem-permissao: rota de painel sem @Requires');
    expect(violations.join('\n')).toContain('/v1/admin/aberta: política "public"');
    expect(violations.join('\n')).toContain('/v1/seller/organizacao-errada: política "panel"');
  });
});
