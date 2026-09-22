import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CloudEvent } from '@mkt/contracts';
import { FixedClock, createDomainEvent, Id } from '@mkt/shared-kernel';

import { discoverMigrations, runMigrations } from '../src/database/migrations.js';
import { createPool, type DatabasePool } from '../src/database/pool.js';
import { withTenantTx } from '../src/database/unit-of-work.js';
import { InMemoryEventBus } from '../src/messaging/event-bus.port.js';
import { consumeOnce } from '../src/messaging/idempotent-consumer.js';
import { enqueueOutboxEvent, toCloudEvent } from '../src/messaging/outbox.js';
import { relayOutboxBatch } from '../src/messaging/outbox-relay.js';
import {
  isDockerAvailable,
  repositoryRoot,
  startTestDatabase,
  type TestDatabase,
} from './support/postgres-container.js';

const dockerAvailable = await isDockerAvailable();

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const TENANT_B = '0193a000-0000-7000-8000-00000000000b';
const clock = new FixedClock('2026-04-01T09:00:00.000Z');

const widgetCreated = (tenantId: string, slug: string) =>
  createDomainEvent(
    {
      type: 'template.widget.created',
      source: 'mkt/template',
      tenantId,
      subject: `widget/${Id.create(clock)}`,
      data: { widgetId: Id.create(clock), slug, name: slug, priceCents: 100 },
    },
    clock,
  );

describe.skipIf(!dockerAvailable)('outbox e consumidor idempotente (integração)', () => {
  let database: TestDatabase;
  let appPool: DatabasePool;
  let platformPool: DatabasePool;
  let migratorPool: DatabasePool;

  beforeAll(async () => {
    database = await startTestDatabase();
    migratorPool = createPool(database.urls.migrator, { max: 1 });
    appPool = createPool(database.urls.app, { max: 4 });
    platformPool = createPool(database.urls.platform, { max: 2 });

    await runMigrations(migratorPool, await discoverMigrations(repositoryRoot));
  }, 180_000);

  afterAll(async () => {
    await appPool?.end();
    await platformPool?.end();
    await migratorPool?.end();
    await database?.stop();
  });

  describe('gravação na mesma transação', () => {
    it('rollback da transação não publica evento (aceite 1)', async () => {
      const bus = new InMemoryEventBus();

      await expect(
        withTenantTx(
          appPool,
          async (client) => {
            await client.query(
              `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
               VALUES (gen_random_uuid(), $1, 'nao-vai-nascer', 'X', 100)`,
              [TENANT_A],
            );
            await enqueueOutboxEvent(client, 'template', widgetCreated(TENANT_A, 'nao-vai-nascer'));
            throw new Error('falha depois de gravar widget e evento');
          },
          TENANT_A,
        ),
      ).rejects.toThrow('falha depois de gravar');

      const relayed = await relayOutboxBatch(platformPool, bus, { schemas: ['template'] });

      expect(relayed.published).toBe(0);
      expect(bus.published).toEqual([]);
    });

    it('commit publica exatamente uma vez e marca como publicado', async () => {
      const bus = new InMemoryEventBus();
      const evento = widgetCreated(TENANT_A, 'publicado');

      await withTenantTx(
        appPool,
        async (client) => {
          await client.query(
            `INSERT INTO template.widgets (id, tenant_id, slug, name, price_cents)
             VALUES (gen_random_uuid(), $1, 'publicado', 'Publicado', 100)`,
            [TENANT_A],
          );
          await enqueueOutboxEvent(client, 'template', evento);
        },
        TENANT_A,
      );

      const primeiro = await relayOutboxBatch(platformPool, bus, { schemas: ['template'] });
      const segundo = await relayOutboxBatch(platformPool, bus, { schemas: ['template'] });

      expect(primeiro.published).toBe(1);
      expect(segundo.published).toBe(0);
      expect(bus.published).toHaveLength(1);
      expect(bus.published[0]).toMatchObject({ type: 'template.widget.created', tenantid: TENANT_A });
    });

    it('o outbox de um tenant é invisível para o outro (RLS)', async () => {
      await withTenantTx(
        appPool,
        (client) => enqueueOutboxEvent(client, 'template', widgetCreated(TENANT_B, 'da-loja-b')),
        TENANT_B,
      );

      const visiveisParaA = await withTenantTx(
        appPool,
        (client) => client.query('SELECT tenant_id FROM template.outbox'),
        TENANT_A,
      );

      expect(visiveisParaA.rows.every((row) => row.tenant_id === TENANT_A)).toBe(true);
    });

    it('envelope inválido vai para a DLQ depois de esgotar as tentativas', async () => {
      const bus = new InMemoryEventBus();
      const id = Id.create(clock);

      await withTenantTx(
        appPool,
        (client) =>
          client.query(
            `INSERT INTO template.outbox (id, tenant_id, type, payload)
             VALUES ($1, $2, 'template.widget.created', $3)`,
            [id, TENANT_A, JSON.stringify({ specversion: '1.0', quebrado: true })],
          ),
        TENANT_A,
      );

      let resultado = { published: 0, deadLettered: 0, failed: 0 };
      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        resultado = await relayOutboxBatch(platformPool, bus, { schemas: ['template'], maxAttempts: 5 });
      }

      expect(resultado.deadLettered).toBe(1);
      expect(bus.deadLettered).toHaveLength(1);
      expect(bus.published.every((event) => event.id !== id)).toBe(true);
    });
  });

  describe('consumidor idempotente', () => {
    const evento: CloudEvent = toCloudEvent(widgetCreated(TENANT_A, 'idempotente'));

    it('evento duplicado é processado uma só vez (aceite 2)', async () => {
      let execucoes = 0;
      const handler = async () => {
        execucoes += 1;
      };

      const primeiro = await consumeOnce(appPool, evento, 'handler-teste', handler);
      const segundo = await consumeOnce(appPool, evento, 'handler-teste', handler);

      expect(primeiro).toEqual({ processed: true, duplicate: false });
      expect(segundo).toEqual({ processed: false, duplicate: true });
      expect(execucoes).toBe(1);
    });

    it('handlers diferentes processam o mesmo evento', async () => {
      const resultado = await consumeOnce(appPool, evento, 'outro-handler', async () => undefined);

      expect(resultado.duplicate).toBe(false);
    });

    it('falha do handler desfaz o registro de idempotência (pode tentar de novo)', async () => {
      const outro = toCloudEvent(widgetCreated(TENANT_A, 'falha-no-handler'));

      await expect(
        consumeOnce(appPool, outro, 'handler-teste', async () => {
          throw new Error('handler quebrou');
        }),
      ).rejects.toThrow('handler quebrou');

      let executou = false;
      const retry = await consumeOnce(appPool, outro, 'handler-teste', async () => {
        executou = true;
      });

      expect(retry.processed).toBe(true);
      expect(executou).toBe(true);
    });

    it('abre o TenantContext a partir do envelope', async () => {
      const doTenantB = toCloudEvent(widgetCreated(TENANT_B, 'contexto'));
      let tenantVisto: string | undefined;

      await consumeOnce(appPool, doTenantB, 'handler-contexto', async () => {
        const { requireTenant } = await import('../src/tenancy/tenant-context.js');
        tenantVisto = requireTenant().tenantId;
      });

      expect(tenantVisto).toBe(TENANT_B);
    });

    it('o registro de idempotência de um tenant não é visível no outro', async () => {
      const visiveis = await withTenantTx(
        appPool,
        (client) => client.query('SELECT tenant_id FROM platform.processed_events'),
        TENANT_B,
      );

      expect(visiveis.rows.every((row) => row.tenant_id === TENANT_B)).toBe(true);
    });
  });
});
