import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { OrganizationKind } from '@mkt/contracts';

import { assertKind, assertPermission, InvalidPanelTokenError } from '../application/panel-session.js';
import type { PanelRequest } from './panel-auth.middleware.js';

const PANEL_AUTH = 'mkt:panel-auth';
const REQUIRES_PERMISSION = 'mkt:requires-permission';

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
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<OrganizationKind>(PANEL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (kind === undefined) return true; // rota não é de painel

    const session = context.switchToHttp().getRequest<PanelRequest>().panelSession;
    if (session === undefined) throw new InvalidPanelTokenError();

    assertKind(session, kind);

    const permission = this.reflector.getAllAndOverride<string>(REQUIRES_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission !== undefined) assertPermission(session, permission);

    return true;
  }
}
