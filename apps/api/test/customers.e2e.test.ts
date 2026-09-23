import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CUSTOMER_MAILER, type CustomerMailerPort } from '@mkt/modules-identity';
import {
  createPool,
  DEVELOPMENT_TENANTS,
  discoverMigrations,
  runMigrations,
  runWithTenant,
  withTenantTx,
  withTransaction,
  type DatabasePool,
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

/** Captura os e-mails em vez de mandar — é daqui que o teste tira o link. */
class CarteiroDeTeste implements CustomerMailerPort {
  readonly verificacoes: { to: string; link: string }[] = [];
  readonly tentativas: { to: string }[] = [];

  async sendVerification(input: { to: string; link: string }) {
    this.verificacoes.push({ to: input.to, link: input.link });
  }

  async sendRegistrationAttempt(input: { to: string }) {
    this.tentativas.push({ to: input.to });
  }
}

/**
 * Cadastro de comprador de ponta a ponta (US-010), contra Postgres e Redis
 * reais: rota → caso de uso → RLS → outbox. Cada cenário Gherkin da story tem
 * um teste aqui, mais o cross-tenant obrigatório (CLAUDE.md §4.14).
 */
describe.skipIf(!dockerAvailable)('cadastro de comprador (e2e)', () => {
  let database: TestDatabase;
  let redis: StartedRedisContainer;
  let appPool: DatabasePool;
  let application: INestApplication;
  const carteiro = new CarteiroDeTeste();
  let chave = 0;

  const cliente = {
    name: 'Ana Silva',
    email: 'ana@exemplo.com',
    document: '529.982.247-25',
    password: 'compras2026!',
    acceptTerms: true,
  };

  const cadastrar = async (host: string, corpo: object) => {
    const supertest = (await import('supertest')).default;
    chave += 1;
    return supertest(application.getHttpServer())
      .post('/v1/store/customers')
      .set('host', host)
      .set('idempotency-key', `cadastro-${chave}`)
      .send(corpo);
  };

  const confirmar = async (host: string, token: string) => {
    const supertest = (await import('supertest')).default;
    return supertest(application.getHttpServer())
      .post('/v1/store/customers/verify-email')
      .set('host', host)
      .send({ token });
  };

  /** Lê como o tenant (RLS ligada), nunca com superusuário. */
  const naLoja = <T>(tenant: (typeof DEVELOPMENT_TENANTS)[number], sql: string, params: unknown[] = []) =>
    runWithTenant({ tenantId: tenant.tenantId, slug: tenant.slug, status: 'active', cell: tenant.cell }, () =>
      withTenantTx(appPool, async (client) => (await client.query<T>(sql, params)).rows, tenant.tenantId),
    );

  const tokenDo = (link: string | undefined) => decodeURIComponent(link?.split('#token=')[1] ?? '');

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
    process.env.CLERK_SECRET_KEY = '';
    process.env.CONSOLE_CLERK_SECRET_KEY = '';
    process.env.NODE_ENV = 'test';
    process.env.STOREFRONT_URL_TEMPLATE = 'http://{slug}.localhost:3000';

    appPool = createPool(database.urls.app, { max: 4 });
    for (const tenant of DEVELOPMENT_TENANTS) {
      await withTransaction(appPool, async (client) => {
        await client.query(
          `INSERT INTO tenancy.tenants (id, slug, name, status, cell) VALUES ($1, $2, $2, 'active', $3)
           ON CONFLICT (id) DO NOTHING`,
          [tenant.tenantId, tenant.slug, tenant.cell],
        );
        for (const hostname of tenant.hosts) {
          await client.query(
            `INSERT INTO tenancy.domains (id, tenant_id, hostname, is_primary, verified_at)
                  VALUES (gen_random_uuid(), $1, $2, true, now())
             ON CONFLICT (hostname) DO NOTHING`,
            [tenant.tenantId, hostname],
          );
        }
      });
    }

    const { AppModule } = await import('../src/app.module.js');
    const { ProblemDetailsFilter } = await import('@mkt/platform');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CUSTOMER_MAILER)
      .useValue(carteiro)
      .compile();
    application = moduleRef.createNestApplication();
    application.setGlobalPrefix('v1', { exclude: ['health'] });
    application.useGlobalFilters(new ProblemDetailsFilter());
    await application.init();
  }, 300_000);

  afterAll(async () => {
    await application?.close();
    await appPool?.end();
    await database?.stop();
    await redis?.stop();
  });

  it('cenário "cadastro válido": 202, conta pending_verification, aceite com versão, data e IP', async () => {
    const resposta = await cadastrar('loja-a.localhost', cliente);

    expect(resposta.status).toBe(202);
    expect(resposta.body.message).toMatch(/e-mail para confirmar/);

    const [conta] = await naLoja<{ status: string; email: string; password_hash: string }>(
      lojaA,
      'SELECT status, email, password_hash FROM identity.customers',
    );
    expect(conta?.status).toBe('pending_verification');
    expect(conta?.password_hash).toMatch(/^\$argon2id\$/);

    const consentimentos = await naLoja<{ kind: string; version: string; ip: string }>(
      lojaA,
      'SELECT kind, version, host(ip) AS ip FROM identity.customer_consents ORDER BY kind',
    );
    expect(consentimentos.map((c) => c.kind)).toEqual(['privacy_policy', 'terms_of_use']);
    expect(consentimentos.every((c) => c.version !== '' && c.ip !== '')).toBe(true);

    const eventos = await naLoja<{ type: string }>(lojaA, 'SELECT type FROM identity.outbox');
    expect(eventos.map((evento) => evento.type)).toEqual(['identity.customer.registered']);

    expect(carteiro.verificacoes.at(-1)?.link).toMatch(
      /^http:\/\/loja-a\.localhost:3000\/conta\/confirmar#token=/,
    );
  });

  it('confirmar o e-mail ativa a conta', async () => {
    const resposta = await confirmar('loja-a.localhost', tokenDo(carteiro.verificacoes.at(-1)?.link));

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'verified' });
    const [conta] = await naLoja<{ status: string }>(lojaA, 'SELECT status FROM identity.customers');
    expect(conta?.status).toBe('active');
  });

  it('cenário "e-mail já cadastrado": mesma resposta genérica e aviso ao dono', async () => {
    const resposta = await cadastrar('loja-a.localhost', {
      ...cliente,
      name: 'Intrusa',
      email: 'ANA@exemplo.com',
    });

    expect(resposta.status).toBe(202);
    expect(resposta.body.message).toMatch(/e-mail para confirmar/);
    expect(carteiro.tentativas).toEqual([{ to: 'ana@exemplo.com' }]);
    expect(await naLoja(lojaA, 'SELECT id FROM identity.customers')).toHaveLength(1);
  });

  it('cenário "CPF inválido": 422 no campo document', async () => {
    const resposta = await cadastrar('loja-a.localhost', {
      ...cliente,
      email: 'outra@exemplo.com',
      document: '529.982.247-24',
    });

    expect(resposta.status).toBe(422);
    expect(resposta.body.field).toBe('document');
    expect(JSON.stringify(resposta.body)).not.toContain('529');
  });

  it('exige Idempotency-Key (CLAUDE.md §4.10)', async () => {
    const supertest = (await import('supertest')).default;
    const resposta = await supertest(application.getHttpServer())
      .post('/v1/store/customers')
      .set('host', 'loja-a.localhost')
      .send(cliente);

    expect(resposta.status).toBe(400);
  });

  it('cross-tenant: o mesmo e-mail cria outra conta no marketplace B, invisível para o A', async () => {
    const resposta = await cadastrar('loja-b.localhost', cliente);

    expect(resposta.status).toBe(202);
    expect(carteiro.verificacoes.at(-1)?.link).toContain('loja-b.localhost');

    expect(await naLoja(lojaA, 'SELECT id FROM identity.customers')).toHaveLength(1);
    const contasB = await naLoja<{ status: string }>(lojaB, 'SELECT status FROM identity.customers');
    expect(contasB.map((conta) => conta.status)).toEqual(['pending_verification']);
  });

  it('cross-tenant: link de confirmação da loja B não funciona na loja A', async () => {
    const tokenDaB = tokenDo(carteiro.verificacoes.at(-1)?.link);

    const resposta = await confirmar('loja-a.localhost', tokenDaB);

    expect(resposta.status).toBe(422);
    const contasB = await naLoja<{ status: string }>(lojaB, 'SELECT status FROM identity.customers');
    expect(contasB[0]?.status).toBe('pending_verification');
  });
});
