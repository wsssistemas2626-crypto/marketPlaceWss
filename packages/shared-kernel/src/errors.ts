/**
 * Detalhes de um erro de domínio. Nunca coloque aqui CPF, endereço, telefone,
 * e-mail ou token: estes objetos vão para log e resposta HTTP (CLAUDE.md §4.9).
 */
export type ErrorDetails = Record<string, string | number | boolean | null>;

/**
 * Erro previsto pela regra de negócio. O filtro de exceções da API traduz
 * `code` para o `type` do Problem Details (RFC 9457) na US-006.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details: ErrorDetails;

  constructor(code: string, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }

  toJSON(): { code: string; message: string; details: ErrorDetails } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

/** Entrada malformada ou fora das restrições declaradas. → HTTP 422 */
export class ValidationError extends DomainError {
  constructor(message: string, details: ErrorDetails = {}) {
    super('validation_error', message, details);
  }
}

/** Operação que deixaria o agregado em estado inválido (ex.: transição proibida). → HTTP 409 */
export class InvariantViolationError extends DomainError {
  constructor(message: string, details: ErrorDetails = {}) {
    super('invariant_violation', message, details);
  }
}

/** Recurso inexistente **no tenant atual** — nunca revele existência em outro tenant. → HTTP 404 */
export class NotFoundError extends DomainError {
  constructor(resource: string, details: ErrorDetails = {}) {
    super('not_found', `${resource} não encontrado`, { resource, ...details });
  }
}

/** Conflito com o estado atual (duplicidade, concorrência otimista). → HTTP 409 */
export class ConflictError extends DomainError {
  constructor(message: string, details: ErrorDetails = {}) {
    super('conflict', message, details);
  }
}
