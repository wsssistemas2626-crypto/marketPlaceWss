import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { VerifiedPanelToken, WorkforceIdentityPort } from '@mkt/contracts';
import { FakeWorkforceIdentity } from '@mkt/adapters-fakes';
import {
  currentTenant,
  DEVELOPMENT_TENANTS,
  InMemoryTenantDirectory,
  TenantNotFoundError,
} from '@mkt/platform';

import {
  InvalidPanelTokenError,
  MissingPermissionError,
  OrganizationNotLinkedError,
  toPanelSession,
  WrongOrganizationKindError,
  type OrgLink,
  type OrgLinkRepositoryPort,
} from '../src/application/panel-session.js';
import { SyncClerkWebhook } from '../src/application/sync-clerk-webhook.js';
import { PanelAuth, PanelAuthGuard, Requires } from '../src/http/panel-auth.guard.js';
import { PanelAuthMiddleware, type PanelRequest } from '../src/http/panel-auth.middleware.js';

const [lojaA, lojaB] = DEVELOPMENT_TENANTS as [
  (typeof DEVELOPMENT_TENANTS)[number],
  (typeof DEVELOPMENT_TENANTS)[number],
];
const SELLER = '0193a000-0000-7000-8000-000000000501';

const vinculoSeller: OrgLink = {
  clerkOrgId: 'org_seller',
  kind: 'seller',
  tenantId: lojaA.tenantId,
  sellerId: SELLER,
  status: 'active',
};

const vinculoTenant: OrgLink = {
  clerkOrgId: 'org_tenant',
  kind: 'tenant',
  tenantId: lojaA.tenantId,
  status: 'active',
};

class RepositorioEmMemoria implements OrgLinkRepositoryPort {
  readonly links = new Map<string, OrgLink>();
  readonly users: { clerkUserId: string; email: string; name?: string }[] = [];

  constructor(links: readonly OrgLink[] = []) {
    links.forEach((link) => this.links.set(link.clerkOrgId, link));
  }

  async findByOrgId(clerkOrgId: string): Promise<OrgLink | undefined> {
    return this.links.get(clerkOrgId);
  }

  async upsert(link: OrgLink): Promise<void> {
    this.links.set(link.clerkOrgId, link);
  }

  async upsertUser(user: { clerkUserId: string; email: string; name?: string }): Promise<void> {
    this.users.push(user);
  }
}

const tokenDe = (claims: Partial<VerifiedPanelToken>): VerifiedPanelToken => ({
  userId: 'user_1',
  organizationId: 'org_seller',
  organizationKind: 'seller',
  tenantId: lojaA.tenantId,
  sellerId: SELLER,
  roles: ['org:seller_owner'],
  permissions: ['org:orders:manage'],
  ...claims,
});

describe('toPanelSession — a claim não decide o tenant (ADR-013)', () => {
  it('monta a sessão a partir do vínculo no banco', () => {
    const sessao = toPanelSession(tokenDe({}), vinculoSeller);

    expect(sessao).toMatchObject({ tenantId: lojaA.tenantId, sellerId: SELLER, kind: 'seller' });
  });

  it('recusa organização sem vínculo ou suspensa', () => {
    expect(() => toPanelSession(tokenDe({}), undefined)).toThrow(OrganizationNotLinkedError);
    expect(() => toPanelSession(tokenDe({}), { ...vinculoSeller, status: 'suspended' })).toThrow(
      OrganizationNotLinkedError,
    );
  });

  it('recusa token cuja claim de tenant discorda do vínculo', () => {
    expect(() => toPanelSession(tokenDe({ tenantId: lojaB.tenantId }), vinculoSeller)).toThrow(
      OrganizationNotLinkedError,
    );
  });

  it('recusa token cuja claim de seller discorda do vínculo', () => {
    expect(() => toPanelSession(tokenDe({ sellerId: 'outro-seller' }), vinculoSeller)).toThrow(
      OrganizationNotLinkedError,
    );
  });

  it('recusa quando o tipo da organização não bate com o vínculo', () => {
    expect(() => toPanelSession(tokenDe({ organizationKind: 'tenant' }), vinculoSeller)).toThrow(
      WrongOrganizationKindError,
    );
  });
});

describe('PanelAuthMiddleware', () => {
  const directory = new InMemoryTenantDirectory(DEVELOPMENT_TENANTS);
  const identity = new FakeWorkforceIdentity();

  const middleware = (links: OrgLinkRepositoryPort, port: WorkforceIdentityPort = identity) =>
    new PanelAuthMiddleware(port, links, directory);

  const requisicao = (token?: string): PanelRequest => ({
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

  it('abre o TenantContext do tenant vinculado à organização', async () => {
    const request = requisicao(FakeWorkforceIdentity.issueToken(tokenDe({})));
    let tenantVisto: string | undefined;

    await middleware(new RepositorioEmMemoria([vinculoSeller])).use(request, undefined, () => {
      tenantVisto = currentTenant()?.tenantId;
    });

    expect(tenantVisto).toBe(lojaA.tenantId);
    expect(request.panelSession?.sellerId).toBe(SELLER);
  });

  it('sem Authorization apenas segue: quem exige é o guard', async () => {
    const next = vi.fn();

    await middleware(new RepositorioEmMemoria([vinculoSeller])).use(requisicao(), undefined, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('token inválido vira 401 sem revelar o motivo', async () => {
    const next = vi.fn();

    await middleware(new RepositorioEmMemoria([vinculoSeller])).use(
      requisicao('token-quebrado'),
      undefined,
      next,
    );

    const erro = next.mock.calls[0]?.[0];
    expect(erro).toBeInstanceOf(InvalidPanelTokenError);
    expect(erro.httpStatus).toBe(401);
  });

  it('organização não mapeada vira 403', async () => {
    const next = vi.fn();

    await middleware(new RepositorioEmMemoria()).use(
      requisicao(FakeWorkforceIdentity.issueToken(tokenDe({}))),
      undefined,
      next,
    );

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(OrganizationNotLinkedError);
  });

  it('tenant inexistente no registro não abre contexto', async () => {
    const next = vi.fn();
    const orfao: OrgLink = { ...vinculoTenant, tenantId: '0193a000-0000-7000-8000-0000000009ff' };

    await middleware(new RepositorioEmMemoria([orfao])).use(
      requisicao(
        FakeWorkforceIdentity.issueToken(
          tokenDe({
            organizationId: 'org_tenant',
            organizationKind: 'tenant',
            tenantId: orfao.tenantId,
            sellerId: undefined,
          }),
        ),
      ),
      undefined,
      next,
    );

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(TenantNotFoundError);
  });
});

describe('PanelAuthGuard', () => {
  const guard = new PanelAuthGuard(new Reflector());

  class RotaDeSeller {
    despachar(): string {
      return 'ok';
    }
  }
  PanelAuth('seller')(RotaDeSeller);
  Requires('org:orders:manage')(RotaDeSeller);

  const contextoCom = (session?: PanelRequest['panelSession']): ExecutionContext =>
    ({
      getHandler: () => RotaDeSeller.prototype.despachar,
      getClass: () => RotaDeSeller,
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, panelSession: session }) }),
    }) as unknown as ExecutionContext;

  const sessaoDe = (extra: Partial<NonNullable<PanelRequest['panelSession']>> = {}) => ({
    userId: 'user_1',
    organizationId: 'org_seller',
    kind: 'seller' as const,
    tenantId: lojaA.tenantId,
    sellerId: SELLER,
    roles: ['org:member'],
    permissions: ['org:orders:manage'],
    ...extra,
  });

  it('deixa passar com tipo e permissão corretos', () => {
    expect(guard.canActivate(contextoCom(sessaoDe()))).toBe(true);
  });

  it('sem sessão é 401', () => {
    expect(() => guard.canActivate(contextoCom(undefined))).toThrow(InvalidPanelTokenError);
  });

  it('organização de tenant em rota de seller é 403 wrong_organization_kind', () => {
    const erro = (() => {
      try {
        guard.canActivate(contextoCom(sessaoDe({ kind: 'tenant' })));
        return undefined;
      } catch (error) {
        return error;
      }
    })();

    expect(erro).toBeInstanceOf(WrongOrganizationKindError);
    expect((erro as WrongOrganizationKindError).code).toBe('wrong_organization_kind');
  });

  it('sem a permissão exigida é 403', () => {
    expect(() => guard.canActivate(contextoCom(sessaoDe({ permissions: ['org:catalog:read'] })))).toThrow(
      MissingPermissionError,
    );
  });

  it('admin da organização passa sem a permissão listada', () => {
    // o token v2 da Clerk só enumera permissões atribuídas explicitamente;
    // trancar o admin para fora do próprio painel seria pior que inútil
    const sessao = sessaoDe({ roles: ['org:admin'], permissions: [] });

    expect(guard.canActivate(contextoCom(sessao))).toBe(true);
  });

  it('rota sem @PanelAuth passa direto', () => {
    class RotaPublica {
      listar(): string {
        return 'ok';
      }
    }

    const contexto = {
      getHandler: () => RotaPublica.prototype.listar,
      getClass: () => RotaPublica,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(contexto)).toBe(true);
  });
});

describe('SyncClerkWebhook — projeção idempotente', () => {
  it('cria o vínculo a partir do publicMetadata da organização', async () => {
    const repositorio = new RepositorioEmMemoria();
    const sync = new SyncClerkWebhook(repositorio);

    const evento = {
      type: 'organization.created',
      data: {
        id: 'org_novo',
        name: 'Loja Nova',
        public_metadata: { kind: 'seller', tenantId: lojaA.tenantId, sellerId: SELLER },
      },
    };

    expect(await sync.execute(evento)).toEqual({ handled: true });
    // reenvio da Clerk não duplica nem corrompe
    expect(await sync.execute(evento)).toEqual({ handled: true });
    expect(repositorio.links.get('org_novo')).toMatchObject({ tenantId: lojaA.tenantId, sellerId: SELLER });
  });

  it('marca como suspensa na exclusão da organização', async () => {
    const repositorio = new RepositorioEmMemoria([vinculoTenant]);

    await new SyncClerkWebhook(repositorio).execute({
      type: 'organization.deleted',
      data: { id: 'org_tenant', public_metadata: { kind: 'tenant', tenantId: lojaA.tenantId } },
    });

    expect(repositorio.links.get('org_tenant')?.status).toBe('suspended');
  });

  it('ignora organização sem kind/tenantId e seller sem sellerId', async () => {
    const sync = new SyncClerkWebhook(new RepositorioEmMemoria());

    expect(
      await sync.execute({ type: 'organization.created', data: { id: 'x', public_metadata: {} } }),
    ).toMatchObject({
      handled: false,
    });
    expect(
      await sync.execute({
        type: 'organization.updated',
        data: { id: 'y', public_metadata: { kind: 'seller', tenantId: lojaA.tenantId } },
      }),
    ).toMatchObject({ handled: false });
  });

  it('espelha o usuário sem trazer dado que não é da Clerk (RNF-LGPD-05)', async () => {
    const repositorio = new RepositorioEmMemoria();

    await new SyncClerkWebhook(repositorio).execute({
      type: 'user.created',
      data: {
        id: 'user_9',
        email_addresses: [{ email_address: 'pessoa@example.com' }],
        first_name: 'Ana',
        last_name: 'Silva',
      },
    });

    expect(repositorio.users[0]).toEqual({
      clerkUserId: 'user_9',
      email: 'pessoa@example.com',
      name: 'Ana Silva',
    });
  });

  it('associação de membro não precisa de projeção', async () => {
    const sync = new SyncClerkWebhook(new RepositorioEmMemoria());

    expect(await sync.execute({ type: 'organizationMembership.created', data: {} })).toEqual({
      handled: true,
    });
    expect(await sync.execute({ type: 'session.created', data: {} })).toMatchObject({ handled: false });
  });
});
