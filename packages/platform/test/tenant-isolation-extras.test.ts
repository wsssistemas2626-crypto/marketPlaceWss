import { describe, expect, it } from 'vitest';

import { ValidationError } from '@mkt/shared-kernel';

import {
  isPlatformJob,
  JobWithoutTenantError,
  PlatformJob,
  platformJobMetadata,
  runJob,
} from '../src/jobs/platform-job.js';
import { TenantFairScheduler } from '../src/jobs/tenant-fair-scheduler.js';
import { runWithTenant, type TenantContext } from '../src/tenancy/tenant-context.js';
import {
  tenantCacheKey,
  tenantCacheKeyFor,
  tenantSearchIndex,
  tenantStorageKey,
  tenantStorageKeyFor,
  tenantTelemetryAttributes,
} from '../src/tenancy/tenant-keys.js';
import { checkTenantRateLimit, type RateLimitStore } from '../src/tenancy/tenant-rate-limit.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';

const contexto = (tenantId: string, slug: string): TenantContext => ({
  tenantId,
  slug,
  status: 'active',
  cell: 'shared-1',
});

describe('chaves prefixadas por tenant', () => {
  it('prefixa cache, storage e índice de busca', () => {
    runWithTenant(contexto(TENANT_A, 'loja-a'), () => {
      expect(tenantCacheKey('cart', '42')).toBe(`t:${TENANT_A}:cart:42`);
      expect(tenantStorageKey('products', 'foto.jpg')).toBe(`t/${TENANT_A}/products/foto.jpg`);
      expect(tenantSearchIndex('products')).toBe(`products_${TENANT_A}`);
      expect(tenantTelemetryAttributes()).toEqual({ 'tenant.id': TENANT_A, 'tenant.slug': 'loja-a' });
    });
  });

  it('nunca gera a mesma chave para tenants diferentes', () => {
    expect(tenantCacheKeyFor(TENANT_A, 'cart')).not.toBe(tenantCacheKeyFor(TENANT_B, 'cart'));
    expect(tenantStorageKeyFor(TENANT_A, 'a.jpg')).not.toBe(tenantStorageKeyFor(TENANT_B, 'a.jpg'));
  });

  it('recusa tenant vazio', () => {
    expect(() => tenantCacheKeyFor('  ', 'cart')).toThrow(ValidationError);
    expect(() => tenantStorageKeyFor('', 'a.jpg')).toThrow(ValidationError);
    expect(() => tenantSearchIndex('products', '')).toThrow(ValidationError);
  });
});

describe('@PlatformJob', () => {
  class RelayJob {
    readonly name = 'outbox-relay';
  }
  // o decorator aplicado como função: o vitest usa esbuild, que não processa
  // decorators legados — o efeito em runtime é idêntico a `@PlatformJob(...)`
  PlatformJob('varre o outbox de todos os tenants')(RelayJob);

  class ExpiracaoDeReservaJob {
    readonly name = 'expire-reservations';
  }

  it('marca o job e guarda a justificativa', () => {
    expect(isPlatformJob(new RelayJob())).toBe(true);
    expect(platformJobMetadata(new RelayJob())?.justification).toBe('varre o outbox de todos os tenants');
    expect(isPlatformJob(new ExpiracaoDeReservaJob())).toBe(false);
    expect(platformJobMetadata(undefined)).toBeUndefined();
  });

  it('job comum sem TenantContext falha', async () => {
    await expect(runJob(new ExpiracaoDeReservaJob(), async () => 'feito')).rejects.toBeInstanceOf(
      JobWithoutTenantError,
    );
  });

  it('job comum com TenantContext roda', async () => {
    const resultado = await runWithTenant(contexto(TENANT_A, 'loja-a'), () =>
      runJob(new ExpiracaoDeReservaJob(), async () => 'feito'),
    );

    expect(resultado).toBe('feito');
  });

  it('job de plataforma roda sem tenant — e sem herdar contexto por acidente', async () => {
    const { currentTenant } = await import('../src/tenancy/tenant-context.js');
    let tenantDentro: unknown = 'ainda-nao';

    await runWithTenant(contexto(TENANT_A, 'loja-a'), () =>
      runJob(new RelayJob(), async () => {
        tenantDentro = currentTenant();
      }),
    );

    expect(tenantDentro).toBeUndefined();
  });
});

describe('justiça entre tenants na fila', () => {
  it('um tenant com fila enorme não trava o outro', async () => {
    const scheduler = new TenantFairScheduler({ totalConcurrency: 4, maxPerTenant: 2 });
    const ordemDeTermino: string[] = [];

    const tarefa = (tenantId: string, etiqueta: string, duracao: number) =>
      scheduler.run(tenantId, async () => {
        await new Promise((resolve) => setTimeout(resolve, duracao));
        ordemDeTermino.push(etiqueta);
      });

    const barulhento = Array.from({ length: 12 }, (_, indice) => tarefa(TENANT_A, `a${indice}`, 20));
    // o tenant B chega depois, com poucos jobs
    const educado = [tarefa(TENANT_B, 'b0', 20), tarefa(TENANT_B, 'b1', 20)];

    await Promise.all([...barulhento, ...educado]);

    const ultimoDeB = Math.max(ordemDeTermino.indexOf('b0'), ordemDeTermino.indexOf('b1'));
    expect(ultimoDeB).toBeLessThan(ordemDeTermino.length - 1);
    // B terminou bem antes do fim da fila de A
    expect(ultimoDeB).toBeLessThanOrEqual(5);
  });

  it('respeita o teto por tenant', async () => {
    const scheduler = new TenantFairScheduler({ totalConcurrency: 8, maxPerTenant: 2 });
    let maximoSimultaneo = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        scheduler.run(TENANT_A, async () => {
          maximoSimultaneo = Math.max(maximoSimultaneo, scheduler.inFlightFor(TENANT_A));
          await new Promise((resolve) => setTimeout(resolve, 10));
        }),
      ),
    );

    expect(maximoSimultaneo).toBeLessThanOrEqual(2);
    expect(scheduler.inFlightFor(TENANT_A)).toBe(0);
  });
});

describe('rate limit por tenant', () => {
  class StoreFake implements RateLimitStore {
    private readonly contadores = new Map<string, number>();
    private readonly expiracoes = new Map<string, number>();

    async incr(key: string): Promise<number> {
      const valor = (this.contadores.get(key) ?? 0) + 1;
      this.contadores.set(key, valor);
      return valor;
    }

    async pexpire(key: string, milliseconds: number): Promise<unknown> {
      this.expiracoes.set(key, milliseconds);
      return 1;
    }

    async pttl(key: string): Promise<number> {
      return this.expiracoes.get(key) ?? -1;
    }

    chaves(): string[] {
      return [...this.contadores.keys()];
    }
  }

  it('conta por tenant e bloqueia ao passar do limite', async () => {
    const store = new StoreFake();
    const opcoes = { limit: 2, windowMs: 60_000, bucket: 'store-api' };

    const primeira = await checkTenantRateLimit(store, TENANT_A, opcoes);
    const segunda = await checkTenantRateLimit(store, TENANT_A, opcoes);
    const terceira = await checkTenantRateLimit(store, TENANT_A, opcoes);

    expect(primeira).toMatchObject({ allowed: true, remaining: 1, limit: 2 });
    expect(segunda.allowed).toBe(true);
    expect(terceira).toMatchObject({ allowed: false, remaining: 0 });
    expect(primeira.resetInMs).toBe(60_000);
  });

  it('a cota de um tenant não consome a do outro', async () => {
    const store = new StoreFake();
    const opcoes = { limit: 1, windowMs: 1_000, bucket: 'store-api' };

    await checkTenantRateLimit(store, TENANT_A, opcoes);
    const doB = await checkTenantRateLimit(store, TENANT_B, opcoes);

    expect(doB.allowed).toBe(true);
    expect(store.chaves()).toEqual([
      `t:${TENANT_A}:ratelimit:store-api`,
      `t:${TENANT_B}:ratelimit:store-api`,
    ]);
  });
});
