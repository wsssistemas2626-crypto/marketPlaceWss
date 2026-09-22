import { Queue } from 'bullmq';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FixedClock, Id, createDomainEvent } from '@mkt/shared-kernel';

import {
  BullMqEventBus,
  createEventWorker,
  EVENTS_DLQ,
  EVENTS_QUEUE,
  tenantJobId,
} from '../src/messaging/bullmq-event-bus.js';
import { toCloudEvent } from '../src/messaging/outbox.js';
import { isDockerAvailable } from './support/postgres-container.js';

const dockerAvailable = await isDockerAvailable();
const clock = new FixedClock('2026-04-01T09:00:00.000Z');
const TENANT_A = '0193a000-0000-7000-8000-00000000000a';

const evento = (slug: string) =>
  toCloudEvent(
    createDomainEvent(
      {
        type: 'template.widget.created',
        source: 'mkt/template',
        tenantId: TENANT_A,
        subject: `widget/${Id.create(clock)}`,
        data: { widgetId: Id.create(clock), slug, name: slug, priceCents: 100 },
      },
      clock,
    ),
  );

const esperar = async (condicao: () => Promise<boolean>, timeoutMs = 20_000): Promise<boolean> => {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicao()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

describe.skipIf(!dockerAvailable)('barramento de eventos em BullMQ (integração)', () => {
  let container: StartedRedisContainer;
  let connection: { url: string; family: number };
  let bus: BullMqEventBus;

  beforeAll(async () => {
    container = await new RedisContainer('redis:8-alpine')
      // BullMQ exige noeviction (armadilha #4 do ADR-014)
      .withCommand(['redis-server', '--maxmemory-policy', 'noeviction'])
      .start();
    connection = { url: container.getConnectionUrl(), family: 0 };
    bus = new BullMqEventBus({ connection, attempts: 5, backoffMs: 10 });
  }, 180_000);

  afterAll(async () => {
    await bus?.close();
    await container?.stop();
  });

  it('entrega o evento ao consumidor', async () => {
    const recebidos: string[] = [];
    const worker = createEventWorker(
      async (event) => {
        recebidos.push(event.id);
      },
      bus,
      { connection, attempts: 5, backoffMs: 10, concurrency: 1 },
    );

    try {
      const publicado = evento('entregue');
      await bus.publish(publicado);

      expect(await esperar(async () => recebidos.includes(publicado.id))).toBe(true);
    } finally {
      await worker.close();
    }
  });

  it('falha 5× vai para a DLQ (aceite 3)', async () => {
    const dlq = new Queue(EVENTS_DLQ, { connection });
    await dlq.drain(true);

    let tentativas = 0;
    const worker = createEventWorker(
      async () => {
        tentativas += 1;
        throw new Error('handler sempre falha');
      },
      bus,
      { connection, attempts: 5, backoffMs: 10, concurrency: 1 },
    );

    try {
      await bus.publish(evento('sempre-falha'));

      const foiParaDlq = await esperar(async () => (await dlq.getJobCountByTypes('waiting')) > 0);

      expect(foiParaDlq).toBe(true);
      expect(tentativas).toBe(5);

      const [job] = await dlq.getJobs(['waiting']);
      expect(job?.data).toMatchObject({ reason: 'handler sempre falha' });
    } finally {
      await worker.close();
      await dlq.close();
    }
  }, 60_000);

  it('deduplica pelo jobId derivado do evento', async () => {
    const fila = new Queue(EVENTS_QUEUE, { connection });
    try {
      const repetido = evento('duplicado');
      await bus.publish(repetido);
      await bus.publish(repetido);

      const job = await fila.getJob(tenantJobId(repetido));
      expect(job?.id).toBe(`t:${TENANT_A}:${repetido.id}`);
    } finally {
      await fila.close();
    }
  });
});
