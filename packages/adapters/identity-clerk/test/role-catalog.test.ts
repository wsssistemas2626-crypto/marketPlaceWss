import { describe, expect, it } from 'vitest';

import type { PanelPermission, PanelRole } from '@mkt/contracts';

import { ClerkRoleCatalog } from '../src/role-catalog.js';

/**
 * Uma Backend API da Clerk em memória, só com o que o sincronizador usa.
 * Registra as chamadas de escrita para o teste provar idempotência.
 */
class ClerkEmMemoria {
  private seq = 0;
  readonly writes: string[] = [];
  readonly permissions = new Map<string, { id: string; key: string; name: string; description: string }>();
  readonly roles = new Map<
    string,
    { id: string; key: string; name: string; description: string; perms: Set<string> }
  >();
  readonly initialRoleSet = new Set(['org:admin', 'org:member']);

  constructor() {
    for (const key of ['org:sys_memberships:read', 'org:sys_memberships:manage', 'org:sys_profile:manage']) {
      this.permissions.set(key, { id: this.id('perm'), key, name: key, description: 'sistema' });
    }
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  private permissionById(id: string) {
    return [...this.permissions.values()].find((permission) => permission.id === id);
  }

  readonly fetch = async (url: string, init: { method: string; body?: string }) => {
    const path = url.replace('https://api.clerk.com/v1/', '').split('?')[0] ?? '';
    const body = (init.body === undefined ? {} : JSON.parse(init.body)) as Record<string, unknown>;
    const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });

    if (init.method !== 'GET') this.writes.push(`${init.method} ${path}`);

    if (init.method === 'GET' && path === 'organization_permissions') {
      const data = [...this.permissions.values()];
      return ok({ data, total_count: data.length });
    }
    if (init.method === 'GET' && path === 'organization_roles') {
      const data = [...this.roles.values()].map((role) => ({
        ...role,
        permissions: [...role.perms].map((id) => this.permissionById(id)),
      }));
      return ok({ data, total_count: data.length });
    }
    if (init.method === 'GET' && path === 'role_sets') {
      return ok({
        data: [
          {
            key: 'role_set:default',
            type: 'initial',
            roles: [...this.initialRoleSet].map((key) => ({ key })),
          },
        ],
        total_count: 1,
      });
    }
    if (init.method === 'POST' && path === 'organization_permissions') {
      const created = {
        id: this.id('perm'),
        key: String(body.key),
        name: String(body.name),
        description: String(body.description),
      };
      this.permissions.set(created.key, created);
      return ok(created);
    }
    if (init.method === 'POST' && path === 'organization_roles') {
      const created = {
        id: this.id('role'),
        key: String(body.key),
        name: String(body.name),
        description: String(body.description),
        perms: new Set(body.permissions as string[]),
      };
      this.roles.set(created.key, created);
      if (body.include_in_initial_role_set === true) this.initialRoleSet.add(created.key);
      return ok(created);
    }

    const assign = /^organization_roles\/([^/]+)\/permissions\/([^/]+)$/.exec(path);
    if (assign !== null) {
      const role = [...this.roles.values()].find((candidate) => candidate.id === assign[1]);
      if (init.method === 'POST') role?.perms.add(assign[2] ?? '');
      if (init.method === 'DELETE') role?.perms.delete(assign[2] ?? '');
      return ok({});
    }

    const roleSetRoles = /^role_sets\/([^/]+)\/roles$/.exec(path);
    if (roleSetRoles !== null && init.method === 'POST') {
      (body.role_keys as string[]).forEach((key) => this.initialRoleSet.add(key));
      return ok({});
    }

    if (init.method === 'PATCH') return ok({});

    return {
      ok: false,
      status: 404,
      json: async () => ({ errors: [{ message: 'not found', long_message: `sem rota para ${path}` }] }),
    };
  };
}

const permissoes: PanelPermission[] = [
  { key: 'org:orders:read', name: 'Ver pedidos', description: 'Consultar pedidos.' },
  { key: 'org:finance:read', name: 'Ver financeiro', description: 'Extratos.' },
];

const papeis: PanelRole[] = [
  {
    key: 'org:tenant_support',
    kind: 'tenant',
    name: 'Atendimento',
    description: 'Pedidos.',
    permissions: ['org:orders:read', 'org:sys_memberships:read'],
    requiresMfa: false,
  },
];

const catalogoCom = (clerk: ClerkEmMemoria) =>
  new ClerkRoleCatalog({ secretKey: 'sk_test_offline', fetch: clerk.fetch });

describe('ClerkRoleCatalog — papéis e permissões como código (US-013)', () => {
  it('cria permissões e papéis que faltam, já no role set inicial', async () => {
    const clerk = new ClerkEmMemoria();

    const relatorio = await catalogoCom(clerk).sync({ permissions: permissoes, roles: papeis });

    expect(relatorio.permissionsCreated).toEqual(['org:orders:read', 'org:finance:read']);
    expect(relatorio.rolesCreated).toEqual(['org:tenant_support']);
    expect(clerk.initialRoleSet.has('org:tenant_support')).toBe(true);
    const papel = clerk.roles.get('org:tenant_support');
    expect(papel?.perms.size).toBe(2);
  });

  it('é idempotente: a segunda execução não escreve nada', async () => {
    const clerk = new ClerkEmMemoria();
    await catalogoCom(clerk).sync({ permissions: permissoes, roles: papeis });
    clerk.writes.length = 0;

    const relatorio = await catalogoCom(clerk).sync({ permissions: permissoes, roles: papeis });

    expect(clerk.writes).toEqual([]);
    expect(Object.values(relatorio).every((itens) => itens.length === 0)).toBe(true);
  });

  it('converge: concede o que falta e retira o que sobrou num papel existente', async () => {
    const clerk = new ClerkEmMemoria();
    await catalogoCom(clerk).sync({ permissions: permissoes, roles: papeis });

    // alguém deu org:finance:read ao atendimento pelo dashboard
    const financeiro = clerk.permissions.get('org:finance:read');
    clerk.roles.get('org:tenant_support')?.perms.add(financeiro?.id ?? '');

    const comNova: PanelRole[] = [
      { ...papeis[0]!, permissions: [...papeis[0]!.permissions, 'org:sys_profile:manage'] },
    ];
    const relatorio = await catalogoCom(clerk).sync({ permissions: permissoes, roles: comNova });

    expect(relatorio.grants).toEqual(['org:tenant_support ← org:sys_profile:manage']);
    expect(relatorio.revocations).toEqual(['org:tenant_support ✕ org:finance:read']);
  });

  it('papel existente fora do role set inicial é incluído', async () => {
    const clerk = new ClerkEmMemoria();
    await catalogoCom(clerk).sync({ permissions: permissoes, roles: papeis });
    clerk.initialRoleSet.delete('org:tenant_support');

    const relatorio = await catalogoCom(clerk).sync({ permissions: permissoes, roles: papeis });

    expect(relatorio.addedToRoleSet).toEqual(['org:tenant_support']);
  });

  it('permissão referenciada que não existe na instância falha antes de criar o papel', async () => {
    const clerk = new ClerkEmMemoria();
    const quebrado: PanelRole[] = [{ ...papeis[0]!, permissions: ['org:sys_inexistente:read'] }];

    await expect(catalogoCom(clerk).sync({ permissions: [], roles: quebrado })).rejects.toThrow(
      /org:sys_inexistente:read não existe/,
    );
    expect(clerk.roles.size).toBe(0);
  });

  it('erro da Clerk vira mensagem com o recurso e o motivo, sem a chave secreta', async () => {
    const falha = async () => ({
      ok: false,
      status: 402,
      json: async () => ({ errors: [{ long_message: 'Custom roles require a paid plan' }] }),
    });
    const catalogo = new ClerkRoleCatalog({ secretKey: 'sk_test_segredo', fetch: falha });

    const erro = await catalogo
      .sync({ permissions: permissoes, roles: papeis })
      .catch((error: Error) => error);

    expect(String(erro)).toContain(
      'GET /organization_permissions respondeu 402: Custom roles require a paid plan',
    );
    expect(String(erro)).not.toContain('sk_test_segredo');
  });
});
