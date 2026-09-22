import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  type NestMiddleware,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { WorkforceIdentityPort } from '@mkt/contracts';

import { InvalidPanelTokenError } from '../application/panel-session.js';

export const CONSOLE_IDENTITY = Symbol('CONSOLE_IDENTITY');
const CONSOLE_AUTH = 'mkt:console-auth';

/** Marca a rota como do console da plataforma (staff, sem tenant). */
export const ConsoleAuth = (): MethodDecorator & ClassDecorator => SetMetadata(CONSOLE_AUTH, true);

/** Sessão do staff: não tem tenant — rotas `/v1/platform/*` são sem tenant. */
export interface ConsoleSession {
  readonly userId: string;
}

export interface ConsoleRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  consoleSession?: ConsoleSession;
}

/**
 * Autentica o staff da plataforma.
 *
 * Usa a aplicação Clerk **Console**, separada da aplicação "Plataforma"
 * (ADR-013): cadastro restrito a convite e MFA obrigatória, configurados no
 * dashboard (checklist §G). Aqui não se abre TenantContext — quando o staff
 * precisa agir dentro de um tenant, isso é o "modo suporte" da Fase 1,
 * auditado e com prazo (`06-multi-tenancy.md` §7).
 */
@Injectable()
export class ConsoleAuthMiddleware implements NestMiddleware {
  constructor(@Inject(CONSOLE_IDENTITY) private readonly identity: WorkforceIdentityPort) {}

  async use(request: ConsoleRequest, _response: unknown, next: (error?: unknown) => void): Promise<void> {
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith('Bearer ') === true ? raw.slice('Bearer '.length).trim() : undefined;

    if (token === undefined || token === '') {
      next();
      return;
    }

    try {
      const verified = await this.identity.verifyToken(token);
      request.consoleSession = { userId: verified.userId };
      next();
    } catch {
      next(new InvalidPanelTokenError());
    }
  }
}

@Injectable()
export class ConsoleAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(CONSOLE_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required !== true) return true;

    const session = context.switchToHttp().getRequest<ConsoleRequest>().consoleSession;
    if (session === undefined) throw new InvalidPanelTokenError();

    return true;
  }
}
