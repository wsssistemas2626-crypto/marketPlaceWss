import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { requireTenant } from '@mkt/platform';
import { DomainError } from '@mkt/shared-kernel';

import {
  CUSTOMER_ACCESS_TOKENS,
  type CustomerAccessTokenPort,
} from '../application/customers/session-ports.js';

/** Metadado de rota do comprador — lido também pela auditoria de guards (RNF-SEG-03). */
export const CUSTOMER_AUTH = 'mkt:customer-auth';

/** Rota do storefront que exige comprador logado **nesta** loja. */
export const CustomerAuth = (): MethodDecorator & ClassDecorator => SetMetadata(CUSTOMER_AUTH, true);

export class CustomerNotAuthenticatedError extends DomainError {
  readonly httpStatus = 401;

  constructor() {
    super('customer_not_authenticated', 'Entre na sua conta para continuar', {});
  }
}

export interface CustomerSession {
  readonly customerId: string;
}

interface CustomerRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  customerSession?: CustomerSession;
}

/**
 * Autentica o comprador nas rotas `@CustomerAuth()`.
 *
 * Guard, não middleware: roda depois do `TenantContextMiddleware`, ainda
 * dentro do contexto do tenant do host — e é esse tenant que o `tid` do token
 * precisa ter. Token de comprador da loja A apresentado na loja B é recusado
 * mesmo com assinatura válida (ADR-009, atualização multi-tenancy).
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CUSTOMER_ACCESS_TOKENS) private readonly tokens: CustomerAccessTokenPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(CUSTOMER_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required !== true) return true;

    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith('Bearer ') === true ? raw.slice('Bearer '.length).trim() : '';
    if (token === '') throw new CustomerNotAuthenticatedError();

    let verified: { customerId: string; tenantId: string };
    try {
      verified = this.tokens.verify(token);
    } catch {
      // sem motivo na resposta: não vira oráculo para quem testa tokens
      throw new CustomerNotAuthenticatedError();
    }

    if (verified.tenantId !== requireTenant().tenantId) throw new CustomerNotAuthenticatedError();

    request.customerSession = { customerId: verified.customerId };
    return true;
  }
}

/** Comprador autenticado da requisição — só existe em rota `@CustomerAuth()`. */
export const CurrentCustomer = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const session = context.switchToHttp().getRequest<CustomerRequest>().customerSession;
  if (session === undefined) throw new CustomerNotAuthenticatedError();
  return session;
});
