import {
  CLERK_ADMIN_ROLE,
  isRoleAllowedFor,
  roleRequiresMfa,
  type OrganizationKind,
  type VerifiedPanelToken,
} from '@mkt/contracts';
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

export class MfaRequiredError extends PanelAuthError {
  constructor() {
    super(
      'mfa_required',
      'Seu papel exige verificação em duas etapas: ative-a no seu perfil e entre de novo',
      403,
    );
  }
}

/** Sessão de painel já validada: token + vínculo conferido no banco. */
export interface PanelSession {
  readonly userId: string;
  readonly organizationId: string;
  readonly kind: OrganizationKind;
  readonly tenantId: string;
  readonly sellerId?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  /** A sessão passou por segundo fator (RF-IAM-14). */
  readonly secondFactorVerified: boolean;
}

/** Papel que administra a organização: na Clerk ele detém todas as permissões dela. */
export const ORG_ADMIN_ROLE = CLERK_ADMIN_ROLE;

/**
 * Transforma um token verificado em sessão de painel.
 *
 * O ponto central do ADR-013 está aqui: as claims da Clerk **não** são
 * confiáveis sozinhas. O tenant (e o seller) vêm do `org_links` no nosso
 * banco; se a claim discordar do vínculo, a requisição é recusada — um token
 * adulterado ou uma organização remapeada não viram acesso a outro tenant.
 *
 * Papel de outro tipo de organização é descartado junto com as permissões:
 * `org:seller_finance` atribuído por engano numa organização de tenant não
 * pode abrir `org:finance:read` no admin (ADR-013, tabela de papéis).
 */
export function toPanelSession(token: VerifiedPanelToken, link: OrgLink | undefined): PanelSession {
  if (link === undefined || link.status !== 'active') {
    throw new OrganizationNotLinkedError();
  }
  if (token.organizationKind !== undefined && link.kind !== token.organizationKind) {
    throw new WrongOrganizationKindError();
  }
  if (token.tenantId !== undefined && token.tenantId !== link.tenantId) {
    throw new OrganizationNotLinkedError();
  }
  if (link.kind === 'seller' && token.sellerId !== undefined && token.sellerId !== link.sellerId) {
    throw new OrganizationNotLinkedError();
  }

  const roles = token.roles.filter((role) => isRoleAllowedFor(role, link.kind));

  return {
    userId: token.userId,
    organizationId: link.clerkOrgId,
    kind: link.kind,
    tenantId: link.tenantId,
    ...(link.sellerId === undefined ? {} : { sellerId: link.sellerId }),
    roles,
    // um papel por associação na Clerk: sem papel válido, nenhuma permissão vale
    permissions: roles.length === 0 ? [] : token.permissions,
    secondFactorVerified: token.secondFactorVerified === true,
  };
}

export function assertKind(session: PanelSession, expected: OrganizationKind): void {
  if (session.kind !== expected) throw new WrongOrganizationKindError();
}

/**
 * Confere a permissão exigida pela rota.
 *
 * O papel `org:admin` passa mesmo sem a permissão listada: na Clerk ele detém
 * todas as permissões da organização, e o token só enumera as que o papel
 * recebeu explicitamente — um admin de tenant ficaria trancado para fora do
 * próprio painel. Qualquer outro papel precisa da permissão no token.
 */
export function assertPermission(session: PanelSession, permission: string): void {
  if (session.roles.includes(ORG_ADMIN_ROLE)) return;
  if (!session.permissions.includes(permission)) throw new MissingPermissionError(permission);
}

/**
 * RF-IAM-14: `tenant_admin`, `tenant_finance`, `seller_owner` (e o
 * `org:admin`, que tem tudo) só entram com segundo fator verificado na sessão.
 */
export function assertMfa(session: Pick<PanelSession, 'roles' | 'secondFactorVerified'>): void {
  if (session.secondFactorVerified) return;
  if (session.roles.some(roleRequiresMfa)) throw new MfaRequiredError();
}
