import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';

import type { WorkforceIdentityPort } from '@mkt/contracts';
import { resolveTenantById, runWithTenant, TENANT_DIRECTORY, type TenantDirectoryPort } from '@mkt/platform';

import {
  InvalidPanelTokenError,
  ORG_LINK_REPOSITORY,
  toPanelSession,
  WORKFORCE_IDENTITY,
  type OrgLinkRepositoryPort,
  type PanelSession,
} from '../application/panel-session.js';

export interface PanelRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  panelSession?: PanelSession;
}

/**
 * Autentica a sessão de painel e **abre o TenantContext para o resto da
 * requisição**.
 *
 * Isto é middleware, não guard, por um motivo concreto: o `AsyncLocalStorage`
 * só cobre o que roda dentro do `run()`, e um guard devolve o controle antes
 * do handler. O guard (`PanelAuthGuard`) continua existindo para o que depende
 * dos decorators da rota — tipo de organização e permissão.
 *
 * Ordem: valida o token localmente (assinatura, expiração, `azp`) → confere o
 * vínculo da organização no **nosso** banco → resolve o tenant no registro
 * (status e célula) → abre o contexto.
 */
@Injectable()
export class PanelAuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(WORKFORCE_IDENTITY) private readonly identity: WorkforceIdentityPort,
    @Inject(ORG_LINK_REPOSITORY) private readonly links: OrgLinkRepositoryPort,
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectoryPort,
  ) {}

  async use(request: PanelRequest, _response: unknown, next: (error?: unknown) => void): Promise<void> {
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith('Bearer ') === true ? raw.slice('Bearer '.length).trim() : undefined;

    if (token === undefined || token === '') {
      // sem credencial: o guard decide se a rota exigia uma
      next();
      return;
    }

    try {
      let verified;
      try {
        verified = await this.identity.verifyToken(token);
      } catch {
        // não repassamos o motivo: evita virar oráculo para quem sonda tokens
        throw new InvalidPanelTokenError();
      }

      const session = toPanelSession(verified, await this.links.findByOrgId(verified.organizationId));
      const tenant = await resolveTenantById(session.tenantId, { directory: this.directory });

      request.panelSession = session;
      runWithTenant(tenant, next);
    } catch (error) {
      next(error);
    }
  }
}
