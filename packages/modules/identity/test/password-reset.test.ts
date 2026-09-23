import { beforeEach, describe, expect, it } from 'vitest';

import { DEVELOPMENT_TENANTS, hashSecretToken, runWithTenant, type TenantContext } from '@mkt/platform';
import { FixedClock, ValidationError } from '@mkt/shared-kernel';

import {
  PASSWORD_RESET_TTL_MS,
  PasswordReset,
  type PasswordResetMailerPort,
  type PasswordResetRecord,
  type PasswordResetRepositoryPort,
} from '../src/application/customers/password-reset.js';
import type { CustomerRepositoryPort } from '../src/application/customers/ports.js';
import { Customer, type CustomerStatus } from '../src/domain/customer/customer.js';

const [lojaA, lojaB] = DEVELOPMENT_TENANTS as [
  (typeof DEVELOPMENT_TENANTS)[number],
  (typeof DEVELOPMENT_TENANTS)[number],
];
const contexto = (tenant: (typeof DEVELOPMENT_TENANTS)[number]): TenantContext => ({
  tenantId: tenant.tenantId,
  slug: tenant.slug,
  status: 'active',
  cell: 'shared-1',
});

/** Estado compartilhado que imita o banco com RLS: cada tenant só vê o que é dele. */
class Banco implements CustomerRepositoryPort, PasswordResetRepositoryPort {
  tenantAtual = lojaA.tenantId;
  readonly clientes: Customer[] = [];
  readonly pedidos: (PasswordResetRecord & { tenantId: string })[] = [];
  readonly senhas = new Map<string, string>();
  readonly sessoesRevogadas: string[] = [];

  private doTenant = () => this.clientes.filter((cliente) => cliente.tenantId === this.tenantAtual);

  async findByEmail(email: string) {
    return this.doTenant().find((cliente) => cliente.email === email);
  }

  async findById(id: string) {
    return this.doTenant().find((cliente) => cliente.id === id);
  }

  async open(record: PasswordResetRecord, at: Date) {
    this.pedidos.forEach((pedido, indice) => {
      if (pedido.customerId === record.customerId && pedido.usedAt === undefined) {
        this.pedidos[indice] = { ...pedido, usedAt: at };
      }
    });
    this.pedidos.push({ ...record, tenantId: this.tenantAtual });
  }

  async findByHash(tokenHash: string) {
    return this.pedidos.find(
      (pedido) => pedido.tokenHash === tokenHash && pedido.tenantId === this.tenantAtual,
    );
  }

  async complete(input: { customerId: string; tokenHash: string; passwordHash: string; at: Date }) {
    const indice = this.pedidos.findIndex((pedido) => pedido.tokenHash === input.tokenHash);
    const pedido = this.pedidos[indice];
    if (pedido === undefined || pedido.usedAt !== undefined) return 'already_used' as const;

    this.pedidos[indice] = { ...pedido, usedAt: input.at };
    this.senhas.set(input.customerId, input.passwordHash);
    this.sessoesRevogadas.push(input.customerId);
    return 'completed' as const;
  }

  create = async () => 'created' as const;
  addVerification = async () => undefined;
  findVerification = async () => undefined;
  confirmEmail = async () => undefined;
}

class Carteiro implements PasswordResetMailerPort {
  readonly links: { to: string; link: string }[] = [];
  readonly avisos: string[] = [];

  async sendPasswordReset(input: { to: string; link: string }) {
    this.links.push({ to: input.to, link: input.link });
  }

  async sendPasswordChanged(input: { to: string }) {
    this.avisos.push(input.to);
  }
}

const tokenDo = (link: string | undefined) => decodeURIComponent(link?.split('#token=')[1] ?? '');

describe('PasswordReset (US-012)', () => {
  let clock: FixedClock;
  let banco: Banco;
  let carteiro: Carteiro;
  let recuperacao: PasswordReset;

  const naLoja = <T>(tenant: (typeof DEVELOPMENT_TENANTS)[number], fn: () => Promise<T>) => {
    banco.tenantAtual = tenant.tenantId;
    return runWithTenant(contexto(tenant), fn);
  };

  const conta = (tenant = lojaA, status: CustomerStatus = 'active') => {
    const customer = Customer.restore({
      ...Customer.register(
        {
          tenantId: tenant.tenantId,
          name: 'Ana Silva',
          email: 'ana@exemplo.com',
          document: '529.982.247-25',
          passwordHash: 'hash-antigo',
          acceptedVersions: { terms_of_use: 'v1', privacy_policy: 'v1' },
          ip: '1.1.1.1',
        },
        clock,
      ).toSnapshot(),
      status,
    });
    banco.clientes.push(customer);
    return customer;
  };

  const pedir = async (tenant = lojaA, email = 'ana@exemplo.com') => {
    const { delivery } = await naLoja(tenant, () => recuperacao.request({ email }));
    await delivery;
  };

  beforeEach(() => {
    clock = new FixedClock('2026-09-23T12:00:00Z');
    banco = new Banco();
    carteiro = new Carteiro();
    recuperacao = new PasswordReset({
      customers: banco,
      resets: banco,
      mailer: carteiro,
      links: {
        verifyEmail: () => '',
        login: () => 'http://loja/conta/entrar',
        resetPassword: () => 'http://loja/conta/recuperar-senha',
        choosePassword: (token) => `http://${banco.tenantAtual}/conta/redefinir-senha#token=${token}`,
      },
      hasher: { hash: async (senha) => `hash:${senha}`, verify: async () => true, needsRehash: () => false },
      breaches: { isBreached: async () => false },
      clock,
    });
  });

  it('pedido com conta existente: link de 1 hora por e-mail, só o hash no banco', async () => {
    conta();

    await pedir();

    expect(carteiro.links).toHaveLength(1);
    const [pedido] = banco.pedidos;
    expect(pedido?.expiresAt.getTime()).toBe(clock.now().getTime() + PASSWORD_RESET_TTL_MS);
    expect(pedido?.tokenHash).toBe(hashSecretToken(tokenDo(carteiro.links[0]?.link)));
  });

  it('pedido sem conta: mesma resposta, nada gravado, nenhum e-mail', async () => {
    await expect(
      naLoja(lojaA, () => recuperacao.request({ email: 'ninguem@exemplo.com' })),
    ).resolves.toHaveProperty('delivery');

    expect(banco.pedidos).toHaveLength(0);
    expect(carteiro.links).toHaveLength(0);
  });

  it('conta bloqueada pelo operador não recebe link', async () => {
    conta(lojaA, 'blocked');

    await pedir();

    expect(carteiro.links).toHaveLength(0);
  });

  it('troca a senha, revoga todas as sessões e avisa o dono', async () => {
    const cliente = conta();
    await pedir();

    await naLoja(lojaA, () =>
      recuperacao.complete({ token: tokenDo(carteiro.links[0]?.link), password: 'novaSenha2026' }),
    );

    expect(banco.senhas.get(cliente.id)).toBe('hash:novaSenha2026');
    expect(banco.sessoesRevogadas).toEqual([cliente.id]);
    expect(carteiro.avisos).toEqual(['ana@exemplo.com']);
  });

  it('o link é de uso único', async () => {
    conta();
    await pedir();
    const token = tokenDo(carteiro.links[0]?.link);
    await naLoja(lojaA, () => recuperacao.complete({ token, password: 'novaSenha2026' }));

    await expect(
      naLoja(lojaA, () => recuperacao.complete({ token, password: 'outraSenha2026' })),
    ).rejects.toThrow(/inválido ou expirado/);
  });

  it('o link vence em 1 hora', async () => {
    conta();
    await pedir();
    clock.advance(PASSWORD_RESET_TTL_MS);

    await expect(
      naLoja(lojaA, () =>
        recuperacao.complete({ token: tokenDo(carteiro.links[0]?.link), password: 'novaSenha2026' }),
      ),
    ).rejects.toThrow(/inválido ou expirado/);
  });

  it('pedir de novo invalida o link anterior', async () => {
    conta();
    await pedir();
    await pedir();

    await expect(
      naLoja(lojaA, () =>
        recuperacao.complete({ token: tokenDo(carteiro.links[0]?.link), password: 'novaSenha2026' }),
      ),
    ).rejects.toThrow(/inválido ou expirado/);
    await expect(
      naLoja(lojaA, () =>
        recuperacao.complete({ token: tokenDo(carteiro.links[1]?.link), password: 'novaSenha2026' }),
      ),
    ).resolves.toBeUndefined();
  });

  it('senha nova fraca é recusada no campo password e o link continua valendo', async () => {
    conta();
    await pedir();
    const token = tokenDo(carteiro.links[0]?.link);

    const erro = await naLoja(lojaA, () => recuperacao.complete({ token, password: 'curta' })).catch(
      (error: unknown) => error,
    );

    expect(erro).toBeInstanceOf(ValidationError);
    expect((erro as ValidationError).details).toEqual({ field: 'password' });
    await expect(
      naLoja(lojaA, () => recuperacao.complete({ token, password: 'novaSenha2026' })),
    ).resolves.toBeUndefined();
  });

  it('cross-tenant: link da loja A não troca senha na loja B', async () => {
    conta(lojaA);
    conta(lojaB);
    await pedir(lojaA);

    await expect(
      naLoja(lojaB, () =>
        recuperacao.complete({ token: tokenDo(carteiro.links[0]?.link), password: 'novaSenha2026' }),
      ),
    ).rejects.toThrow(/inválido ou expirado/);
    expect(banco.senhas.size).toBe(0);
  });
});
