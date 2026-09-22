import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeWorkforceIdentity } from '@mkt/adapters-fakes';
import {
  createPool,
  DEVELOPMENT_TENANTS,
  discoverMigrations,
  listRegisteredRoutes,
  probeCrossTenantAccess,
  runMigrations,
  runWithTenant,
  withTenantTx,
  withTransaction,
  type DatabasePool,
  type RegisteredRoute,
  type RouteAudience,
} from '@mkt/platform';

import {
  isDockerAvailable,
  repositoryRoot,
  startTestDatabase,
  type TestDatabase,
} from './support/database.js';

const dockerAvailable = await isDockerAvailable();

const [lojaA, lojaB] = DEVELOPMENT_TENANTS as [
  (typeof DEVELOPMENT_TENANTS)[number],
  (typeof DEVELOPMENT_TENANTS)[number],
];

const SELLER_A = '0193a000-0000-7000-8000-000000000500';
const SELLER_B = '0193a000-0000-7000-8000-000000000501';

/**
 * Token do painel emitido pelo adapter fake — a suíte roda com
 * `CLERK_SECRET_KEY` vazia justamente para não depender da Clerk.
 */
const panelToken = (tenantId: string, sellerId: string, orgId: string): string =>
  FakeWorkforceIdentity.issueToken({
    userId: `user_${orgId}`,
    organizationId: orgId,
    organizationKind: 'seller',
    tenantId,
    sellerId,
    roles: ['org:seller_owner'],
    permissions: ['org:catalog:read', 'org:orders:manage'],
  });

/**
 * Suíte de isolamento entre tenants (US-074 / RNF-TEN-01).
 *
 * Sobe a API inteira contra Postgres e Redis reais, cria dois tenants com
 * dados e, **para cada rota registrada**, prova que o tenant A não alcança o
 * tenant B. Rota nova entra aqui sozinha — se ela tiver parâmetro que a suíte
 * não sabe preencher, o teste falha pedindo o id, em vez de fingir cobertura.
 */
describe.skipIf(!dockerAvailable)('isolamento entre tenants (e2e)', () => {
  let database: TestDatabase;
  let redis: StartedRedisContainer;
  let appPool: DatabasePool;
  let application: INestApplication;
  let widgetIdOfB = '';
  let routes: RegisteredRoute[] = [];

  beforeAll(async () => {
    database = await startTestDatabase();
    redis = await new RedisContainer('redis:8-alpine')
      .withCommand(['redis-server', '--maxmemory-policy', 'noeviction'])
      .start();

    const migratorPool = createPool(database.urls.migrator, { max: 1 });
    await runMigrations(migratorPool, await discoverMigrations(repositoryRoot));
    await migratorPool.end();

    process.env.DATABASE_URL = database.urls.app;
    process.env.REDIS_URL = redis.getConnectionUrl();
    // sem Clerk: a suíte usa o adapter fake, e nenhum teste depende de rede
    process.env.CLERK_SECRET_KEY = '';
    process.env.CONSOLE_CLERK_SECRET_KEY = '';
    process.env.NODE_ENV = 'test';

    appPool = createPool(database.urls.app, { max: 4 });
    await seed(appPool);

    const { AppModule } = await import('../src/app.module.js');
    const { ProblemDetailsFilter } = await import('@mkt/platform');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    application = moduleRef.createNestApplication();
    application.setGlobalPrefix('v1', { exclude: ['health'] });
    application.useGlobalFilters(new ProblemDetailsFilter());
    await application.init();

    routes = listRegisteredRoutes(application.getHttpAdapter().getInstance());
  }, 300_000);

  afterAll(async () => {
    await application?.close();
    await appPool?.end();
    await database?.stop();
    await redis?.stop();
  });

  it('descobre as rotas registradas da aplicação', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.map((route) => `${route.method} ${route.path}`)).toContain('GET /v1/store/widgets');
  });

  it('nenhuma rota com tenant deixa o tenant A alcançar dado do tenant B', async () => {
    const supertest = (await import('supertest')).default;
    const server = application.getHttpServer();

    const violations = await probeCrossTenantAccess({
      routes,
      resourceIdsOfTenantB: {
        id: widgetIdOfB,
        tenantId: lojaB.tenantId,
        slug: 'da-loja-b',
      },
      secretsOfTenantB: [widgetIdOfB, lojaB.tenantId, 'da-loja-b', SELLER_B],
      headersOfTenantA: (audience: RouteAudience) => ({
        // storefront e API pública: o tenant vem do host
        host: 'loja-a.localhost',
        ...(audience === 'seller' || audience === 'admin'
          ? { authorization: `Bearer ${panelToken(lojaA.tenantId, SELLER_A, 'org_a_seller')}` }
          : {}),
        'idempotency-key': 'isolation-suite',
        'content-type': 'application/json',
      }),
      bodyFor: () => ({ slug: 'tentativa-cross-tenant', name: 'Tentativa', priceCents: 100 }),
      send: async (request) => {
        const call = supertest(server)
          [request.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](request.url)
          .set(request.headers);

        const response = await (request.body === undefined ? call : call.send(request.body as object));
        return { status: response.status, body: response.body ?? response.text };
      },
    });

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  }, 120_000);

  it('o tenant A lista apenas os próprios widgets', async () => {
    const supertest = (await import('supertest')).default;

    const resposta = await supertest(application.getHttpServer())
      .get('/v1/store/widgets')
      .set('host', 'loja-a.localhost');

    expect(resposta.status).toBe(200);
    expect(JSON.stringify(resposta.body)).toContain('da-loja-a');
    expect(JSON.stringify(resposta.body)).not.toContain('da-loja-b');
  });

  it('o tenant B enxerga só o que é dele', async () => {
    const supertest = (await import('supertest')).default;

    const resposta = await supertest(application.getHttpServer())
      .get('/v1/store/widgets')
      .set('host', 'loja-b.localhost');

    expect(JSON.stringify(resposta.body)).toContain('da-loja-b');
    expect(JSON.stringify(resposta.body)).not.toContain('da-loja-a');
  });

  /** Dois tenants com dados e credenciais equivalentes. */
  async function seed(pool: DatabasePool): Promise<void> {
    for (const [indice, tenant] of DEVELOPMENT_TENANTS.entries()) {
      await withTransaction(pool, (client) =>
        client.query(
          `INSERT INTO tenancy.tenants (id, slug, name, status, cell)
                VALUES ($1, $2, $2, 'active', $3)
           ON CONFLICT (id) DO NOTHING`,
          [tenant.tenantId, tenant.slug, tenant.cell],
        ),
      );

      for (const hostname of tenant.hosts) {
        await withTransaction(pool, (client) =>
          client.query(
            `INSERT INTO tenancy.domains (id, tenant_id, hostname, is_primary, verified_at)
                  VALUES (gen_random_uuid(), $1, $2, true, now())
             ON CONFLICT (hostname) DO NOTHING`,
            [tenant.tenantId, hostname],
          ),
        );
      }

      await withTransaction(pool, (client) =>
        client.query(
          `INSERT INTO identity.org_links (clerk_org_id, kind, tenant_id, seller_id)
                VALUES ($1, 'seller', $2, $3)
           ON CONFLICT (clerk_org_id) DO NOTHING`,
          [`org_${indice === 0 ? 'a' : 'b'}_seller`, tenant.tenantId, indice === 0 ? SELLER_A : SELLER_B],
        ),
      );

      const slug = indice === 0 ? 'da-loja-a' : 'da-loja-b';
      const id = await runWithTenant(
        { tenantId: tenant.tenantId, slug: tenant.slug, status: 'active', cell: tenant.cell },
        () =>
          withTenantTx(
            pool,
            async (client) => {
              const { rows } = await client.query<{ id: string }>(
                `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
                      VALUES (gen_random_uuid(), $1, $2, $2, 1000)
                 ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
                   RETURNING id`,
                [tenant.tenantId, slug],
              );
              return rows[0]?.id ?? '';
            },
            tenant.tenantId,
          ),
      );

      if (indice === 1) widgetIdOfB = id;
    }
  }
});
