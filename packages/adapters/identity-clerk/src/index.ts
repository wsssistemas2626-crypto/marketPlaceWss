import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { Webhook } from 'svix';

import type { OrganizationKind, VerifiedPanelToken, WorkforceIdentityPort } from '@mkt/contracts';

export interface ClerkAdapterOptions {
  readonly secretKey: string;
  /** Chave pública da instância: permite verificar o token **sem rede**. */
  readonly jwtKey?: string;
  /** Origens aceitas no claim `azp` — bloqueia token de outra aplicação. */
  readonly authorizedParties: readonly string[];
  /** Segredo do endpoint de webhook (`whsec_…`). */
  readonly webhookSigningSecret?: string;
  /**
   * A aplicação **Console** não usa Organizations: o staff entra sem
   * organização ativa. Nas demais (admin, seller center), organização é
   * obrigatória — sem ela não há tenant.
   */
  readonly requireOrganization?: boolean;
}

interface SessionClaims {
  sub?: string;
  org_id?: string;
  org_kind?: OrganizationKind;
  org_role?: string;
  org_permissions?: string[];
  tenant_id?: string;
  seller_id?: string;
}

/**
 * Adapter da Clerk para identidade de painel (ADR-013).
 *
 * **Este é o único pacote que pode importar `@clerk/backend`** — fora dele,
 * só os apps Next.js (CLAUDE.md §4.15), e o lint garante isso.
 *
 * As claims `org_kind`, `tenant_id` e `seller_id` vêm do template de sessão
 * configurado na Clerk, a partir do `publicMetadata` da organização. Elas
 * servem de atalho: quem decide o tenant de verdade é o `org_links` no nosso
 * banco (ver `toPanelSession` no módulo identity).
 */
export class ClerkWorkforceIdentity implements WorkforceIdentityPort {
  private readonly client: ClerkClient;

  constructor(private readonly options: ClerkAdapterOptions) {
    this.client = createClerkClient({ secretKey: options.secretKey });
  }

  async verifyToken(token: string): Promise<VerifiedPanelToken> {
    const claims = (await verifyToken(token, {
      secretKey: this.options.secretKey,
      ...(this.options.jwtKey === undefined ? {} : { jwtKey: this.options.jwtKey }),
      authorizedParties: [...this.options.authorizedParties],
    })) as SessionClaims;

    if (claims.sub === undefined) throw new Error('Token sem usuário');
    if (this.options.requireOrganization !== false && claims.org_id === undefined) {
      throw new Error('Token sem organização ativa');
    }

    return {
      userId: claims.sub,
      organizationId: claims.org_id ?? 'console',
      organizationKind: claims.org_kind ?? 'tenant',
      ...(claims.tenant_id === undefined ? {} : { tenantId: claims.tenant_id }),
      ...(claims.seller_id === undefined ? {} : { sellerId: claims.seller_id }),
      roles: claims.org_role === undefined ? [] : [claims.org_role],
      permissions: claims.org_permissions ?? [],
    };
  }

  async createOrganization(input: {
    name: string;
    kind: OrganizationKind;
    tenantId: string;
    sellerId?: string;
    /** Slug estável — deixa a organização localizável sem guardar o id. */
    slug?: string;
    /** Dono inicial; sem ele a organização nasce sem nenhum membro. */
    createdBy?: string;
  }): Promise<{ organizationId: string }> {
    const organization = await this.client.organizations.createOrganization({
      name: input.name,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.createdBy === undefined ? {} : { createdBy: input.createdBy }),
      publicMetadata: {
        kind: input.kind,
        tenantId: input.tenantId,
        ...(input.sellerId === undefined ? {} : { sellerId: input.sellerId }),
      },
    });

    return { organizationId: organization.id };
  }

  /** Busca por slug; `undefined` quando não existe (usado para ser idempotente). */
  async findOrganizationBySlug(slug: string): Promise<{ organizationId: string; name: string } | undefined> {
    const { data } = await this.client.organizations.getOrganizationList({ query: slug, limit: 100 });
    const organization = data.find((candidate) => candidate.slug === slug);

    return organization === undefined
      ? undefined
      : { organizationId: organization.id, name: organization.name };
  }

  /** Garante que o usuário é membro da organização; já sendo, não faz nada. */
  async ensureMembership(input: {
    organizationId: string;
    userId: string;
    role?: string;
  }): Promise<'created' | 'already_member'> {
    const { data } = await this.client.organizations.getOrganizationMembershipList({
      organizationId: input.organizationId,
      limit: 100,
    });

    if (data.some((membership) => membership.publicUserData?.userId === input.userId)) {
      return 'already_member';
    }

    await this.client.organizations.createOrganizationMembership({
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role ?? 'org:admin',
    });

    return 'created';
  }

  /**
   * Usuário da instância: o do e-mail informado ou, sem e-mail, o primeiro
   * cadastrado (em desenvolvimento, quem criou a conta).
   */
  async findUser(email?: string): Promise<{ userId: string; email?: string } | undefined> {
    const { data } = await this.client.users.getUserList(
      email === undefined ? { limit: 1, orderBy: '+created_at' } : { emailAddress: [email], limit: 1 },
    );

    const user = data[0];
    if (user === undefined) return undefined;

    const primeiro = user.emailAddresses[0]?.emailAddress;
    return { userId: user.id, ...(primeiro === undefined ? {} : { email: primeiro }) };
  }

  /**
   * Convite para a aplicação inteira (não para uma organização): é o caminho
   * de entrada do staff no Console, onde o cadastro é restrito a convite.
   */
  async inviteToApplication(email: string, redirectUrl?: string): Promise<void> {
    await this.client.invitations.createInvitation({
      emailAddress: email,
      ...(redirectUrl === undefined ? {} : { redirectUrl }),
      ignoreExisting: true,
    });
  }

  async updateOrganizationMetadata(
    organizationId: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.client.organizations.updateOrganizationMetadata(organizationId, {
      publicMetadata: metadata,
    });
  }

  async inviteMember(input: { organizationId: string; email: string; role: string }): Promise<void> {
    await this.client.organizations.createOrganizationInvitation({
      organizationId: input.organizationId,
      emailAddress: input.email,
      role: input.role,
    });
  }

  async listMemberships(userId: string): Promise<{ organizationId: string; role: string }[]> {
    const { data } = await this.client.users.getOrganizationMembershipList({ userId });

    return data.map((membership) => ({
      organizationId: membership.organization.id,
      role: membership.role,
    }));
  }

  /**
   * Valida a assinatura (svix) **antes** de olhar o conteúdo. Sem o segredo
   * configurado, recusa: aceitar webhook não assinado seria deixar qualquer um
   * remapear organizações.
   */
  async parseWebhook(
    headers: Readonly<Record<string, string>>,
    body: string,
  ): Promise<{ type: string; data: Record<string, unknown> }> {
    if (this.options.webhookSigningSecret === undefined) {
      throw new Error('CLERK_WEBHOOK_SIGNING_SECRET não configurado');
    }

    const event = new Webhook(this.options.webhookSigningSecret).verify(body, {
      'svix-id': headers['svix-id'] ?? '',
      'svix-timestamp': headers['svix-timestamp'] ?? '',
      'svix-signature': headers['svix-signature'] ?? '',
    }) as { type: string; data: Record<string, unknown> };

    return event;
  }
}

export type { ClerkClient };
