import { createSecretToken, hashSecretToken, requireTenant, type PasswordHasher } from '@mkt/platform';
import { type Clock, DomainError, Id } from '@mkt/shared-kernel';

import { normalizeEmail } from '../../domain/customer/credentials.js';
import type { Customer } from '../../domain/customer/customer.js';
import { CLEAR_THROTTLE, isLocked, registerFailure } from '../../domain/customer/login-throttle.js';
import type { CustomerRepositoryPort } from './ports.js';
import type {
  CustomerAccessTokenPort,
  CustomerCredentialsPort,
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
} from './session-ports.js';

/** RF-IAM-03: refresh de 30 dias, renovado a cada troca. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Mesmo erro para e-mail inexistente, senha errada, conta bloqueada ou
 * suspensa: o login não pode servir para descobrir quem tem conta.
 */
export class InvalidCredentialsError extends DomainError {
  readonly httpStatus = 401;

  constructor() {
    super('invalid_credentials', 'E-mail ou senha incorretos', {});
  }
}

/** Refresh inválido, expirado, revogado ou reusado: o comprador entra de novo. */
export class InvalidRefreshTokenError extends DomainError {
  readonly httpStatus = 401;

  constructor() {
    super('invalid_refresh_token', 'Sessão expirada. Entre de novo.', {});
  }
}

export interface CustomerTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
}

export interface CustomerSessionDependencies {
  readonly customers: CustomerRepositoryPort;
  readonly credentials: CustomerCredentialsPort;
  readonly refreshTokens: RefreshTokenRepositoryPort;
  readonly accessTokens: CustomerAccessTokenPort;
  readonly hasher: PasswordHasher;
  readonly clock: Clock;
  /**
   * Hash de uma senha qualquer, verificado quando o e-mail não existe: o
   * login custa o mesmo com e sem conta, e o tempo não vira oráculo.
   */
  readonly decoyPasswordHash: string;
  /** Reuso de refresh é incidente de segurança: precisa ficar registrado. */
  readonly onRefreshReuse?: (info: { customerId: string; familyId: string }) => void;
}

/** Quem pode ter sessão: conta confirmada ou aguardando confirmação (a compra exige confirmada). */
const canSignIn = (customer: Customer): boolean =>
  customer.status === 'active' || customer.status === 'pending_verification';

/**
 * Sessões do comprador (US-011): login, refresh rotativo com detecção de
 * reuso, logout. O access token é um JWT de 15 min com o tenant dentro; o
 * refresh é opaco, de uso único, guardado só como SHA-256.
 */
export class CustomerSessions {
  constructor(private readonly deps: CustomerSessionDependencies) {}

  async login(input: { email: string; password: string }): Promise<CustomerTokens> {
    const { credentials, hasher, clock } = this.deps;
    const now = clock.now();

    let email: string;
    try {
      email = normalizeEmail(input.email);
    } catch {
      await hasher.verify(this.deps.decoyPasswordHash, input.password);
      throw new InvalidCredentialsError();
    }

    const record = await credentials.findLoginRecord(email);
    if (record === undefined) {
      await hasher.verify(this.deps.decoyPasswordHash, input.password);
      throw new InvalidCredentialsError();
    }

    const { customer, throttle } = record;

    // bloqueada: nem confere a senha (senão o bloqueio viraria só um atraso)
    if (isLocked(throttle, now)) {
      await hasher.verify(this.deps.decoyPasswordHash, input.password);
      throw new InvalidCredentialsError();
    }

    const matches = await hasher.verify(customer.passwordHash, input.password);
    if (!matches) {
      await credentials.saveThrottle(customer.id, registerFailure(throttle, now));
      throw new InvalidCredentialsError();
    }

    if (!canSignIn(customer)) throw new InvalidCredentialsError();

    if (throttle.failedAttempts > 0) await credentials.saveThrottle(customer.id, CLEAR_THROTTLE);
    // parâmetros do Argon2 endurecidos desde o cadastro: aproveita a senha em claro para atualizar
    if (hasher.needsRehash(customer.passwordHash)) {
      await credentials.updatePasswordHash(customer.id, await hasher.hash(input.password));
    }

    return this.openFamily(customer.id);
  }

  async refresh(refreshToken: string): Promise<CustomerTokens> {
    const { refreshTokens, customers, clock } = this.deps;
    const now = clock.now();

    const current = await refreshTokens.findByHash(hashSecretToken(refreshToken));
    if (current === undefined || current.revokedAt !== undefined) throw new InvalidRefreshTokenError();

    if (current.usedAt !== undefined) {
      // token já trocado sendo reapresentado: alguém tem uma cópia
      await this.revokeForReuse(current, now);
      throw new InvalidRefreshTokenError();
    }

    if (current.expiresAt.getTime() <= now.getTime()) throw new InvalidRefreshTokenError();

    const customer = await customers.findById(current.customerId);
    if (customer === undefined || !canSignIn(customer)) {
      await refreshTokens.revokeFamily(current.familyId, now);
      throw new InvalidRefreshTokenError();
    }

    const { token, record } = this.newRefresh(current.customerId, current.familyId);
    const result = await refreshTokens.rotate(current.id, now, record);
    if (result === 'already_used') {
      await this.revokeForReuse(current, now);
      throw new InvalidRefreshTokenError();
    }

    return this.tokens(current.customerId, token, record.expiresAt);
  }

  /** Encerra a família do refresh informado. Token desconhecido não é erro: sair é sempre possível. */
  async logout(refreshToken: string): Promise<void> {
    const current = await this.deps.refreshTokens.findByHash(hashSecretToken(refreshToken));
    if (current !== undefined)
      await this.deps.refreshTokens.revokeFamily(current.familyId, this.deps.clock.now());
  }

  private async openFamily(customerId: string): Promise<CustomerTokens> {
    const { token, record } = this.newRefresh(customerId, Id.create(this.deps.clock));
    await this.deps.refreshTokens.create(record);
    return this.tokens(customerId, token, record.expiresAt);
  }

  private newRefresh(customerId: string, familyId: string): { token: string; record: RefreshTokenRecord } {
    const { token, hash } = createSecretToken();
    const now = this.deps.clock.now();

    return {
      token,
      record: {
        id: Id.create(this.deps.clock),
        customerId,
        familyId,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    };
  }

  private tokens(customerId: string, refreshToken: string, refreshTokenExpiresAt: Date): CustomerTokens {
    const access = this.deps.accessTokens.issue({ customerId, tenantId: requireTenant().tenantId });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async revokeForReuse(record: RefreshTokenRecord, now: Date): Promise<void> {
    await this.deps.refreshTokens.revokeFamily(record.familyId, now);
    this.deps.onRefreshReuse?.({ customerId: record.customerId, familyId: record.familyId });
  }
}
