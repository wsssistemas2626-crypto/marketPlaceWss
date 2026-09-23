import { type Clock, Id, ValidationError } from '@mkt/shared-kernel';

/** Teto do prazo de uma sessão de suporte (`06-multi-tenancy.md` §7). */
export const MAX_SUPPORT_DURATION_MINUTES = 120;
const MIN_REASON_LENGTH = 10;

export type SupportScope = 'read_only' | 'write';

export interface SupportSession {
  readonly id: string;
  readonly tenantId: string;
  readonly staffUserId: string;
  readonly reason: string;
  readonly scope: SupportScope;
  readonly expiresAt: Date;
  readonly revokedAt?: Date;
  readonly createdAt: Date;
}

export interface SupportSessionRepositoryPort {
  create(session: SupportSession): Promise<void>;
  findActive(tenantId: string, staffUserId: string, now: Date): Promise<SupportSession | undefined>;
  listByTenant(tenantId: string, limit: number): Promise<SupportSession[]>;
  revoke(tenantId: string, sessionId: string, revokedAt: Date): Promise<void>;
}

export const SUPPORT_SESSION_REPOSITORY = Symbol('SUPPORT_SESSION_REPOSITORY');

export interface OpenSupportSessionCommand {
  readonly tenantId: string;
  readonly staffUserId: string;
  readonly reason: string;
  readonly durationMinutes?: number;
  readonly scope?: SupportScope;
}

/**
 * Abre e consulta sessões de modo suporte (US-080 / RF-TEN-07).
 *
 * Três regras vêm do documento e estão codificadas aqui: **motivo obrigatório**
 * (auditoria sem motivo não explica nada), **prazo com teto de 2 h** (acesso
 * permanente deixaria de ser exceção) e **somente leitura por padrão**
 * (escrita no dado de um cliente precisa ser decisão consciente).
 */
export class SupportMode {
  constructor(
    private readonly repository: SupportSessionRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async open(command: OpenSupportSessionCommand): Promise<SupportSession> {
    const reason = command.reason.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      throw new ValidationError(
        `Descreva o motivo do acesso com pelo menos ${MIN_REASON_LENGTH} caracteres — ele fica visível ao admin do tenant`,
        { field: 'reason' },
      );
    }

    const duration = command.durationMinutes ?? MAX_SUPPORT_DURATION_MINUTES;
    if (duration <= 0 || duration > MAX_SUPPORT_DURATION_MINUTES) {
      throw new ValidationError(`A duração deve estar entre 1 e ${MAX_SUPPORT_DURATION_MINUTES} minutos`, {
        field: 'durationMinutes',
        max: MAX_SUPPORT_DURATION_MINUTES,
      });
    }

    const now = this.clock.now();
    const session: SupportSession = {
      id: Id.create(this.clock),
      tenantId: command.tenantId,
      staffUserId: command.staffUserId,
      reason,
      scope: command.scope ?? 'read_only',
      expiresAt: new Date(now.getTime() + duration * 60_000),
      createdAt: now,
    };

    await this.repository.create(session);
    return session;
  }

  /** Sessão válida agora — é o que autoriza o staff a enxergar o tenant. */
  async findActive(tenantId: string, staffUserId: string): Promise<SupportSession | undefined> {
    return this.repository.findActive(tenantId, staffUserId, this.clock.now());
  }

  /** Histórico que o admin do tenant vê ("a plataforma acessou sua conta em…"). */
  async listByTenant(tenantId: string, limit = 50): Promise<SupportSession[]> {
    return this.repository.listByTenant(tenantId, limit);
  }

  async revoke(tenantId: string, sessionId: string): Promise<void> {
    await this.repository.revoke(tenantId, sessionId, this.clock.now());
  }
}
