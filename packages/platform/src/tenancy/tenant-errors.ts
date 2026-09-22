import { DomainError, type ErrorDetails } from '@mkt/shared-kernel';

/**
 * Erros de tenancy. O `code` vira o `type` do Problem Details (US-006) e o
 * `httpStatus` é o que o filtro de exceções usa.
 *
 * Nenhuma mensagem revela se um tenant existe: host desconhecido e tenant de
 * outra célula respondem igual (404), como pede `06-multi-tenancy.md` §2.
 */
export class TenantError extends DomainError {
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number, details: ErrorDetails = {}) {
    super(code, message, details);
    this.httpStatus = httpStatus;
  }
}

export class TenantNotFoundError extends TenantError {
  constructor() {
    super('tenant_not_found', 'Recurso não encontrado', 404);
  }
}

export class TenantSuspendedError extends TenantError {
  constructor(slug: string) {
    super('tenant_suspended', 'Esta loja está temporariamente indisponível', 403, { slug });
  }
}

/** Credencial de um tenant usada no host/contexto de outro. */
export class TenantMismatchError extends TenantError {
  constructor() {
    super('tenant_mismatch', 'Credencial não pertence a este tenant', 403);
  }
}

/** Faltou abrir o contexto — bug de programação, não entrada do usuário. */
export class TenantContextMissingError extends TenantError {
  constructor() {
    super(
      'tenant_context_missing',
      'Operação executada sem TenantContext: use withTenantTx/runWithTenant ou marque o job com @PlatformJob',
      500,
    );
  }
}
