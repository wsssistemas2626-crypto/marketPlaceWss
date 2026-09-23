import type { Customer } from '../../domain/customer/customer.js';
import type { LoginThrottleState } from '../../domain/customer/login-throttle.js';

/** Conta + estado do bloqueio progressivo, lidos juntos no login. */
export interface LoginRecord {
  readonly customer: Customer;
  readonly throttle: LoginThrottleState;
}

/** O que o login e a troca de senha precisam da conta, além do repositório de cadastro. */
export interface CustomerCredentialsPort {
  findLoginRecord(email: string): Promise<LoginRecord | undefined>;
  saveThrottle(customerId: string, state: LoginThrottleState): Promise<void>;
  updatePasswordHash(customerId: string, passwordHash: string): Promise<void>;
}

export const CUSTOMER_CREDENTIALS = Symbol('CUSTOMER_CREDENTIALS');

/**
 * Refresh token de uma **família**: o login abre a família, cada refresh troca
 * o token por um novo da mesma família. Reapresentar um token já trocado é
 * sinal de roubo — a família inteira é revogada (RF-IAM-03 / US-011).
 */
export interface RefreshTokenRecord {
  readonly id: string;
  readonly customerId: string;
  readonly familyId: string;
  /** SHA-256 do token; o token em si só existe no cookie do comprador. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt?: Date;
  readonly revokedAt?: Date;
}

export interface RefreshTokenRepositoryPort {
  create(record: RefreshTokenRecord): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  /**
   * Marca o antigo como usado e grava o novo, **só se o antigo ainda não foi
   * usado** — dois refreshes simultâneos com o mesmo token: um ganha, o outro
   * é tratado como reuso.
   */
  rotate(previousId: string, usedAt: Date, next: RefreshTokenRecord): Promise<'rotated' | 'already_used'>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  /** Todas as sessões do comprador (troca de senha, US-012). */
  revokeAllOf(customerId: string, at: Date): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

/** Access token do comprador: JWT curto com o tenant (`tid`) dentro. */
export interface CustomerAccessTokenPort {
  issue(input: { customerId: string; tenantId: string }): { token: string; expiresAt: Date };
  /** Lança se o token for inválido, expirado ou de outra loja. */
  verify(token: string): { customerId: string; tenantId: string };
}

export const CUSTOMER_ACCESS_TOKENS = Symbol('CUSTOMER_ACCESS_TOKENS');
