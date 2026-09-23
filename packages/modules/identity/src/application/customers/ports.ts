import type { DomainEvent } from '@mkt/shared-kernel';

import type { Customer } from '../../domain/customer/customer.js';

/** Confirmação de e-mail pendente. O banco guarda só o hash do token. */
export interface EmailVerification {
  readonly customerId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt?: Date;
}

/**
 * Persistência dos compradores. Tudo roda no tenant do `TenantContext` —
 * a tabela tem RLS e o e-mail é único **por tenant**.
 */
export interface CustomerRepositoryPort {
  findByEmail(email: string): Promise<Customer | undefined>;
  findById(id: string): Promise<Customer | undefined>;
  /**
   * Grava conta, consentimentos, confirmação pendente e evento na **mesma
   * transação** (outbox). `email_taken` cobre a corrida de dois cadastros
   * simultâneos com o mesmo e-mail, que a checagem prévia não pega.
   */
  create(
    customer: Customer,
    verification: EmailVerification,
    event: DomainEvent,
  ): Promise<'created' | 'email_taken'>;
  addVerification(verification: EmailVerification): Promise<void>;
  findVerification(tokenHash: string): Promise<EmailVerification | undefined>;
  /** Ativa a conta, consome o token e grava o evento — uma transação. */
  confirmEmail(customer: Customer, tokenHash: string, usedAt: Date, event: DomainEvent): Promise<void>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

/**
 * E-mails transacionais do comprador. A implementação resolve o provedor de
 * e-mail **do tenant** no hub de integrações — cada marketplace manda com a
 * própria marca e o próprio remetente.
 */
export interface CustomerMailerPort {
  sendVerification(input: { to: string; name: string; link: string }): Promise<void>;
  /** Cenário "e-mail já cadastrado": o dono fica sabendo, quem tentou não. */
  sendRegistrationAttempt(input: {
    to: string;
    name: string;
    loginLink: string;
    resetLink: string;
  }): Promise<void>;
}

export const CUSTOMER_MAILER = Symbol('CUSTOMER_MAILER');

/** RNF-SEG-02: senha que já apareceu em vazamento (k-anonymity). Opcional — ver checklist. */
export interface PasswordBreachPort {
  isBreached(password: string): Promise<boolean>;
}

export const PASSWORD_BREACH = Symbol('PASSWORD_BREACH');

/** Endereços da loja do tenant atual, para montar os links dos e-mails. */
export interface StorefrontLinksPort {
  verifyEmail(token: string): string;
  login(): string;
  resetPassword(): string;
}

export const STOREFRONT_LINKS = Symbol('STOREFRONT_LINKS');

/** Versões vigentes de termos e política — o cliente não escolhe o que aceitou. */
export interface LegalVersionsPort {
  current(): Promise<{ terms_of_use: string; privacy_policy: string }>;
}

export const LEGAL_VERSIONS = Symbol('LEGAL_VERSIONS');
