import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertRuntimeRoleIsSafe, UnsafeDatabaseRoleError } from '../src/database/assert-runtime-role.js';
import { discoverMigrations, runMigrations } from '../src/database/migrations.js';
import { createModuleSchemaSql, enableTenantRlsSql } from '../src/database/module-schema.js';
import { createPool, type DatabasePool } from '../src/database/pool.js';
import { withTenantTx, withTransaction } from '../src/database/unit-of-work.js';
import { runWithTenant } from '../src/tenancy/tenant-context.js';
import {
  isDockerAvailable,
  repositoryRoot,
  startTestDatabase,
  type TestDatabase,
} from './support/postgres-container.js';

const dockerAvailable = await isDockerAvailable();

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';

describe.skipIf(!dockerAvailable)('banco por módulo (integração)', () => {
  let database: TestDatabase;
  let appPool: DatabasePool;
  let migratorPool: DatabasePool;

  beforeAll(async () => {
    database = await startTestDatabase();
    migratorPool = createPool(database.urls.migrator, { max: 1 });
    appPool = createPool(database.urls.app, { max: 4 });

    const migrations = await discoverMigrations(repositoryRoot);
    await runMigrations(migratorPool, migrations);
  }, 180_000);

  afterAll(async () => {
    await appPool?.end();
    await migratorPool?.end();
    await database?.stop();
  });

  describe('roles (ADR-014, armadilha #1)', () => {
    it('o runtime não é superusuário nem tem BYPASSRLS', async () => {
      const { rows } = await appPool.query<{ role: string; sup: boolean; bypass: boolean }>(
        'SELECT current_user AS role, rolsuper AS sup, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user',
      );

      expect(rows[0]).toMatchObject({ role: 'app', sup: false, bypass: false });
      await expect(assertRuntimeRoleIsSafe(appPool)).resolves.toBeUndefined();
    });

    it('recusa o boot se a URL for a do superusuário', async () => {
      const superPool = createPool(database.urls.superuser, { max: 1 });
      try {
        await expect(assertRuntimeRoleIsSafe(superPool)).rejects.toBeInstanceOf(UnsafeDatabaseRoleError);
      } finally {
        await superPool.end();
      }
    });

    it('recusa o boot com o role platform (BYPASSRLS)', async () => {
      const platformPool = createPool(database.urls.platform, { max: 1 });
      try {
        const erro = await assertRuntimeRoleIsSafe(platformPool).catch((e) => e);
        expect(erro).toBeInstanceOf(UnsafeDatabaseRoleError);
        expect(erro.message).toContain('BYPASSRLS');
      } finally {
        await platformPool.end();
      }
    });
  });

  describe('migrações', () => {
    it('criam o schema e a tabela do módulo', async () => {
      const { rows } = await migratorPool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'template'`,
      );

      expect(rows.map((row) => row.table_name)).toContain('widgets');
    });

    it('são idempotentes: rodar de novo não reaplica nada', async () => {
      const migrations = await discoverMigrations(repositoryRoot);
      const result = await runMigrations(migratorPool, migrations);

      expect(result.applied).toEqual([]);
      expect(result.skipped).toContain('_template/0001_init.sql');
    });

    it('registram o que foi aplicado', async () => {
      const { rows } = await migratorPool.query(
        'SELECT module, name FROM platform.schema_migrations ORDER BY module, name',
      );

      expect(rows).toContainEqual({ module: '_template', name: '0001_init.sql' });
    });

    it('a tabela nasce com RLS habilitado e forçado', async () => {
      const { rows } = await migratorPool.query<{ enabled: boolean; forced: boolean }>(
        `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
           FROM pg_class WHERE oid = 'template.widgets'::regclass`,
      );

      expect(rows[0]).toEqual({ enabled: true, forced: true });
    });
  });

  describe('unit of work', () => {
    it('faz commit no caminho feliz', async () => {
      await withTenantTx(
        appPool,
        async (client) => {
          await client.query(
            `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
             VALUES (gen_random_uuid(), $1, 'commitado', 'Commitado', 100)`,
            [TENANT_A],
          );
        },
        TENANT_A,
      );

      const encontrados = await withTenantTx(
        appPool,
        (client) => client.query(`SELECT slug FROM template.widgets WHERE slug = 'commitado'`),
        TENANT_A,
      );

      expect(encontrados.rowCount).toBe(1);
    });

    it('desfaz tudo quando o trabalho falha', async () => {
      await expect(
        withTenantTx(
          appPool,
          async (client) => {
            await client.query(
              `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
               VALUES (gen_random_uuid(), $1, 'revertido', 'Revertido', 100)`,
              [TENANT_A],
            );
            throw new Error('falha no meio do caso de uso');
          },
          TENANT_A,
        ),
      ).rejects.toThrow('falha no meio do caso de uso');

      const encontrados = await withTenantTx(
        appPool,
        (client) => client.query(`SELECT slug FROM template.widgets WHERE slug = 'revertido'`),
        TENANT_A,
      );

      expect(encontrados.rowCount).toBe(0);
    });

    it('usa o tenant do contexto quando não recebe um explícito', async () => {
      const contexto = { tenantId: TENANT_B, slug: 'loja-b', status: 'active' as const, cell: 'shared-1' };

      const tenantNaTransacao = await runWithTenant(contexto, () =>
        withTenantTx(appPool, async (client) => {
          const { rows } = await client.query<{ tenant: string }>(
            `SELECT current_setting('app.tenant_id', true) AS tenant`,
          );
          return rows[0]?.tenant;
        }),
      );

      expect(tenantNaTransacao).toBe(TENANT_B);
    });

    it('SET LOCAL não vaza para a próxima conexão do pool (armadilha #6)', async () => {
      await withTenantTx(appPool, async () => undefined, TENANT_A);

      const vazou = await withTransaction(appPool, async (client) => {
        const { rows } = await client.query<{ tenant: string | null }>(
          `SELECT current_setting('app.tenant_id', true) AS tenant`,
        );
        return rows[0]?.tenant;
      });

      expect(vazou === null || vazou === '').toBe(true);
    });
  });

  describe('geradores de SQL', () => {
    it('createModuleSchemaSql cria schema utilizável pelo app', async () => {
      await withTransaction(migratorPool, (client) => client.query(createModuleSchemaSql('exemplo')));
      await withTransaction(migratorPool, (client) =>
        client.query(
          `CREATE TABLE IF NOT EXISTS exemplo.coisas (
             id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             tenant_id uuid NOT NULL,
             nome text NOT NULL
           )`,
        ),
      );
      await withTransaction(migratorPool, (client) => client.query(enableTenantRlsSql('exemplo', 'coisas')));

      const { rows } = await migratorPool.query<{ enabled: boolean; forced: boolean }>(
        `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
           FROM pg_class WHERE oid = 'exemplo.coisas'::regclass`,
      );

      expect(rows[0]).toEqual({ enabled: true, forced: true });

      // o app consegue inserir dentro do contexto do tenant
      await withTenantTx(
        appPool,
        (client) =>
          client.query(`INSERT INTO exemplo.coisas (tenant_id, nome) VALUES ($1, 'ok')`, [TENANT_A]),
        TENANT_A,
      );
    });
  });
});
