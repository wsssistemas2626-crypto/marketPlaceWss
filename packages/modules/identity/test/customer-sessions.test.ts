import { beforeEach, describe, expect, it } from 'vitest';

import { DEVELOPMENT_TENANTS, hashSecretToken, runWithTenant, type TenantContext } from '@mkt/platform';
import { FixedClock } from '@mkt/shared-kernel';

import {
  CustomerSessions,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  REFRESH_TOKEN_TTL_MS,
} from '../src/application/customers/customer-sessions.js';
import type { CustomerRepositoryPort } from '../src/application/customers/ports.js';
import type {
  CustomerAccessTokenPort,
  CustomerCredentialsPort,
  LoginRecord,
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
} from '../src/application/customers/session-ports.js';
import { Customer, type CustomerStatus } from '../src/domain/customer/customer.js';
import { LOGIN_FREE_ATTEMPTS, type LoginThrottleState } from '../src/domain/customer/login-throttle.js';

const [lojaA] = DEVELOPMENT_TENANTS as [(typeof DEVELOPMENT_TENANTS)[number]];
const tenant: TenantContext = {
  tenantId: lojaA.tenantId,
  slug: lojaA.slug,
  status: 'active',
  cell: 'shared-1',
};

class Contas implements CustomerRepositoryPort, CustomerCredentialsPort {
  readonly contas = new Map<string, { customer: Customer; throttle: LoginThrottleState }>();

  adicionar(customer: Customer) {
    this.contas.set(customer.email, { customer, throttle: { failedAttempts: 0 } });
  }

  async findLoginRecord(email: string): Promise<LoginRecord | undefined> {
    return this.contas.get(email);
  }

  async saveThrottle(customerId: string, state: LoginThrottleState) {
    for (const conta of this.contas.values()) if (conta.customer.id === customerId) conta.throttle = state;
  }

  async updatePasswordHash(customerId: string, passwordHash: string) {
    for (const conta of this.contas.values()) {
      if (conta.customer.id === customerId) {
        conta.customer = Customer.restore({ ...conta.customer.toSnapshot(), passwordHash });
      }
    }
  }

  async findByEmail(email: string) {
    return this.contas.get(email)?.customer;
  }

  async findById(id: string) {
    return [...this.contas.values()].find((conta) => conta.customer.id === id)?.customer;
  }

  create = async () => 'created' as const;
  addVerification = async () => undefined;
  findVerification = async () => undefined;
  confirmEmail = async () => undefined;
}

class Refreshes implements RefreshTokenRepositoryPort {
  readonly registros: RefreshTokenRecord[] = [];

  async create(record: RefreshTokenRecord) {
    this.registros.push(record);
  }

  async findByHash(tokenHash: string) {
    return this.registros.find((registro) => registro.tokenHash === tokenHash);
  }

  async rotate(previousId: string, usedAt: Date, next: RefreshTokenRecord) {
    const indice = this.registros.findIndex((registro) => registro.id === previousId);
    const atual = this.registros[indice];
    if (atual === undefined || atual.usedAt !== undefined || atual.revokedAt !== undefined) {
      return 'already_used' as const;
    }
    this.registros[indice] = { ...atual, usedAt };
    this.registros.push(next);
    return 'rotated' as const;
  }

  async revokeFamily(familyId: string, at: Date) {
    this.registros.forEach((registro, indice) => {
      if (registro.familyId === familyId && registro.revokedAt === undefined) {
        this.registros[indice] = { ...registro, revokedAt: at };
      }
    });
  }

  async revokeAllOf(customerId: string, at: Date) {
    this.registros.forEach((registro, indice) => {
      if (registro.customerId === customerId) this.registros[indice] = { ...registro, revokedAt: at };
    });
  }
}

const tokensDeAcesso: CustomerAccessTokenPort = {
  issue: ({ customerId, tenantId }) => ({ token: `at:${customerId}:${tenantId}`, expiresAt: new Date(0) }),
  verify: () => {
    throw new Error('não usado aqui');
  },
};

describe('CustomerSessions (US-011)', () => {
  let clock: FixedClock;
  let contas: Contas;
  let refreshes: Refreshes;
  let verificacoes: string[];
  let reusos: { customerId: string; familyId: string }[];
  let sessoes: CustomerSessions;

  const conta = (status: CustomerStatus = 'active') => {
    const customer = Customer.restore({
      ...Customer.register(
        {
          tenantId: lojaA.tenantId,
          name: 'Ana Silva',
          email: 'ana@exemplo.com',
          document: '529.982.247-25',
          passwordHash: 'hash:compras2026!',
          acceptedVersions: { terms_of_use: 'v1', privacy_policy: 'v1' },
          ip: '1.1.1.1',
        },
        clock,
      ).toSnapshot(),
      status,
    });
    contas.adicionar(customer);
    return customer;
  };

  const naLoja = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);
  const entrar = (senha = 'compras2026!', email = 'ana@exemplo.com') =>
    naLoja(() => sessoes.login({ email, password: senha }));

  beforeEach(() => {
    clock = new FixedClock('2026-09-23T12:00:00Z');
    contas = new Contas();
    refreshes = new Refreshes();
    verificacoes = [];
    reusos = [];
    sessoes = new CustomerSessions({
      customers: contas,
      credentials: contas,
      refreshTokens: refreshes,
      accessTokens: tokensDeAcesso,
      hasher: {
        hash: async (senha) => `hash2:${senha}`,
        verify: async (hash, senha) => {
          verificacoes.push(hash);
          return hash === `hash:${senha}` || hash === `hash2:${senha}`;
        },
        needsRehash: (hash) => hash.startsWith('hash:'),
      },
      clock,
      decoyPasswordHash: 'hash:isca-que-nunca-confere',
      onRefreshReuse: (info) => reusos.push(info),
    });
  });

  describe('login', () => {
    it('com senha certa abre uma família de refresh e devolve os dois tokens', async () => {
      const cliente = conta();

      const tokens = await entrar();

      expect(tokens.accessToken).toBe(`at:${cliente.id}:${lojaA.tenantId}`);
      expect(tokens.refreshTokenExpiresAt.getTime()).toBe(clock.now().getTime() + REFRESH_TOKEN_TTL_MS);
      expect(refreshes.registros).toHaveLength(1);
      // o banco guarda só o hash do refresh
      expect(refreshes.registros[0]?.tokenHash).toBe(hashSecretToken(tokens.refreshToken));
    });

    it('conta ainda não confirmada também entra (a compra é que exige e-mail confirmado)', async () => {
      conta('pending_verification');

      await expect(entrar()).resolves.toHaveProperty('accessToken');
    });

    it('e-mail inexistente e senha errada dão o mesmo erro — e o inexistente também paga um hash', async () => {
      conta();

      const semConta = await entrar('compras2026!', 'ninguem@exemplo.com').catch((error: unknown) => error);
      const senhaErrada = await entrar('errada2026!').catch((error: unknown) => error);

      expect(semConta).toBeInstanceOf(InvalidCredentialsError);
      expect(senhaErrada).toBeInstanceOf(InvalidCredentialsError);
      expect((semConta as Error).message).toBe((senhaErrada as Error).message);
      expect(verificacoes).toContain('hash:isca-que-nunca-confere');
    });

    it('conta bloqueada pelo operador não entra, mesmo com a senha certa', async () => {
      conta('blocked');

      await expect(entrar()).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('bloqueio progressivo: a partir do 5º erro, nem a senha certa entra até o prazo', async () => {
      conta();
      for (let tentativa = 0; tentativa <= LOGIN_FREE_ATTEMPTS; tentativa += 1) {
        await entrar('errada2026!').catch(() => undefined);
      }

      await expect(entrar()).rejects.toBeInstanceOf(InvalidCredentialsError);

      clock.advance(60_000);
      await expect(entrar()).resolves.toHaveProperty('accessToken');
      // acertar zera a contagem
      expect(contas.contas.get('ana@exemplo.com')?.throttle).toEqual({ failedAttempts: 0 });
    });

    it('durante o bloqueio a senha real nem é conferida (o bloqueio não vira só um atraso)', async () => {
      conta();
      for (let tentativa = 0; tentativa <= LOGIN_FREE_ATTEMPTS; tentativa += 1) {
        await entrar('errada2026!').catch(() => undefined);
      }
      verificacoes.length = 0;

      await entrar().catch(() => undefined);

      expect(verificacoes).toEqual(['hash:isca-que-nunca-confere']);
    });

    it('rehash no login quando os parâmetros do Argon2 mudaram', async () => {
      conta();

      await entrar();

      expect(contas.contas.get('ana@exemplo.com')?.customer.passwordHash).toBe('hash2:compras2026!');
    });
  });

  describe('refresh rotativo com detecção de reuso', () => {
    it('troca o refresh por um novo da mesma família; o antigo fica usado', async () => {
      conta();
      const primeiro = await entrar();

      const segundo = await naLoja(() => sessoes.refresh(primeiro.refreshToken));

      expect(segundo.refreshToken).not.toBe(primeiro.refreshToken);
      const [antigo, novo] = refreshes.registros;
      expect(antigo?.usedAt).toBeDefined();
      expect(novo?.familyId).toBe(antigo?.familyId);
    });

    it('reapresentar um refresh já trocado revoga a família inteira', async () => {
      conta();
      const primeiro = await entrar();
      const segundo = await naLoja(() => sessoes.refresh(primeiro.refreshToken));

      // o atacante usa a cópia antiga
      await expect(naLoja(() => sessoes.refresh(primeiro.refreshToken))).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );

      // e o dono legítimo também perde a sessão: a família caiu
      await expect(naLoja(() => sessoes.refresh(segundo.refreshToken))).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(refreshes.registros.every((registro) => registro.revokedAt !== undefined)).toBe(true);
      expect(reusos).toHaveLength(1);
    });

    it('outra família do mesmo comprador (outro dispositivo) não é afetada pelo reuso', async () => {
      conta();
      const celular = await entrar();
      const notebook = await entrar();
      await naLoja(() => sessoes.refresh(celular.refreshToken));
      await naLoja(() => sessoes.refresh(celular.refreshToken)).catch(() => undefined);

      await expect(naLoja(() => sessoes.refresh(notebook.refreshToken))).resolves.toHaveProperty(
        'accessToken',
      );
    });

    it('refresh vencido (30 dias) ou inventado é recusado', async () => {
      conta();
      const tokens = await entrar();

      await expect(naLoja(() => sessoes.refresh('inventado'))).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );

      clock.advance(REFRESH_TOKEN_TTL_MS);
      await expect(naLoja(() => sessoes.refresh(tokens.refreshToken))).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('conta bloqueada depois do login perde a sessão no próximo refresh', async () => {
      const cliente = conta();
      const tokens = await entrar();
      contas.contas.set('ana@exemplo.com', {
        customer: Customer.restore({ ...cliente.toSnapshot(), status: 'blocked' }),
        throttle: { failedAttempts: 0 },
      });

      await expect(naLoja(() => sessoes.refresh(tokens.refreshToken))).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });
  });

  describe('logout', () => {
    it('revoga a família: o refresh deixa de funcionar', async () => {
      conta();
      const tokens = await entrar();

      await naLoja(() => sessoes.logout(tokens.refreshToken));

      await expect(naLoja(() => sessoes.refresh(tokens.refreshToken))).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('token desconhecido não é erro: sair é sempre possível', async () => {
      await expect(naLoja(() => sessoes.logout('desconhecido'))).resolves.toBeUndefined();
    });
  });
});

describe('bloqueio progressivo (RNF-SEG-02)', async () => {
  const { registerFailure, isLocked } = await import('../src/domain/customer/login-throttle.js');
  const agora = new Date('2026-09-23T12:00:00Z');

  it('4 erros livres; do 5º em diante 1, 2, 4… minutos, com teto de 1 hora', () => {
    let estado: LoginThrottleState = { failedAttempts: 0 };
    const bloqueios: number[] = [];

    for (let erro = 1; erro <= 12; erro += 1) {
      estado = registerFailure(estado, agora);
      bloqueios.push(
        estado.lockedUntil === undefined ? 0 : (estado.lockedUntil.getTime() - agora.getTime()) / 60_000,
      );
    }

    expect(bloqueios).toEqual([0, 0, 0, 0, 1, 2, 4, 8, 16, 32, 60, 60]);
    expect(isLocked(estado, agora)).toBe(true);
    expect(isLocked(estado, new Date(agora.getTime() + 60 * 60_000))).toBe(false);
  });
});
