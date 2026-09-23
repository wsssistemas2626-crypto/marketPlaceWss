import type { PanelPermission, PanelRole } from '@mkt/contracts';

/**
 * Sincroniza papéis e permissões dos painéis com a Clerk (US-013 / ADR-013).
 *
 * Por que não o `@clerk/backend`: o SDK ainda não cobre os endpoints de
 * papéis, permissões e role sets da Backend API (lançados em nov/2025), então
 * este arquivo fala REST direto — e só ele, para não espalhar URL da Clerk.
 *
 * **Idempotente e convergente:** cria o que falta, corrige nome/descrição
 * divergentes e deixa cada papel com exatamente as permissões do catálogo.
 * Não apaga papel nem permissão que não estão no catálogo — alguém pode ter
 * criado no dashboard, e apagar papel com membros derrubaria acesso.
 */
export interface RoleCatalogReport {
  readonly permissionsCreated: string[];
  readonly permissionsUpdated: string[];
  readonly rolesCreated: string[];
  readonly rolesUpdated: string[];
  /** `org:papel ← org:permissão` */
  readonly grants: string[];
  /** `org:papel ✕ org:permissão` */
  readonly revocations: string[];
  readonly addedToRoleSet: string[];
}

export interface RoleCatalog {
  readonly permissions: readonly PanelPermission[];
  readonly roles: readonly PanelRole[];
}

interface ClerkPermission {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
}

interface ClerkRole {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly ClerkPermission[];
}

interface ClerkRoleSet {
  readonly key: string;
  readonly type: string;
  readonly roles: readonly { key: string }[];
}

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface ClerkRoleCatalogOptions {
  readonly secretKey: string;
  readonly apiUrl?: string;
  /** Injetável para teste; o padrão é o `fetch` global. */
  readonly fetch?: Fetch;
}

const PAGE = 100;

export class ClerkRoleCatalog {
  private readonly apiUrl: string;
  private readonly fetch: Fetch;

  constructor(private readonly options: ClerkRoleCatalogOptions) {
    this.apiUrl = options.apiUrl ?? 'https://api.clerk.com/v1';
    this.fetch = options.fetch ?? (globalThis.fetch as unknown as Fetch);
  }

  async sync(catalog: RoleCatalog): Promise<RoleCatalogReport> {
    const report: RoleCatalogReport = {
      permissionsCreated: [],
      permissionsUpdated: [],
      rolesCreated: [],
      rolesUpdated: [],
      grants: [],
      revocations: [],
      addedToRoleSet: [],
    };

    const permissions = await this.syncPermissions(catalog.permissions, report);
    await this.syncRoles(catalog.roles, permissions, report);
    await this.ensureInInitialRoleSet(
      catalog.roles.map((role) => role.key),
      report,
    );

    return report;
  }

  private async syncPermissions(
    desired: readonly PanelPermission[],
    report: RoleCatalogReport,
  ): Promise<Map<string, ClerkPermission>> {
    const byKey = new Map(
      (await this.listAll<ClerkPermission>('organization_permissions')).map((p) => [p.key, p]),
    );

    for (const permission of desired) {
      const current = byKey.get(permission.key);

      if (current === undefined) {
        const created = await this.call<ClerkPermission>('POST', 'organization_permissions', {
          key: permission.key,
          name: permission.name,
          description: permission.description,
        });
        byKey.set(created.key, created);
        report.permissionsCreated.push(permission.key);
      } else if (current.name !== permission.name || (current.description ?? '') !== permission.description) {
        await this.call('PATCH', `organization_permissions/${current.id}`, {
          name: permission.name,
          description: permission.description,
        });
        report.permissionsUpdated.push(permission.key);
      }
    }

    return byKey;
  }

  private async syncRoles(
    desired: readonly PanelRole[],
    permissions: ReadonlyMap<string, ClerkPermission>,
    report: RoleCatalogReport,
  ): Promise<void> {
    const byKey = new Map((await this.listAll<ClerkRole>('organization_roles')).map((r) => [r.key, r]));

    const idOf = (key: string): string => {
      const permission = permissions.get(key);
      // permissão de sistema (`org:sys_*`) inexistente = instância sem Organizations
      if (permission === undefined) throw new Error(`Permissão ${key} não existe na instância da Clerk`);
      return permission.id;
    };

    for (const role of desired) {
      const wanted = new Set(role.permissions);
      const current = byKey.get(role.key);

      if (current === undefined) {
        await this.call('POST', 'organization_roles', {
          key: role.key,
          name: role.name,
          description: role.description,
          permissions: role.permissions.map(idOf),
          include_in_initial_role_set: true,
        });
        report.rolesCreated.push(role.key);
        role.permissions.forEach((key) => report.grants.push(`${role.key} ← ${key}`));
        continue;
      }

      if (current.name !== role.name || (current.description ?? '') !== role.description) {
        await this.call('PATCH', `organization_roles/${current.id}`, {
          name: role.name,
          description: role.description,
        });
        report.rolesUpdated.push(role.key);
      }

      const has = new Set(current.permissions.map((permission) => permission.key));

      for (const key of wanted) {
        if (has.has(key)) continue;
        await this.call('POST', `organization_roles/${current.id}/permissions/${idOf(key)}`);
        report.grants.push(`${role.key} ← ${key}`);
      }

      for (const permission of current.permissions) {
        if (wanted.has(permission.key)) continue;
        await this.call('DELETE', `organization_roles/${current.id}/permissions/${permission.id}`);
        report.revocations.push(`${role.key} ✕ ${permission.key}`);
      }
    }
  }

  /**
   * Papel fora de um role set não pode ser atribuído a ninguém. Os papéis vão
   * para o role set inicial (o padrão das organizações novas); o isolamento
   * entre papéis de tenant e de seller é garantido pela API (`isRoleAllowedFor`).
   */
  private async ensureInInitialRoleSet(keys: readonly string[], report: RoleCatalogReport): Promise<void> {
    const sets = await this.listAll<ClerkRoleSet>('role_sets');
    const initial = sets.find((set) => set.type === 'initial');
    if (initial === undefined) throw new Error('A instância da Clerk não tem role set inicial');

    const present = new Set(initial.roles.map((role) => role.key));
    const missing = keys.filter((key) => !present.has(key));

    // a API aceita no máximo 10 papéis por chamada
    for (let start = 0; start < missing.length; start += 10) {
      const batch = missing.slice(start, start + 10);
      await this.call('POST', `role_sets/${initial.key}/roles`, { role_keys: batch });
      report.addedToRoleSet.push(...batch);
    }
  }

  private async listAll<T>(resource: string): Promise<T[]> {
    const items: T[] = [];

    for (let offset = 0; ; offset += PAGE) {
      const page = await this.call<{ data: T[]; total_count: number }>(
        'GET',
        `${resource}?limit=${PAGE}&offset=${offset}`,
      );
      items.push(...page.data);
      if (page.data.length < PAGE || items.length >= page.total_count) return items;
    }
  }

  private async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetch(`${this.apiUrl}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.secretKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const payload = (await response.json().catch(() => ({}))) as T & {
      errors?: { long_message?: string; message?: string }[];
    };

    if (!response.ok) {
      const motivo = payload.errors?.[0]?.long_message ?? payload.errors?.[0]?.message ?? 'sem detalhe';
      // o path diz o que falhou; a chave nunca entra na mensagem
      throw new Error(`Clerk ${method} /${path.split('?')[0]} respondeu ${response.status}: ${motivo}`);
    }

    return payload;
  }
}
