import { beforeEach, describe, expect, it } from 'vitest';

import { DEVELOPMENT_TENANTS, hashSecretToken, runWithTenant, type TenantContext } from '@mkt/platform';
import { type DomainEvent, FixedClock, ValidationError } from '@mkt/shared-kernel';

import type {
  CustomerMailerPort,
  CustomerRepositoryPort,
  EmailVerification,
} from '../src/application/customers/ports.js';
import {
  EMAIL_VERIFICATION_TTL_MS,
  RegisterCustomer,
  type RegisterCustomerCommand,
} from '../src/application/customers/register-customer.js';
import { VerifyCustomerEmail } from '../src/application/customers/verify-customer-email.js';
import { Customer } from '../src/domain/customer/customer.js';

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

/** Repositório em memória que imita a RLS: cada tenant só enxerga o que é dele. */
class CompradoresEmMemoria implements CustomerRepositoryPort {
  readonly clientes: Customer[] = [];
  readonly verificacoes: (EmailVerification & { tenantId: string })[] = [];
  readonly eventos: DomainEvent[] = [];
  /** Simula a corrida: o próximo `create` perde para um cadastro simultâneo. */
  perderProximaCorrida = false;

  constructor(private readonly tenantAtual: () => string) {}

  private doTenant = () => this.clientes.filter((cliente) => cliente.tenantId === this.tenantAtual());

  async findByEmail(email: string) {
    return this.doTenant().find((cliente) => cliente.email === email);
  }

  async findById(id: string) {
    return this.doTenant().find((cliente) => cliente.id === id);
  }

  async create(customer: Customer, verification: EmailVerification, event: DomainEvent) {
    if (this.perderProximaCorrida) return 'email_taken' as const;
    if (this.doTenant().some((cliente) => cliente.email === customer.email)) return 'email_taken' as const;

    this.clientes.push(customer);
    this.verificacoes.push({ ...verification, tenantId: customer.tenantId });
    this.eventos.push(event);
    return 'created' as const;
  }

  async addVerification(verification: EmailVerification) {
    this.verificacoes.push({ ...verification, tenantId: this.tenantAtual() });
  }

  async findVerification(tokenHash: string) {
    return this.verificacoes.find((v) => v.tokenHash === tokenHash && v.tenantId === this.tenantAtual());
  }

  async confirmEmail(customer: Customer, tokenHash: string, usedAt: Date, event: DomainEvent) {
    const indice = this.verificacoes.findIndex((v) => v.tokenHash === tokenHash);
    const atual = this.verificacoes[indice];
    if (atual !== undefined) this.verificacoes[indice] = { ...atual, usedAt };
    this.eventos.push(event);
    void customer;
  }
}

class CarteiroFalso implements CustomerMailerPort {
  readonly verificacoes: { to: string; link: string }[] = [];
  readonly tentativas: { to: string }[] = [];
  falhar = false;

  async sendVerification(input: { to: string; name: string; link: string }) {
    if (this.falhar) throw new Error('smtp fora');
    this.verificacoes.push({ to: input.to, link: input.link });
  }

  async sendRegistrationAttempt(input: { to: string }) {
    this.tentativas.push({ to: input.to });
  }
}

const tokenDoLink = (link: string): string => decodeURIComponent(link.split('#token=')[1] ?? '');

describe('RegisterCustomer / VerifyCustomerEmail (US-010)', () => {
  let clock: FixedClock;
  let tenantAtual: TenantContext;
  let repositorio: CompradoresEmMemoria;
  let carteiro: CarteiroFalso;
  let hashes: number;
  let falhasDeEmail: unknown[];
  let cadastro: RegisterCustomer;
  let confirmacao: VerifyCustomerEmail;

  const comando = (extra: Partial<RegisterCustomerCommand> = {}): RegisterCustomerCommand => ({
    name: 'Ana Silva',
    email: 'ana@exemplo.com',
    document: '529.982.247-25',
    password: 'compras2026!',
    acceptTerms: true,
    ip: '200.1.2.3',
    ...extra,
  });

  const naLoja = <T>(tenant: TenantContext, fn: () => Promise<T>): Promise<T> => {
    tenantAtual = tenant;
    return runWithTenant(tenant, fn);
  };

  beforeEach(() => {
    clock = new FixedClock('2026-09-23T12:00:00Z');
    tenantAtual = contexto(lojaA);
    repositorio = new CompradoresEmMemoria(() => tenantAtual.tenantId);
    carteiro = new CarteiroFalso();
    hashes = 0;
    falhasDeEmail = [];

    cadastro = new RegisterCustomer({
      customers: repositorio,
      mailer: carteiro,
      hasher: {
        hash: async (senha) => {
          hashes += 1;
          return `hash:${senha}`;
        },
        verify: async () => true,
        needsRehash: () => false,
      },
      breaches: { isBreached: async (senha) => senha === 'senhavazada123' },
      links: {
        verifyEmail: (token) => `http://${tenantAtual.slug}.localhost:3000/conta/confirmar#token=${token}`,
        login: () => 'http://loja/conta/entrar',
        resetPassword: () => 'http://loja/conta/recuperar-senha',
      },
      legal: { current: async () => ({ terms_of_use: '2026-09', privacy_policy: '2026-09' }) },
      clock,
      onMailFailure: (error) => falhasDeEmail.push(error),
    });
    confirmacao = new VerifyCustomerEmail(repositorio, clock);
  });

  it('cenário "cadastro válido": conta pending_verification, e-mail com link de 24 h e evento no outbox', async () => {
    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));

    const [cliente] = repositorio.clientes;
    expect(cliente?.status).toBe('pending_verification');
    expect(cliente?.passwordHash).toBe('hash:compras2026!');
    expect(carteiro.verificacoes).toHaveLength(1);
    expect(carteiro.verificacoes[0]?.link).toMatch(
      /^http:\/\/loja-a\.localhost:3000\/conta\/confirmar#token=/,
    );

    const [verificacao] = repositorio.verificacoes;
    expect(verificacao?.expiresAt.getTime()).toBe(clock.now().getTime() + EMAIL_VERIFICATION_TTL_MS);
    // o banco guarda o hash, nunca o token do link
    expect(verificacao?.tokenHash).toBe(hashSecretToken(tokenDoLink(carteiro.verificacoes[0]?.link ?? '')));

    expect(repositorio.eventos.map((evento) => evento.type)).toEqual(['identity.customer.registered']);
    expect(repositorio.eventos[0]?.data).toEqual({ customerId: cliente?.id });
  });

  it('cenário "e-mail já cadastrado": mesma resposta, sem conta nova, e o dono recebe o aviso', async () => {
    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));
    const cliente = repositorio.clientes[0];
    if (cliente === undefined) throw new Error('sem cliente');
    cliente.verifyEmail(clock);

    const resposta = await naLoja(contexto(lojaA), () =>
      cadastro.execute(comando({ name: 'Outra Pessoa', email: ' ANA@exemplo.com ' })),
    );

    expect(resposta).toBeUndefined();
    expect(repositorio.clientes).toHaveLength(1);
    expect(carteiro.tentativas).toEqual([{ to: 'ana@exemplo.com' }]);
    // o hash é calculado nos dois caminhos: tempo de resposta não vira oráculo
    expect(hashes).toBe(2);
  });

  it('conta ainda não confirmada recebe um link novo em vez do aviso', async () => {
    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));
    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));

    expect(carteiro.verificacoes).toHaveLength(2);
    expect(carteiro.tentativas).toHaveLength(0);
    expect(repositorio.verificacoes).toHaveLength(2);
  });

  it('corrida com outro cadastro do mesmo e-mail cai na resposta genérica', async () => {
    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));
    repositorio.perderProximaCorrida = true;
    // e-mail ainda não visto pela checagem prévia (simula a janela entre ler e gravar)
    const emailNovo = comando({ email: 'bia@exemplo.com' });

    await expect(naLoja(contexto(lojaA), () => cadastro.execute(emailNovo))).resolves.toBeUndefined();
  });

  it('cenário "CPF inválido": erro no campo document, nada gravado', async () => {
    const erro = await naLoja(contexto(lojaA), () =>
      cadastro.execute(comando({ document: '529.982.247-24' })),
    ).catch((error: unknown) => error);

    expect(erro).toBeInstanceOf(ValidationError);
    expect((erro as ValidationError).details).toEqual({ field: 'document' });
    expect(repositorio.clientes).toHaveLength(0);
  });

  it('sem aceite dos termos não há conta', async () => {
    const erro = await naLoja(contexto(lojaA), () => cadastro.execute(comando({ acceptTerms: false }))).catch(
      (error: unknown) => error,
    );

    expect((erro as ValidationError).details).toEqual({ field: 'acceptTerms' });
  });

  it('senha vazada é recusada (RNF-SEG-02)', async () => {
    const erro = await naLoja(contexto(lojaA), () =>
      cadastro.execute(comando({ password: 'senhavazada123' })),
    ).catch((error: unknown) => error);

    expect((erro as ValidationError).details).toEqual({ field: 'password' });
  });

  it('multi-tenant: o mesmo e-mail cria conta independente em outro marketplace', async () => {
    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));
    await naLoja(contexto(lojaB), () => cadastro.execute(comando()));

    expect(repositorio.clientes.map((cliente) => cliente.tenantId)).toEqual([lojaA.tenantId, lojaB.tenantId]);
    expect(carteiro.tentativas).toHaveLength(0);
    expect(carteiro.verificacoes[1]?.link).toContain('loja-b.localhost');
  });

  it('falha no envio do e-mail não desfaz o cadastro, mas é registrada', async () => {
    carteiro.falhar = true;

    await naLoja(contexto(lojaA), () => cadastro.execute(comando()));

    expect(repositorio.clientes).toHaveLength(1);
    expect(falhasDeEmail).toHaveLength(1);
  });

  describe('confirmação do e-mail (RF-IAM-02)', () => {
    const cadastrarEPegarToken = async (tenant: TenantContext): Promise<string> => {
      await naLoja(tenant, () => cadastro.execute(comando()));
      return tokenDoLink(carteiro.verificacoes.at(-1)?.link ?? '');
    };

    it('ativa a conta e publica identity.customer.verified', async () => {
      const token = await cadastrarEPegarToken(contexto(lojaA));

      const resultado = await naLoja(contexto(lojaA), () => confirmacao.execute(token));

      expect(resultado).toEqual({ status: 'verified' });
      expect(repositorio.clientes[0]?.status).toBe('active');
      expect(repositorio.eventos.map((evento) => evento.type)).toContain('identity.customer.verified');
    });

    it('link usado de novo numa conta ativa responde sucesso sem novo evento', async () => {
      const token = await cadastrarEPegarToken(contexto(lojaA));
      await naLoja(contexto(lojaA), () => confirmacao.execute(token));
      const eventos = repositorio.eventos.length;

      const resultado = await naLoja(contexto(lojaA), () => confirmacao.execute(token));

      expect(resultado).toEqual({ status: 'already_verified' });
      expect(repositorio.eventos).toHaveLength(eventos);
    });

    it('link vencido (mais de 24 h) é recusado', async () => {
      const token = await cadastrarEPegarToken(contexto(lojaA));
      clock.advance(EMAIL_VERIFICATION_TTL_MS + 1);

      await expect(naLoja(contexto(lojaA), () => confirmacao.execute(token))).rejects.toThrow(
        /inválido ou expirado/,
      );
    });

    it('link de outra loja não confirma nada (cross-tenant)', async () => {
      const tokenDaA = await cadastrarEPegarToken(contexto(lojaA));

      await expect(naLoja(contexto(lojaB), () => confirmacao.execute(tokenDaA))).rejects.toThrow(
        /inválido ou expirado/,
      );
      expect(repositorio.clientes[0]?.status).toBe('pending_verification');
    });

    it('token inventado recebe o mesmo erro genérico', async () => {
      await expect(
        naLoja(contexto(lojaA), () => confirmacao.execute('token-inventado-com-tamanho-suficiente')),
      ).rejects.toThrow(/inválido ou expirado/);
    });
  });
});
