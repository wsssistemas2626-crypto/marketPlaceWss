import { CanActivate, ExecutionContext, Inject, Injectable, Optional, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { OrganizationKind } from '@mkt/contracts';

import {
  assertKind,
  assertMfa,
  assertPermission,
  InvalidPanelTokenError,
} from '../application/panel-session.js';
import type { PanelRequest } from './panel-auth.middleware.js';

export const PANEL_AUTH = 'mkt:panel-auth';
export const REQUIRES_PERMISSION = 'mkt:requires-permission';

/** Política de autenticação decidida pelo host (composition root). */
export interface PanelAuthPolicy {
  /**
   * RF-IAM-14: exige segundo fator dos papéis sensíveis. Ligado em produção;
   * em desenvolvimento, só quando a instância da Clerk tem MFA habilitado.
   */
  readonly mfaEnforced: boolean;
}

export const PANEL_AUTH_POLICY = Symbol('PANEL_AUTH_POLICY');

/** Marca a rota como de painel e diz qual organização a atende (ADR-013). */
export const PanelAuth = (kind: OrganizationKind): MethodDecorator & ClassDecorator =>
  SetMetadata(PANEL_AUTH, kind);

/** Permissão customizada da Clerk exigida (ex.: `org:orders:manage`). */
export const Requires = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_PERMISSION, permission);

/**
 * Checa o que depende dos decorators da rota: se ela é de painel, qual tipo de
 * organização atende e qual permissão exige. A sessão já foi montada pelo
 * `PanelAuthMiddleware`.
 */
@Injectable()
export class PanelAuthGuard implements CanActivate {
  private readonly policy: PanelAuthPolicy;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(PANEL_AUTH_POLICY) policy?: PanelAuthPolicy,
  ) {
    this.policy = policy ?? { mfaEnforced: false };
  }

  canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<OrganizationKind>(PANEL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (kind === undefined) return true; // rota não é de painel

    const session = context.switchToHttp().getRequest<PanelRequest>().panelSession;
    if (session === undefined) throw new InvalidPanelTokenError();

    assertKind(session, kind);
    if (this.policy.mfaEnforced) assertMfa(session);

    const permission = this.reflector.getAllAndOverride<string>(REQUIRES_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission !== undefined) assertPermission(session, permission);

    return true;
  }
}
