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
  /** Claims v1 (formato antigo do token de sessão). */
  org_id?: string;
  org_role?: string;
  org_permissions?: string[];
  /** Claims v2: a organização ativa vem aninhada e o papel vem sem prefixo. */
  v?: number;
  o?: { id?: string; rol?: string; slg?: string; per?: string; fpm?: string };
  fea?: string;
  /**
   * "Factor verification age": minutos desde o primeiro e o segundo fator da
   * sessão; `-1` no segundo significa que ele não foi verificado.
   */
  fva?: [number, number];
  /** Vêm do template de sessão, quando configurado — atalho, nunca fonte da verdade. */
  org_kind?: OrganizationKind;
  tenant_id?: string;
  seller_id?: string;
}

/** Papel sempre no formato `org:<papel>`, venha ele de v1 (`org:admin`) ou de v2 (`admin`). */
const normalizarPapel = (papel: string): string => (papel.startsWith('org:') ? papel : `org:${papel}`);

/**
 * Permissões do token v2.
 *
 * O formato é compacto para caber no cookie: `fea` lista as funcionalidades
 * (com escopo `o:` para organização), `o.per` lista os verbos e `o.fpm` traz,
 * para cada funcionalidade, um bitmask dizendo quais verbos valem. O resultado
 * é remontado no formato `org:<funcionalidade>:<verbo>`, o mesmo que o
 * `@Requires` usa.
 */
export function expandPermissions(claims: SessionClaims): string[] {
  if (claims.org_permissions !== undefined) return claims.org_permissions;

  const funcionalidades = (claims.fea ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte.startsWith('o:'))
    .map((parte) => parte.slice(2));

  const verbos = (claims.o?.per ?? '')
    .split(',')
    .map((verbo) => verbo.trim())
    .filter((verbo) => verbo !== '');

  const mascaras = (claims.o?.fpm ?? '').split(',').map((mascara) => Number.parseInt(mascara.trim(), 10));

  return funcionalidades.flatMap((funcionalidade, indice) => {
    const mascara = mascaras[indice];
    if (mascara === undefined || Number.isNaN(mascara)) return [];

    return verbos
      .filter((_, posicao) => (mascara & (1 << posicao)) !== 0)
      .map((verbo) => `org:${funcionalidade}:${verbo}`);
  });
}

/**
 * Traduz as claims verificadas para o formato do nosso port.
 *
 * Existe separada do `verifyToken` para ser testável sem rede: é aqui que mora
 * a diferença entre as duas versões de token da Clerk, que já custou um 401 em
 * todo o painel quando a instância passou a emitir v2.
 */
export function panelTokenFromClaims(
  claims: SessionClaims,
  options: { requireOrganization?: boolean } = {},
): VerifiedPanelToken {
  const organizationId = claims.o?.id ?? claims.org_id;
  const papel = claims.o?.rol ?? claims.org_role;

  if (claims.sub === undefined) throw new Error('Token sem usuário');
  if (options.requireOrganization !== false && organizationId === undefined) {
    throw new Error('Token sem organização ativa');
  }

  return {
    userId: claims.sub,
    organizationId: organizationId ?? 'console',
    // sem template de sessão não há `org_kind`: supor "tenant" recusaria toda organização de seller
    ...(claims.org_kind === undefined ? {} : { organizationKind: claims.org_kind }),
    ...(claims.tenant_id === undefined ? {} : { tenantId: claims.tenant_id }),
    ...(claims.seller_id === undefined ? {} : { sellerId: claims.seller_id }),
    roles: papel === undefined ? [] : [normalizarPapel(papel)],
    permissions: expandPermissions(claims),
    secondFactorVerified:
      Array.isArray(claims.fva) && typeof claims.fva[1] === 'number' && claims.fva[1] >= 0,
  };
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

    return panelTokenFromClaims(claims, {
      ...(this.options.requireOrganization === undefined
        ? {}
        : { requireOrganization: this.options.requireOrganization }),
    });
  }

  async createOrganization(input: {
    name: string;
    kind: OrganizationKind;
    tenantId: string;
    sellerId?: string;
    /** Slug — só quando a instância tem slugs habilitados; opcional na Clerk. */
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

  /**
   * Procura a organização de um tenant (ou de um seller) pelos metadados.
   *
   * A busca é pelo `publicMetadata`, não pelo slug: slug é opcional na Clerk e
   * pode estar **desabilitado** na instância (`organization_slugs_disabled`),
   * enquanto `tenantId`/`kind` sempre existem em organização criada por nós.
   */
  async findOrganizationByTenant(criterio: {
    kind: OrganizationKind;
    tenantId: string;
    sellerId?: string;
  }): Promise<{ organizationId: string; name: string } | undefined> {
    const paginas = 5;
    const porPagina = 100;

    for (let pagina = 0; pagina < paginas; pagina += 1) {
      const { data } = await this.client.organizations.getOrganizationList({
        limit: porPagina,
        offset: pagina * porPagina,
      });

      const encontrada = data.find((candidata) => {
        const metadata = candidata.publicMetadata as {
          kind?: string;
          tenantId?: string;
          sellerId?: string;
        };

        return (
          metadata.kind === criterio.kind &&
          metadata.tenantId === criterio.tenantId &&
          metadata.sellerId === criterio.sellerId
        );
      });

      if (encontrada !== undefined) {
        return { organizationId: encontrada.id, name: encontrada.name };
      }

      if (data.length < porPagina) return undefined;
    }

    return undefined;
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

export { ClerkRoleCatalog, type RoleCatalogReport } from './role-catalog.js';
export type { ClerkClient };
