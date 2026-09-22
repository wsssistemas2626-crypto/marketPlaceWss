import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ConfigService,
  createPool,
  discoverMigrations,
  resolveTenantByHost,
  runMigrations,
  TenantNotFoundError,
  TenantSuspendedError,
  withTenantTx,
  withTransaction,
  type DatabasePool,
} from '@mkt/platform';

import { DbConfigSource } from '../src/infrastructure/db-config-source.js';
import { DbTenantDirectory } from '../src/infrastructure/db-tenant-directory.js';
import { DrizzleTenantRegistry } from '../src/infrastructure/drizzle-tenant-registry.js';
import {
  isDockerAvailable,
  repositoryRoot,
  startTestDatabase,
  type TestDatabase,
} from './support/database.js';

const dockerAvailable = await isDockerAvailable();

describe.skipIf(!dockerAvailable)('registro de tenants no banco (integração)', () => {
  let database: TestDatabase;
  let appPool: DatabasePool;
  let migratorPool: DatabasePool;
  let directory: DbTenantDirectory;
  let registry: DrizzleTenantRegistry;
  let config: ConfigService;

  beforeAll(async () => {
    database = await startTestDatabase();
    migratorPool = createPool(database.urls.migrator, { max: 1 });
    appPool = createPool(database.urls.app, { max: 4 });

    await runMigrations(migratorPool, await discoverMigrations(repositoryRoot));

    directory = new DbTenantDirectory(appPool);
    registry = new DrizzleTenantRegistry(appPool, directory, 'localhost');
    config = new ConfigService(new DbConfigSource(appPool));

    await withTransaction(appPool, (client) =>
      client.query(
        `INSERT INTO tenancy.plans (plan_id, name, entitlements, settings)
              VALUES ('platform-defaults', 'Padrões', '{"modules":[],"limits":{}}'::jsonb, '{"orders.cancel_window_minutes":15}'::jsonb),
                     ('growth', 'Growth', '{"modules":["disputes"],"limits":{"sellers":200}}'::jsonb, '{"orders.cancel_window_minutes":60}'::jsonb)
         ON CONFLICT (plan_id) DO NOTHING`,
      ),
    );
  }, 180_000);

  afterAll(async () => {
    await appPool?.end();
    await migratorPool?.end();
    await database?.stop();
  });

  describe('provisionamento', () => {
    it('cria o tenant com domínio primário e status trial', async () => {
      const tenant = await registry.provision({ slug: 'loja-x', name: 'Loja X', planId: 'growth' });

      expect(tenant).toMatchObject({ slug: 'loja-x', status: 'trial', cell: 'shared-1', planId: 'growth' });
      expect(tenant.hosts).toEqual(['loja-x.localhost']);
    });

    it('recusa slug repetido', async () => {
      await expect(registry.provision({ slug: 'loja-x', name: 'Outra' })).rejects.toThrow(/já existe/i);
    });

    it('aceita hostname próprio', async () => {
      const tenant = await registry.provision({
        slug: 'loja-y',
        name: 'Loja Y',
        hostname: 'Loja-Y.com.br:443',
      });

      // normaliza host: sem porta e em minúsculas
      expect(tenant.hosts).toEqual(['loja-y.com.br']);
    });
  });

  describe('resolução por host (substitui o registro em memória da US-070)', () => {
    it('resolve o tenant recém-criado', async () => {
      const contexto = await resolveTenantByHost('loja-x.localhost', { directory });

      expect(contexto.slug).toBe('loja-x');
    });

    it('host desconhecido continua 404', async () => {
      await expect(resolveTenantByHost('nao-existe.localhost', { directory })).rejects.toBeInstanceOf(
        TenantNotFoundError,
      );
    });

    it('suspender um tenant vale na hora, sem esperar o cache', async () => {
      const tenant = await registry.provision({ slug: 'loja-z', name: 'Loja Z' });
      await resolveTenantByHost('loja-z.localhost', { directory });

      await registry.changeStatus(tenant.id, 'suspended');

      await expect(resolveTenantByHost('loja-z.localhost', { directory })).rejects.toBeInstanceOf(
        TenantSuspendedError,
      );
    });

    it('usa cache dentro da janela de 60 s', async () => {
      const tenant = await registry.provision({ slug: 'loja-cache', name: 'Cache' });
      await resolveTenantByHost('loja-cache.localhost', { directory });

      // muda direto no banco, sem passar pelo registry (que invalidaria o cache)
      await withTransaction(appPool, (client) =>
        client.query(`UPDATE tenancy.tenants SET status = 'suspended' WHERE id = $1`, [tenant.id]),
      );

      await expect(resolveTenantByHost('loja-cache.localhost', { directory })).resolves.toMatchObject({
        status: 'trial',
      });

      // passada a janela, o valor novo aparece
      const agora = Date.now();
      directory.now = () => agora + 61_000;
      await expect(resolveTenantByHost('loja-cache.localhost', { directory })).rejects.toBeInstanceOf(
        TenantSuspendedError,
      );
      directory.now = () => Date.now();
    });
  });

  describe('configuração hierárquica com banco (US-073 + US-075)', () => {
    it('plano tem precedência sobre o padrão da plataforma', async () => {
      const tenant = await registry.provision({ slug: 'loja-config', name: 'Config', planId: 'growth' });

      expect(await config.get('orders.cancel_window_minutes', undefined, tenant.id)).toBe(60);
    });

    it('sobreposição do tenant vence o plano', async () => {
      const tenant = await registry.findBySlug('loja-config');
      if (tenant === undefined) throw new Error('tenant do teste sumiu');

      await withTenantTx(
        appPool,
        (client) =>
          client.query(
            `INSERT INTO tenancy.tenant_settings (tenant_id, key, value)
                  VALUES ($1, 'orders.cancel_window_minutes', '5'::jsonb)
             ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [tenant.id],
          ),
        tenant.id,
      );

      expect(await config.get('orders.cancel_window_minutes', undefined, tenant.id)).toBe(5);
    });

    it('tenant sem plano herda só o padrão da plataforma', async () => {
      const tenant = await registry.provision({ slug: 'loja-sem-plano', name: 'Sem plano' });

      expect(await config.get('orders.cancel_window_minutes', undefined, tenant.id)).toBe(15);
      expect(await config.entitlements(tenant.id)).toEqual({ modules: [], limits: {} });
    });

    it('entitlements vêm do plano do tenant', async () => {
      const tenant = await registry.findBySlug('loja-config');
      if (tenant === undefined) throw new Error('tenant do teste sumiu');

      expect(await config.isModuleEnabled('disputes', tenant.id)).toBe(true);
      await expect(config.assertWithinLimit('sellers', 200, tenant.id)).rejects.toThrow(/Limite do plano/);
    });

    it('a configuração de um tenant não vaza para o outro (RLS)', async () => {
      const outro = await registry.provision({ slug: 'loja-isolada', name: 'Isolada', planId: 'growth' });

      expect(await config.get('orders.cancel_window_minutes', undefined, outro.id)).toBe(60);
    });
  });

  describe('listagem para o console', () => {
    it('lista os tenants com domínios e plano', async () => {
      const lista = await registry.list();

      expect(lista.length).toBeGreaterThanOrEqual(4);
      expect(lista.map((tenant) => tenant.slug)).toContain('loja-x');
      expect(lista.every((tenant) => Array.isArray(tenant.hosts))).toBe(true);
    });

    it('busca por slug devolve undefined quando não existe', async () => {
      expect(await registry.findBySlug('nao-existe')).toBeUndefined();
    });
  });
});
