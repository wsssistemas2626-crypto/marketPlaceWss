import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PANEL_PERMISSIONS, PANEL_ROLES, type VerifiedPanelToken } from '@mkt/contracts';
import { DEVELOPMENT_TENANTS } from '@mkt/platform';

import {
  assertPermission,
  MfaRequiredError,
  MissingPermissionError,
  toPanelSession,
  type OrgLink,
  type PanelSession,
} from '../src/application/panel-session.js';
import { ConsoleAuth, ConsoleAuthGuard, type ConsoleSession } from '../src/http/console-auth.js';
import { PanelAuth, PanelAuthGuard, Requires } from '../src/http/panel-auth.guard.js';

const [lojaA] = DEVELOPMENT_TENANTS as [(typeof DEVELOPMENT_TENANTS)[number]];

const vinculoTenant: OrgLink = {
  clerkOrgId: 'org_tenant',
  kind: 'tenant',
  tenantId: lojaA.tenantId,
  status: 'active',
};

const tokenTenant = (claims: Partial<VerifiedPanelToken>): VerifiedPanelToken => ({
  userId: 'user_1',
  organizationId: 'org_tenant',
  organizationKind: 'tenant',
  roles: ['org:tenant_support'],
  permissions: ['org:orders:read'],
  ...claims,
});

describe('catálogo de papéis (ADR-013 / RF-IAM-07)', () => {
  it('tem os 8 papéis da tabela do ADR-013, 4 por tipo de organização', () => {
    expect(PANEL_ROLES.filter((role) => role.kind === 'tenant').map((role) => role.key)).toEqual([
      'org:tenant_admin',
      'org:tenant_moderation',
      'org:tenant_support',
      'org:tenant_finance',
    ]);
    expect(PANEL_ROLES.filter((role) => role.kind === 'seller').map((role) => role.key)).toEqual([
      'org:seller_owner',
      'org:seller_catalog',
      'org:seller_orders',
      'org:seller_finance',
    ]);
  });

  it('toda permissão usada por um papel existe no catálogo ou é de sistema da Clerk', () => {
    const conhecidas = new Set(PANEL_PERMISSIONS.map((permission) => permission.key));

    for (const role of PANEL_ROLES) {
      for (const permission of role.permissions) {
        expect(
          conhecidas.has(permission) || permission.startsWith('org:sys_'),
          `${role.key}: ${permission}`,
        ).toBe(true);
      }
    }
  });

  it('chaves no formato que a Clerk aceita', () => {
    PANEL_PERMISSIONS.forEach((permission) => expect(permission.key).toMatch(/^org:[a-z0-9_]+:[a-z0-9_]+$/));
    PANEL_ROLES.forEach((role) => expect(role.key).toMatch(/^org:[a-z0-9_]+$/));
  });

  it('RF-IAM-14: exigem MFA exatamente tenant_admin, tenant_finance e seller_owner', () => {
    expect(PANEL_ROLES.filter((role) => role.requiresMfa).map((role) => role.key)).toEqual([
      'org:tenant_admin',
      'org:tenant_finance',
      'org:seller_owner',
    ]);
  });
});

describe('papel fora do tipo da organização não abre nada', () => {
  it('papel de seller numa organização de tenant é descartado com as permissões', () => {
    // org:seller_finance tem org:finance:read — no admin isso abriria o financeiro do marketplace
    const sessao = toPanelSession(
      tokenTenant({ roles: ['org:seller_finance'], permissions: ['org:finance:read'] }),
      vinculoTenant,
    );

    expect(sessao.roles).toEqual([]);
    expect(sessao.permissions).toEqual([]);
    expect(() => assertPermission(sessao, 'org:finance:read')).toThrow(MissingPermissionError);
  });

  it('papel desconhecido (criado à mão no dashboard) também não vale', () => {
    const sessao = toPanelSession(
      tokenTenant({ roles: ['org:member'], permissions: ['org:settings:manage'] }),
      vinculoTenant,
    );

    expect(() => assertPermission(sessao, 'org:settings:manage')).toThrow(MissingPermissionError);
  });

  it('papel do tipo certo mantém as permissões', () => {
    const sessao = toPanelSession(tokenTenant({}), vinculoTenant);

    expect(sessao.roles).toEqual(['org:tenant_support']);
    expect(() => assertPermission(sessao, 'org:orders:read')).not.toThrow();
  });

  it('org:admin vale nas duas organizações', () => {
    const sessao = toPanelSession(tokenTenant({ roles: ['org:admin'], permissions: [] }), vinculoTenant);

    expect(() => assertPermission(sessao, 'org:settings:manage')).not.toThrow();
  });
});

describe('MFA obrigatório nos papéis sensíveis (RF-IAM-14)', () => {
  class RotaDoAdmin {
    ver(): string {
      return 'ok';
    }
  }
  PanelAuth('tenant')(RotaDoAdmin);
  Requires('org:orders:read')(RotaDoAdmin);

  const contextoCom = (session: PanelSession): ExecutionContext =>
    ({
      getHandler: () => RotaDoAdmin.prototype.ver,
      getClass: () => RotaDoAdmin,
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, panelSession: session }) }),
    }) as unknown as ExecutionContext;

  const sessao = (roles: string[], secondFactorVerified: boolean): PanelSession => ({
    userId: 'user_1',
    organizationId: 'org_tenant',
    kind: 'tenant',
    tenantId: lojaA.tenantId,
    roles,
    permissions: ['org:orders:read'],
    secondFactorVerified,
  });

  const comMfa = new PanelAuthGuard(new Reflector(), { mfaEnforced: true });

  it.each(['org:tenant_admin', 'org:tenant_finance', 'org:admin'])(
    '%s sem segundo fator é 403 mfa_required',
    (role) => {
      const erro = (() => {
        try {
          comMfa.canActivate(contextoCom(sessao([role], false)));
          return undefined;
        } catch (error) {
          return error;
        }
      })();

      expect(erro).toBeInstanceOf(MfaRequiredError);
      expect((erro as MfaRequiredError).code).toBe('mfa_required');
    },
  );

  it('papel sensível com segundo fator passa', () => {
    expect(comMfa.canActivate(contextoCom(sessao(['org:tenant_finance'], true)))).toBe(true);
  });

  it('papel sem exigência de MFA passa sem segundo fator', () => {
    expect(comMfa.canActivate(contextoCom(sessao(['org:tenant_support'], false)))).toBe(true);
  });

  it('com a política desligada (desenvolvimento sem MFA na Clerk) não exige', () => {
    const semMfa = new PanelAuthGuard(new Reflector(), { mfaEnforced: false });

    expect(semMfa.canActivate(contextoCom(sessao(['org:tenant_admin'], false)))).toBe(true);
  });

  it('o token sem informação de segundo fator conta como não verificado', () => {
    const semFva = toPanelSession(tokenTenant({ roles: ['org:tenant_admin'] }), vinculoTenant);

    expect(semFva.secondFactorVerified).toBe(false);
  });
});

describe('console: todo staff precisa de segundo fator (RF-IAM-14)', () => {
  class RotaDoConsole {
    listar(): string {
      return 'ok';
    }
  }
  ConsoleAuth()(RotaDoConsole);

  const contextoCom = (session: ConsoleSession): ExecutionContext =>
    ({
      getHandler: () => RotaDoConsole.prototype.listar,
      getClass: () => RotaDoConsole,
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, consoleSession: session }) }),
    }) as unknown as ExecutionContext;

  const guard = new ConsoleAuthGuard(new Reflector(), { mfaEnforced: true });

  it('staff sem segundo fator é recusado', () => {
    expect(() => guard.canActivate(contextoCom({ userId: 'staff', secondFactorVerified: false }))).toThrow(
      MfaRequiredError,
    );
  });

  it('staff com segundo fator entra', () => {
    expect(guard.canActivate(contextoCom({ userId: 'staff', secondFactorVerified: true }))).toBe(true);
  });
});
