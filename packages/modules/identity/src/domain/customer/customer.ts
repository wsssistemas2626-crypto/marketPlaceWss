import { type Clock, Id, InvariantViolationError, ValidationError } from '@mkt/shared-kernel';

import { normalizeEmail } from './credentials.js';
import { parseTaxDocument, type TaxDocument } from './document.js';

/**
 * Estados da conta do comprador (CLAUDE.md §4.7: máquina de estados explícita).
 *
 * `pending_verification` → `active` quando o e-mail é confirmado (RF-IAM-02);
 * só conta ativa compra. `blocked` e `anonymized` chegam com o login (bloqueio
 * progressivo) e a LGPD (RF-IAM-08).
 */
export type CustomerStatus = 'pending_verification' | 'active' | 'blocked' | 'anonymized';

const TRANSITIONS: Readonly<Record<CustomerStatus, readonly CustomerStatus[]>> = {
  pending_verification: ['active', 'anonymized'],
  active: ['blocked', 'anonymized'],
  blocked: ['active', 'anonymized'],
  anonymized: [],
};

/** Documentos que o cadastro exige aceitar (RF-IAM-01). */
export const REQUIRED_CONSENTS = ['terms_of_use', 'privacy_policy'] as const;
export type ConsentKind = (typeof REQUIRED_CONSENTS)[number] | 'marketing';

/** RNF-LGPD-03: versão aceita, quando e de onde. */
export interface Consent {
  readonly kind: ConsentKind;
  readonly version: string;
  readonly acceptedAt: Date;
  readonly ip: string;
}

export interface CustomerSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  /** Dado pessoal. */
  readonly email: string;
  /** Dado pessoal. */
  readonly document: TaxDocument;
  readonly passwordHash: string;
  readonly status: CustomerStatus;
  readonly emailVerifiedAt?: Date;
  readonly consents: readonly Consent[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterCustomerInput {
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly document: string;
  readonly passwordHash: string;
  /** Versões vigentes dos documentos aceitos — vêm da configuração, não do cliente. */
  readonly acceptedVersions: Readonly<Record<(typeof REQUIRED_CONSENTS)[number], string>>;
  readonly ip: string;
}

const MAX_NAME_LENGTH = 120;

export class Customer {
  private constructor(private snapshot: CustomerSnapshot) {}

  static register(input: RegisterCustomerInput, clock: Clock): Customer {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      throw new ValidationError('Informe o nome completo', { field: 'name' });
    }

    const now = clock.now();

    return new Customer({
      id: Id.create(clock),
      tenantId: Id.parse(input.tenantId, 'tenantId'),
      name,
      email: normalizeEmail(input.email),
      document: parseTaxDocument(input.document),
      passwordHash: input.passwordHash,
      status: 'pending_verification',
      consents: REQUIRED_CONSENTS.map((kind) => ({
        kind,
        version: input.acceptedVersions[kind],
        acceptedAt: now,
        ip: input.ip,
      })),
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(snapshot: CustomerSnapshot): Customer {
    return new Customer(snapshot);
  }

  get id(): string {
    return this.snapshot.id;
  }

  get tenantId(): string {
    return this.snapshot.tenantId;
  }

  get email(): string {
    return this.snapshot.email;
  }

  get name(): string {
    return this.snapshot.name;
  }

  get status(): CustomerStatus {
    return this.snapshot.status;
  }

  get passwordHash(): string {
    return this.snapshot.passwordHash;
  }

  toSnapshot(): CustomerSnapshot {
    return this.snapshot;
  }

  /** Confirmação do e-mail (RF-IAM-02). Repetir numa conta já ativa não é erro. */
  verifyEmail(clock: Clock): 'verified' | 'already_verified' {
    if (this.snapshot.status === 'active' && this.snapshot.emailVerifiedAt !== undefined) {
      return 'already_verified';
    }

    const now = clock.now();
    this.transitionTo('active', now);
    this.snapshot = { ...this.snapshot, emailVerifiedAt: now };
    return 'verified';
  }

  private transitionTo(next: CustomerStatus, now: Date): void {
    if (!TRANSITIONS[this.snapshot.status].includes(next)) {
      throw new InvariantViolationError(`Conta em "${this.snapshot.status}" não pode ir para "${next}"`, {
        from: this.snapshot.status,
        to: next,
      });
    }

    this.snapshot = { ...this.snapshot, status: next, updatedAt: now };
  }
}
