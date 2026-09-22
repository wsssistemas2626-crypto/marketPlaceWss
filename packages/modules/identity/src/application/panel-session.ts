import type { OrganizationKind, VerifiedPanelToken } from '@mkt/contracts';
import { DomainError } from '@mkt/shared-kernel';

/** Vínculo organização da Clerk → tenant/seller, conferido no banco. */
export interface OrgLink {
  readonly clerkOrgId: string;
  readonly kind: OrganizationKind;
  readonly tenantId: string;
  readonly sellerId?: string;
  readonly status: 'active' | 'suspended';
}

export interface OrgLinkRepositoryPort {
  findByOrgId(clerkOrgId: string): Promise<OrgLink | undefined>;
  upsert(link: OrgLink): Promise<void>;
  upsertUser(user: { clerkUserId: string; email: string; name?: string }): Promise<void>;
}

export const ORG_LINK_REPOSITORY = Symbol('ORG_LINK_REPOSITORY');
export const WORKFORCE_IDENTITY = Symbol('WORKFORCE_IDENTITY');

export class PanelAuthError extends DomainError {
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(code, message, {});
    this.httpStatus = httpStatus;
  }
}

export class InvalidPanelTokenError extends PanelAuthError {
  constructor() {
    super('invalid_token', 'Token de sessão inválido ou expirado', 401);
  }
}

export class OrganizationNotLinkedError extends PanelAuthError {
  constructor() {
    super('organization_not_linked', 'Esta organização não está vinculada a nenhum tenant', 403);
  }
}

export class WrongOrganizationKindError extends PanelAuthError {
  constructor() {
    super('wrong_organization_kind', 'Esta rota não aceita o tipo da organização ativa', 403);
  }
}

export class MissingPermissionError extends PanelAuthError {
  constructor(permission: string) {
    super('missing_permission', `Falta a permissão "${permission}" nesta organização`, 403);
  }
}

/** Sessão de painel já validada: token + vínculo conferido no banco. */
export interface PanelSession {
  readonly userId: string;
  readonly organizationId: string;
  readonly kind: OrganizationKind;
  readonly tenantId: string;
  readonly sellerId?: string;
  readonly permissions: readonly string[];
}

/**
 * Transforma um token verificado em sessão de painel.
 *
 * O ponto central do ADR-013 está aqui: as claims da Clerk **não** são
 * confiáveis sozinhas. O tenant (e o seller) vêm do `org_links` no nosso
 * banco; se a claim discordar do vínculo, a requisição é recusada — um token
 * adulterado ou uma organização remapeada não viram acesso a outro tenant.
 */
export function toPanelSession(token: VerifiedPanelToken, link: OrgLink | undefined): PanelSession {
  if (link === undefined || link.status !== 'active') {
    throw new OrganizationNotLinkedError();
  }
  if (link.kind !== token.organizationKind) {
    throw new WrongOrganizationKindError();
  }
  if (token.tenantId !== undefined && token.tenantId !== link.tenantId) {
    throw new OrganizationNotLinkedError();
  }
  if (link.kind === 'seller' && token.sellerId !== undefined && token.sellerId !== link.sellerId) {
    throw new OrganizationNotLinkedError();
  }

  return {
    userId: token.userId,
    organizationId: link.clerkOrgId,
    kind: link.kind,
    tenantId: link.tenantId,
    ...(link.sellerId === undefined ? {} : { sellerId: link.sellerId }),
    permissions: token.permissions,
  };
}

export function assertKind(session: PanelSession, expected: OrganizationKind): void {
  if (session.kind !== expected) throw new WrongOrganizationKindError();
}

export function assertPermission(session: PanelSession, permission: string): void {
  if (!session.permissions.includes(permission)) throw new MissingPermissionError(permission);
}
