import { describe, expect, it, vi } from 'vitest';

import { DEVELOPMENT_TENANTS, InMemoryTenantDirectory } from '../src/tenancy/in-memory-tenant-directory.js';
import {
  assertSameTenant,
  normalizeHost,
  resolveTenantByHost,
  resolveTenantById,
} from '../src/tenancy/resolve-tenant.js';
import {
  currentTenant,
  requireTenant,
  runWithTenant,
  runWithoutTenant,
  type TenantContext,
} from '../src/tenancy/tenant-context.js';
import {
  resolveClientIp,
  resolveRequestHost,
  TenantContextMiddleware,
  type HostCarrier,
} from '../src/tenancy/tenant-context.middleware.js';
import type { TenantRecord } from '../src/tenancy/tenant-directory.port.js';
import {
  TenantContextMissingError,
  TenantMismatchError,
  TenantNotFoundError,
  TenantSuspendedError,
} from '../src/tenancy/tenant-errors.js';

const [lojaA, lojaB] = DEVELOPMENT_TENANTS as [TenantRecord, TenantRecord];

const suspenso: TenantRecord = {
  tenantId: '0193a000-0000-7000-8000-00000000000c',
  slug: 'loja-c',
  status: 'suspended',
  cell: 'shared-1',
  hosts: ['loja-c.localhost'],
};

const outraCelula: TenantRecord = {
  tenantId: '0193a000-0000-7000-8000-00000000000d',
  slug: 'loja-d',
  status: 'active',
  cell: 'enterprise-7',
  hosts: ['loja-d.localhost'],
};

const provisionando: TenantRecord = {
  tenantId: '0193a000-0000-7000-8000-00000000000e',
  slug: 'loja-e',
  status: 'provisioning',
  cell: 'shared-1',
  hosts: ['loja-e.localhost'],
};

const directory = new InMemoryTenantDirectory([...DEVELOPMENT_TENANTS, suspenso, outraCelula, provisionando]);

const request = (headers: Record<string, string | string[] | undefined>): HostCarrier => ({ headers });

describe('TenantContext', () => {
  const contexto: TenantContext = {
    tenantId: lojaA.tenantId,
    slug: 'loja-a',
    status: 'active',
    cell: 'shared-1',
  };

  it('fica disponível dentro do escopo e some fora dele', () => {
    expect(currentTenant()).toBeUndefined();

    runWithTenant(contexto, () => {
      expect(requireTenant().tenantId).toBe(lojaA.tenantId);
      expect(currentTenant()?.slug).toBe('loja-a');
    });

    expect(currentTenant()).toBeUndefined();
  });

  it('não vaza entre execuções concorrentes', async () => {
    const leituras: string[] = [];
    const tarefa = (record: TenantRecord, atraso: number) =>
      new Promise<void>((resolve) => {
        runWithTenant(
          { tenantId: record.tenantId, slug: record.slug, status: 'active', cell: 'shared-1' },
          () => {
            setTimeout(() => {
              leituras.push(requireTenant().slug);
              resolve();
            }, atraso);
          },
        );
      });

    await Promise.all([tarefa(lojaA, 10), tarefa(lojaB, 1)]);

    expect(leituras.sort()).toEqual(['loja-a', 'loja-b']);
  });

  it('requireTenant falha fora de contexto — nada roda "sem tenant" por acidente', () => {
    expect(() => requireTenant()).toThrow(TenantContextMissingError);

    runWithTenant(contexto, () => {
      runWithoutTenant(() => {
        expect(currentTenant()).toBeUndefined();
      });
      expect(currentTenant()?.slug).toBe('loja-a');
    });
  });
});

describe('resolução por host', () => {
  it('normaliza host com porta e caixa alta', () => {
    expect(normalizeHost('Loja-A.localhost:3000')).toBe('loja-a.localhost');
    expect(normalizeHost('  LOJA-B.LOCALHOST ')).toBe('loja-b.localhost');
  });

  it('resolve loja-a e loja-b para tenants diferentes', async () => {
    const a = await resolveTenantByHost('loja-a.localhost:3000', { directory });
    const b = await resolveTenantByHost('loja-b.localhost', { directory });

    expect(a.tenantId).toBe(lojaA.tenantId);
    expect(b.tenantId).toBe(lojaB.tenantId);
    expect(a.tenantId).not.toBe(b.tenantId);
  });

  it('host desconhecido responde 404 sem revelar nada', async () => {
    await expect(resolveTenantByHost('nao-existe.localhost', { directory })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );

    const erro = await resolveTenantByHost('nao-existe.localhost', { directory }).catch((e) => e);
    expect(erro.httpStatus).toBe(404);
    expect(erro.message).not.toContain('tenant');
  });

  it('tenant suspenso responde 403 tenant_suspended', async () => {
    const erro = await resolveTenantByHost('loja-c.localhost', { directory }).catch((e) => e);

    expect(erro).toBeInstanceOf(TenantSuspendedError);
    expect(erro.code).toBe('tenant_suspended');
    expect(erro.httpStatus).toBe(403);
  });

  it('tenant ainda provisionando não atende', async () => {
    await expect(resolveTenantByHost('loja-e.localhost', { directory })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it('tenant de outra célula não existe para este processo', async () => {
    await expect(resolveTenantByHost('loja-d.localhost', { directory })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
    await expect(
      resolveTenantByHost('loja-d.localhost', { directory, cell: 'enterprise-7' }),
    ).resolves.toMatchObject({ slug: 'loja-d' });
  });

  it('resolve por id (organização da Clerk, jobs) com as mesmas regras', async () => {
    await expect(resolveTenantById(lojaA.tenantId, { directory })).resolves.toMatchObject({
      slug: 'loja-a',
    });
    await expect(resolveTenantById('inexistente', { directory })).rejects.toBeInstanceOf(TenantNotFoundError);
    await expect(resolveTenantById(suspenso.tenantId, { directory })).rejects.toBeInstanceOf(
      TenantSuspendedError,
    );
  });

  it('credencial de outro tenant é 403 tenant_mismatch', () => {
    const contexto: TenantContext = {
      tenantId: lojaA.tenantId,
      slug: 'loja-a',
      status: 'active',
      cell: 'shared-1',
    };

    expect(() => assertSameTenant(contexto, lojaA.tenantId)).not.toThrow();
    expect(() => assertSameTenant(contexto, lojaB.tenantId)).toThrow(TenantMismatchError);
  });
});

describe('host efetivo da requisição', () => {
  const config = { cell: 'shared-1', edgeSharedSecret: 'segredo-do-edge' };

  it('usa o Host quando não há forwarded', () => {
    expect(resolveRequestHost(request({ host: 'loja-a.localhost' }), config)).toBe('loja-a.localhost');
  });

  it('aceita X-Forwarded-Host com o segredo do edge', () => {
    const host = resolveRequestHost(
      request({
        host: 'edge-origin.plataforma',
        'x-forwarded-host': 'loja-x.com.br',
        'x-edge-secret': 'segredo-do-edge',
      }),
      config,
    );

    expect(host).toBe('loja-x.com.br');
  });

  it('ignora X-Forwarded-Host sem o segredo correto', () => {
    for (const headers of [
      { host: 'loja-a.localhost', 'x-forwarded-host': 'loja-b.localhost' },
      { host: 'loja-a.localhost', 'x-forwarded-host': 'loja-b.localhost', 'x-edge-secret': 'errado' },
    ]) {
      expect(resolveRequestHost(request(headers), config)).toBe('loja-a.localhost');
    }
  });

  it('ignora forwarded quando o processo não tem segredo configurado', () => {
    const host = resolveRequestHost(
      request({ host: 'loja-a.localhost', 'x-forwarded-host': 'loja-b.localhost', 'x-edge-secret': '' }),
      { cell: 'shared-1' },
    );

    expect(host).toBe('loja-a.localhost');
  });

  it('lida com header repetido e ausência de host', () => {
    expect(resolveRequestHost(request({ host: ['loja-a.localhost', 'outro'] }), config)).toBe(
      'loja-a.localhost',
    );
    expect(resolveRequestHost(request({}), config)).toBe('');
  });
});

describe('TenantContextMiddleware', () => {
  const config = { cell: 'shared-1', edgeSharedSecret: 'segredo-do-edge' };
  const middleware = new TenantContextMiddleware(directory, config);

  it('abre o contexto do tenant do host', async () => {
    let visto: string | undefined;
    await middleware.use(request({ host: 'loja-b.localhost:3000' }), undefined, () => {
      visto = requireTenant().slug;
    });

    expect(visto).toBe('loja-b');
  });

  it('ignora tenantId enviado pelo cliente (CLAUDE.md §4.11)', async () => {
    let visto: string | undefined;
    await middleware.use(
      request({ host: 'loja-a.localhost', 'x-tenant-id': lojaB.tenantId, 'x-tenant-slug': 'loja-b' }),
      undefined,
      () => {
        visto = requireTenant().tenantId;
      },
    );

    expect(visto).toBe(lojaA.tenantId);
  });

  it('encaminha o erro para o filtro de exceções, sem abrir contexto', async () => {
    const next = vi.fn();
    await middleware.use(request({ host: 'desconhecido.localhost' }), undefined, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(TenantNotFoundError);
    expect(currentTenant()).toBeUndefined();
  });
});

describe('InMemoryTenantDirectory', () => {
  it('permite adicionar tenants em tempo de execução', async () => {
    const vazio = new InMemoryTenantDirectory();
    expect(await vazio.findByHost('loja-a.localhost')).toBeUndefined();

    vazio.upsert(lojaA);
    expect((await vazio.findByHost('LOJA-A.localhost:3000'))?.slug).toBe('loja-a');
    expect((await vazio.findById(lojaA.tenantId))?.slug).toBe('loja-a');
  });
});

describe('IP do cliente (consentimento LGPD)', () => {
  const config = { edgeSharedSecret: 'segredo-do-edge' };

  it('usa o X-Forwarded-For só com o segredo do edge', () => {
    const comSegredo = {
      headers: { 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'x-edge-secret': 'segredo-do-edge' },
      ip: '10.0.0.9',
    };
    const semSegredo = { headers: { 'x-forwarded-for': '200.1.2.3' }, ip: '10.0.0.9' };

    expect(resolveClientIp(comSegredo, config)).toBe('200.1.2.3');
    expect(resolveClientIp(semSegredo, config)).toBe('10.0.0.9');
  });

  it('IPv4 mapeado em IPv6 vira IPv4', () => {
    expect(resolveClientIp({ headers: {}, ip: '::ffff:127.0.0.1' }, {})).toBe('127.0.0.1');
  });
});
