import { createSecretToken, hashSecretToken, type PasswordHasher } from '@mkt/platform';
import { type Clock, ValidationError } from '@mkt/shared-kernel';

import { assertStrongPassword, normalizeEmail } from '../../domain/customer/credentials.js';
import type { CustomerRepositoryPort, PasswordBreachPort, StorefrontLinksPort } from './ports.js';

/** RF-IAM-04: o link de troca de senha vale 1 hora. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface PasswordResetRecord {
  readonly customerId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt?: Date;
}

export interface PasswordResetRepositoryPort {
  /** Grava o pedido novo e invalida os anteriores ainda abertos do mesmo comprador. */
  open(record: PasswordResetRecord, at: Date): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetRecord | undefined>;
  /**
   * Numa transação: consome o token (só se ainda não foi usado), grava a
   * senha nova, zera o bloqueio de login e **revoga todas as sessões**.
   * `already_used` = outro clique no mesmo link chegou antes.
   */
  complete(input: {
    customerId: string;
    tokenHash: string;
    passwordHash: string;
    at: Date;
  }): Promise<'completed' | 'already_used'>;
}

export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');

export interface PasswordResetMailerPort {
  sendPasswordReset(input: { to: string; name: string; link: string }): Promise<void>;
  /** Aviso de segurança depois da troca: se não foi a pessoa, ela fica sabendo. */
  sendPasswordChanged(input: { to: string; name: string; resetLink: string }): Promise<void>;
}

export const PASSWORD_RESET_MAILER = Symbol('PASSWORD_RESET_MAILER');

/** Links de troca de senha, no domínio da loja do tenant. */
export interface PasswordResetLinksPort extends StorefrontLinksPort {
  choosePassword(token: string): string;
}

const invalidLink = () =>
  new ValidationError('Link de troca de senha inválido ou expirado. Peça um novo.', { field: 'token' });

export interface PasswordResetDependencies {
  readonly customers: CustomerRepositoryPort;
  readonly resets: PasswordResetRepositoryPort;
  readonly mailer: PasswordResetMailerPort;
  readonly links: PasswordResetLinksPort;
  readonly hasher: PasswordHasher;
  readonly breaches: PasswordBreachPort;
  readonly clock: Clock;
  readonly onMailFailure?: (error: unknown) => void;
}

/**
 * Recuperação de senha do comprador (US-012).
 *
 * **Pedido:** resposta sempre igual, exista ou não a conta — e o e-mail sai
 * fora do caminho da resposta, para o tempo também não denunciar.
 * **Troca:** token de uso único e 1 hora; a senha nova segue a mesma política
 * do cadastro; todas as sessões do comprador caem (quem roubou a senha antiga
 * perde o acesso junto).
 */
export class PasswordReset {
  constructor(private readonly deps: PasswordResetDependencies) {}

  /**
   * Devolve a entrega do e-mail como promessa separada: o controller responde
   * sem esperar por ela. Nos testes, dá para aguardar.
   */
  async request(input: { email: string }): Promise<{ delivery: Promise<void> }> {
    const { customers, resets, clock } = this.deps;

    let email: string;
    try {
      email = normalizeEmail(input.email);
    } catch {
      return { delivery: Promise.resolve() };
    }

    const customer = await customers.findByEmail(email);
    // conta bloqueada pelo operador ou anonimizada não recupera senha por e-mail
    if (
      customer === undefined ||
      (customer.status !== 'active' && customer.status !== 'pending_verification')
    ) {
      return { delivery: Promise.resolve() };
    }

    const now = clock.now();
    const { token, hash } = createSecretToken();
    await resets.open(
      {
        customerId: customer.id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
      now,
    );

    const delivery = this.deps.mailer
      .sendPasswordReset({
        to: customer.email,
        name: customer.name,
        link: this.deps.links.choosePassword(token),
      })
      .catch((error: unknown) => this.deps.onMailFailure?.(error));

    return { delivery };
  }

  async complete(input: { token: string; password: string }): Promise<void> {
    const { customers, resets, hasher, breaches, clock } = this.deps;

    if (input.token.length < 20 || input.token.length > 200) throw invalidLink();

    const tokenHash = hashSecretToken(input.token);
    const record = await resets.findByHash(tokenHash);
    const now = clock.now();
    if (record === undefined || record.usedAt !== undefined || record.expiresAt.getTime() <= now.getTime()) {
      throw invalidLink();
    }

    const customer = await customers.findById(record.customerId);
    if (customer === undefined) throw invalidLink();

    assertStrongPassword(input.password, { email: customer.email });
    if (await breaches.isBreached(input.password)) {
      throw new ValidationError('Esta senha já apareceu em vazamentos de dados; escolha outra', {
        field: 'password',
      });
    }

    const result = await resets.complete({
      customerId: customer.id,
      tokenHash,
      passwordHash: await hasher.hash(input.password),
      at: now,
    });
    if (result === 'already_used') throw invalidLink();

    await this.deps.mailer
      .sendPasswordChanged({
        to: customer.email,
        name: customer.name,
        resetLink: this.deps.links.resetPassword(),
      })
      .catch((error: unknown) => this.deps.onMailFailure?.(error));
  }
}
