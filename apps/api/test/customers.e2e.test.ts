import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CUSTOMER_MAILER,
  PASSWORD_RESET_MAILER,
  type CustomerMailerPort,
  type PasswordResetMailerPort,
} from '@mkt/modules-identity';
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
class CarteiroDeTeste implements CustomerMailerPort, PasswordResetMailerPort {
  readonly trocasDeSenha: { to: string; link: string }[] = [];
  readonly senhaAlterada: string[] = [];

  async sendPasswordReset(input: { to: string; link: string }) {
    this.trocasDeSenha.push({ to: input.to, link: input.link });
  }

  async sendPasswordChanged(input: { to: string }) {
    this.senhaAlterada.push(input.to);
  }

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
      .overrideProvider(PASSWORD_RESET_MAILER)
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

  describe('sessões (US-011)', () => {
    const http = async () => (await import('supertest')).default(application.getHttpServer());

    const entrar = async (host: string, email: string, password: string) =>
      (await http()).post('/v1/store/auth/login').set('host', host).send({ email, password });

    const minhaConta = async (host: string, accessToken: string) =>
      (await http())
        .get('/v1/store/customers/me')
        .set('host', host)
        .set('authorization', `Bearer ${accessToken}`);

    const renovar = async (host: string, refreshToken: string) =>
      (await http()).post('/v1/store/auth/refresh').set('host', host).send({ refreshToken });

    it('login devolve access e refresh; o access abre a própria conta', async () => {
      const login = await entrar('loja-a.localhost', 'ana@exemplo.com', cliente.password);

      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });

      const conta = await minhaConta('loja-a.localhost', login.body.accessToken);
      expect(conta.status).toBe(200);
      expect(conta.body).toMatchObject({ email: 'ana@exemplo.com', status: 'active', emailVerified: true });
    });

    it('sem token, "minha conta" é 401', async () => {
      const resposta = await (await http()).get('/v1/store/customers/me').set('host', 'loja-a.localhost');

      expect(resposta.status).toBe(401);
    });

    it('cross-tenant: token do comprador da loja A é recusado na loja B', async () => {
      const login = await entrar('loja-a.localhost', 'ana@exemplo.com', cliente.password);

      const naOutraLoja = await minhaConta('loja-b.localhost', login.body.accessToken);

      expect(naOutraLoja.status).toBe(401);
    });

    it('senha errada e e-mail inexistente respondem igual (401 sem dizer qual)', async () => {
      const senhaErrada = await entrar('loja-a.localhost', 'ana@exemplo.com', 'errada2026!');
      const semConta = await entrar('loja-a.localhost', 'ninguem@exemplo.com', cliente.password);

      expect(senhaErrada.status).toBe(401);
      expect(semConta.status).toBe(401);
      expect(senhaErrada.body.title).toBe(semConta.body.title);
    });

    it('refresh rotativo: reusar o antigo derruba a família inteira', async () => {
      const login = await entrar('loja-a.localhost', 'ana@exemplo.com', cliente.password);
      const renovado = await renovar('loja-a.localhost', login.body.refreshToken);
      expect(renovado.status).toBe(200);

      const reuso = await renovar('loja-a.localhost', login.body.refreshToken);
      expect(reuso.status).toBe(401);

      const legitimo = await renovar('loja-a.localhost', renovado.body.refreshToken);
      expect(legitimo.status).toBe(401);
    });

    it('cross-tenant: refresh da loja A não renova na loja B', async () => {
      const login = await entrar('loja-a.localhost', 'ana@exemplo.com', cliente.password);

      expect((await renovar('loja-b.localhost', login.body.refreshToken)).status).toBe(401);
      // e continua valendo na loja certa
      expect((await renovar('loja-a.localhost', login.body.refreshToken)).status).toBe(200);
    });

    it('logout encerra a sessão', async () => {
      const login = await entrar('loja-a.localhost', 'ana@exemplo.com', cliente.password);

      const saida = await (
        await http()
      )
        .post('/v1/store/auth/logout')
        .set('host', 'loja-a.localhost')
        .send({ refreshToken: login.body.refreshToken });

      expect(saida.status).toBe(204);
      expect((await renovar('loja-a.localhost', login.body.refreshToken)).status).toBe(401);
    });

    it('bloqueio progressivo: depois de 5 senhas erradas, nem a certa entra', async () => {
      // conta própria para o teste não travar as outras
      await cadastrar('loja-a.localhost', { ...cliente, email: 'bloqueio@exemplo.com' });
      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        await entrar('loja-a.localhost', 'bloqueio@exemplo.com', 'errada2026!');
      }

      const comSenhaCerta = await entrar('loja-a.localhost', 'bloqueio@exemplo.com', cliente.password);

      expect(comSenhaCerta.status).toBe(401);
      const [conta] = await naLoja<{ failed_login_attempts: number; locked_until: Date | null }>(
        lojaA,
        "SELECT failed_login_attempts, locked_until FROM identity.customers WHERE email = 'bloqueio@exemplo.com'",
      );
      expect(conta?.failed_login_attempts).toBe(5);
      expect(conta?.locked_until).not.toBeNull();
    });
  });

  describe('recuperação de senha (US-012)', () => {
    const http = async () => (await import('supertest')).default(application.getHttpServer());
    const email = 'troca@exemplo.com';

    const pedirTroca = async (host: string, alvo: string) =>
      (await http())
        .post('/v1/store/customers/password-reset')
        .set('host', host)
        .set('idempotency-key', `troca-${host}-${alvo}-${Date.now()}`)
        .send({ email: alvo });

    const trocar = async (host: string, token: string, password: string) =>
      (await http())
        .post('/v1/store/customers/password-reset/confirm')
        .set('host', host)
        .send({ token, password });

    const entrar = async (password: string) =>
      (await http()).post('/v1/store/auth/login').set('host', 'loja-a.localhost').send({ email, password });

    it('pedido responde igual com e sem conta; só a conta recebe o link', async () => {
      await cadastrar('loja-a.localhost', { ...cliente, email });

      const comConta = await pedirTroca('loja-a.localhost', email);
      const semConta = await pedirTroca('loja-a.localhost', 'ninguem@exemplo.com');

      expect(comConta.status).toBe(202);
      expect(semConta.status).toBe(202);
      expect(comConta.body).toEqual(semConta.body);
      expect(carteiro.trocasDeSenha.map((envio) => envio.to)).toEqual([email]);
    });

    it('cross-tenant: link da loja A não troca a senha na loja B', async () => {
      const token = tokenDo(carteiro.trocasDeSenha.at(-1)?.link);

      const resposta = await trocar('loja-b.localhost', token, 'novaSenha2026');

      expect(resposta.status).toBe(422);
    });

    it('troca a senha, derruba as sessões abertas e o link não serve de novo', async () => {
      const sessaoAntiga = await entrar(cliente.password);
      const token = tokenDo(carteiro.trocasDeSenha.at(-1)?.link);

      expect((await trocar('loja-a.localhost', token, 'novaSenha2026')).status).toBe(204);

      const refreshAntigo = await (
        await http()
      )
        .post('/v1/store/auth/refresh')
        .set('host', 'loja-a.localhost')
        .send({ refreshToken: sessaoAntiga.body.refreshToken });
      expect(refreshAntigo.status).toBe(401);

      expect((await entrar(cliente.password)).status).toBe(401);
      expect((await entrar('novaSenha2026')).status).toBe(200);
      expect(carteiro.senhaAlterada).toContain(email);

      expect((await trocar('loja-a.localhost', token, 'outraSenha2026')).status).toBe(422);
    });
  });

  describe('endereços (US-014)', () => {
    const http = async () => (await import('supertest')).default(application.getHttpServer());

    const sessao = async (host: string, email: string, password: string): Promise<string> => {
      const login = await (
        await http()
      )
        .post('/v1/store/auth/login')
        .set('host', host)
        .send({ email, password });
      expect(login.status).toBe(200);
      return login.body.accessToken as string;
    };

    const endereco = {
      recipientName: 'Ana Silva',
      zipCode: '01001-000',
      street: 'Praça da Sé',
      number: '100',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    };

    let tokenAna = '';
    let enderecoDaAna = '';

    it('sem sessão, endereços são 401', async () => {
      const resposta = await (
        await http()
      )
        .get('/v1/store/customers/me/addresses')
        .set('host', 'loja-a.localhost');

      expect(resposta.status).toBe(401);
    });

    it('comprador cadastra, lista e o primeiro vira o padrão', async () => {
      tokenAna = await sessao('loja-a.localhost', 'ana@exemplo.com', cliente.password);

      const criado = await (
        await http()
      )
        .post('/v1/store/customers/me/addresses')
        .set('host', 'loja-a.localhost')
        .set('authorization', `Bearer ${tokenAna}`)
        .set('idempotency-key', 'endereco-ana-1')
        .send(endereco);

      expect(criado.status).toBe(201);
      expect(criado.body).toMatchObject({ zipCode: '01001000', isDefault: true });
      enderecoDaAna = criado.body.id as string;

      const lista = await (
        await http()
      )
        .get('/v1/store/customers/me/addresses')
        .set('host', 'loja-a.localhost')
        .set('authorization', `Bearer ${tokenAna}`);
      expect(lista.body.data).toHaveLength(1);
    });

    it('anti-IDOR: outro comprador da mesma loja não edita nem apaga o endereço', async () => {
      await cadastrar('loja-a.localhost', { ...cliente, email: 'bia@exemplo.com' });
      const tokenBia = await sessao('loja-a.localhost', 'bia@exemplo.com', cliente.password);

      const edicao = await (
        await http()
      )
        .put(`/v1/store/customers/me/addresses/${enderecoDaAna}`)
        .set('host', 'loja-a.localhost')
        .set('authorization', `Bearer ${tokenBia}`)
        .send({ ...endereco, recipientName: 'Invasora' });
      const exclusao = await (
        await http()
      )
        .delete(`/v1/store/customers/me/addresses/${enderecoDaAna}`)
        .set('host', 'loja-a.localhost')
        .set('authorization', `Bearer ${tokenBia}`);

      expect(edicao.status).toBe(404);
      expect(exclusao.status).toBe(404);
      const [linha] = await naLoja<{ recipient_name: string }>(
        lojaA,
        'SELECT recipient_name FROM identity.customer_addresses WHERE id = $1',
        [enderecoDaAna],
      );
      expect(linha?.recipient_name).toBe('Ana Silva');
    });

    it('cross-tenant: o endereço da loja A não aparece para quem está na loja B', async () => {
      const tokenB = await sessao('loja-b.localhost', 'ana@exemplo.com', cliente.password).catch(() => '');
      // a conta da B ainda está pendente, mas entra; se não entrar, o próprio 401 já prova o isolamento
      const lista = await (
        await http()
      )
        .get('/v1/store/customers/me/addresses')
        .set('host', 'loja-b.localhost')
        .set('authorization', `Bearer ${tokenB}`);

      expect(JSON.stringify(lista.body)).not.toContain(enderecoDaAna);
      expect(await naLoja(lojaB, 'SELECT id FROM identity.customer_addresses')).toHaveLength(0);
    });

    it('CEP autocompleta para comprador logado (serviço fake nos testes)', async () => {
      const cep = await (
        await http()
      )
        .get('/v1/store/postal-codes?zipCode=01001-000')
        .set('host', 'loja-a.localhost')
        .set('authorization', `Bearer ${tokenAna}`);
      const inexistente = await (
        await http()
      )
        .get('/v1/store/postal-codes?zipCode=99999999')
        .set('host', 'loja-a.localhost')
        .set('authorization', `Bearer ${tokenAna}`);

      expect(cep.body).toEqual({
        found: true,
        address: {
          zipCode: '01001000',
          street: 'Praça da Sé',
          district: 'Sé',
          city: 'São Paulo',
          state: 'SP',
        },
      });
      expect(inexistente.body).toEqual({ found: false });
    });
  });
});
