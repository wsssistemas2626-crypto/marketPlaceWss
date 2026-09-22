import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discoverMigrations, runMigrations } from '../src/database/migrations.js';
import { createPool, type DatabasePool } from '../src/database/pool.js';
import { describeRlsGaps, findTablesMissingTenantRls } from '../src/database/rls-coverage.js';
import { nextTenantCounter } from '../src/database/tenant-counters.js';
import { withTenantTx, withTransaction } from '../src/database/unit-of-work.js';
import {
  isDockerAvailable,
  repositoryRoot,
  startTestDatabase,
  type TestDatabase,
} from './support/postgres-container.js';

const dockerAvailable = await isDockerAvailable();

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';

const inserirWidget = (pool: DatabasePool, tenantId: string, slug: string) =>
  withTenantTx(
    pool,
    (client) =>
      client.query(
        `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
         VALUES (gen_random_uuid(), $1, $2, $2, 100)`,
        [tenantId, slug],
      ),
    tenantId,
  );

describe.skipIf(!dockerAvailable)('RLS e isolamento entre tenants (integração)', () => {
  let database: TestDatabase;
  let appPool: DatabasePool;
  let migratorPool: DatabasePool;

  beforeAll(async () => {
    database = await startTestDatabase();
    migratorPool = createPool(database.urls.migrator, { max: 1 });
    appPool = createPool(database.urls.app, { max: 4 });

    await runMigrations(migratorPool, await discoverMigrations(repositoryRoot));
    await inserirWidget(appPool, TENANT_A, 'da-loja-a');
    await inserirWidget(appPool, TENANT_B, 'da-loja-b');
  }, 180_000);

  afterAll(async () => {
    await appPool?.end();
    await migratorPool?.end();
    await database?.stop();
  });

  describe('cobertura de RLS (teste de CI tenancy/rls-coverage)', () => {
    it('nenhuma tabela com tenant_id fica sem RLS habilitado, forçado e com policy', async () => {
      const gaps = await findTablesMissingTenantRls(migratorPool);

      expect(gaps, describeRlsGaps(gaps)).toEqual([]);
    });

    it('acusa uma tabela nova que esqueceu o RLS', async () => {
      await withTransaction(migratorPool, (client) =>
        client.query(
          `CREATE TABLE IF NOT EXISTS template.esquecida (
             id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             tenant_id uuid NOT NULL
           )`,
        ),
      );

      const gaps = await findTablesMissingTenantRls(migratorPool);
      expect(gaps.map((gap) => gap.table)).toContain('esquecida');

      await withTransaction(migratorPool, (client) => client.query('DROP TABLE template.esquecida'));
      expect(await findTablesMissingTenantRls(migratorPool)).toEqual([]);
    });
  });

  describe('filtro automático', () => {
    it('o tenant A só enxerga os próprios dados, sem WHERE escrito à mão', async () => {
      const doA = await withTenantTx(
        appPool,
        (client) => client.query<{ slug: string }>('SELECT slug FROM template.widgets'),
        TENANT_A,
      );

      expect(doA.rows.map((row) => row.slug)).toEqual(['da-loja-a']);
    });

    it('nem lendo por id o tenant A alcança um registro do tenant B', async () => {
      const idDeB = await withTenantTx(
        appPool,
        async (client) => {
          const { rows } = await client.query<{ id: string }>('SELECT id FROM template.widgets LIMIT 1');
          return rows[0]?.id;
        },
        TENANT_B,
      );

      const tentativa = await withTenantTx(
        appPool,
        (client) => client.query('SELECT slug FROM template.widgets WHERE id = $1', [idDeB]),
        TENANT_A,
      );

      expect(tentativa.rowCount).toBe(0);
    });

    it('UPDATE e DELETE de um tenant não tocam no outro', async () => {
      const atualizados = await withTenantTx(
        appPool,
        (client) => client.query(`UPDATE template.widgets SET name = 'invadido'`),
        TENANT_A,
      );
      expect(atualizados.rowCount).toBe(1);

      const doB = await withTenantTx(
        appPool,
        (client) => client.query<{ name: string }>('SELECT name FROM template.widgets'),
        TENANT_B,
      );
      expect(doB.rows[0]?.name).toBe('da-loja-b');
    });

    it('não dá para gravar linha com tenant_id de outro tenant (WITH CHECK)', async () => {
      await expect(
        withTenantTx(
          appPool,
          (client) =>
            client.query(
              `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
               VALUES (gen_random_uuid(), $1, 'forjado', 'Forjado', 1)`,
              [TENANT_B],
            ),
          TENANT_A,
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe('rede de segurança: consulta sem SET LOCAL', () => {
    it('não retorna nenhuma linha', async () => {
      const semContexto = await withTransaction(appPool, (client) =>
        client.query('SELECT slug FROM template.widgets'),
      );

      expect(semContexto.rowCount).toBe(0);
    });

    it('não consegue inserir', async () => {
      await expect(
        withTransaction(appPool, (client) =>
          client.query(
            `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
             VALUES (gen_random_uuid(), $1, 'sem-contexto', 'Sem contexto', 1)`,
            [TENANT_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe('contadores por tenant', () => {
    it('numeram de forma independente em cada tenant', async () => {
      const primeiroA = await withTenantTx(
        appPool,
        (client) => nextTenantCounter(client, 'order_number', TENANT_A),
        TENANT_A,
      );
      const segundoA = await withTenantTx(
        appPool,
        (client) => nextTenantCounter(client, 'order_number', TENANT_A),
        TENANT_A,
      );
      const primeiroB = await withTenantTx(
        appPool,
        (client) => nextTenantCounter(client, 'order_number', TENANT_B),
        TENANT_B,
      );

      expect([primeiroA, segundoA, primeiroB]).toEqual([1, 2, 1]);
    });

    it('não devolve o mesmo número para chamadas concorrentes', async () => {
      const numeros = await Promise.all(
        Array.from({ length: 10 }, () =>
          withTenantTx(appPool, (client) => nextTenantCounter(client, 'concorrente', TENANT_A), TENANT_A),
        ),
      );

      expect(new Set(numeros).size).toBe(10);
    });

    it('o contador de um tenant é invisível para o outro', async () => {
      const visiveis = await withTenantTx(
        appPool,
        (client) => client.query('SELECT tenant_id FROM platform.tenant_counters'),
        TENANT_B,
      );

      expect(visiveis.rows.every((row) => row.tenant_id === TENANT_B)).toBe(true);
    });
  });
});
