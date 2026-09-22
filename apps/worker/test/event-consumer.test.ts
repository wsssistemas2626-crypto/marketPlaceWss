import { describe, expect, it, vi } from 'vitest';

import { InMemoryEventBus, type DatabasePool } from '@mkt/platform';

import { EventConsumerService } from '../src/messaging/event-consumer.service.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';

const envelopeValido = {
  specversion: '1.0',
  id: '0193a000-0000-7000-8000-000000000001',
  source: 'mkt/template',
  type: 'template.widget.created',
  dataschemaversion: 1,
  time: '2026-04-01T09:00:00.000Z',
  subject: 'widget/0193a000-0000-7000-8000-000000000002',
  tenantid: TENANT_A,
  data: { widgetId: '0193a000-0000-7000-8000-000000000002', slug: 'w', name: 'W', priceCents: 100 },
};

const consumidor = (bus: InMemoryEventBus) =>
  new EventConsumerService({} as DatabasePool, bus, { handle: vi.fn() } as never);

describe('EventConsumerService', () => {
  it('manda evento SEM tenantid direto para a DLQ (aceite da US-072)', async () => {
    const bus = new InMemoryEventBus();
    const { tenantid: _tenantid, ...semTenant } = envelopeValido;

    await consumidor(bus).dispatch(semTenant);

    expect(bus.deadLettered).toHaveLength(1);
    expect(bus.deadLettered[0]?.reason).toContain('tenantid');
  });

  it('manda envelope malformado para a DLQ em vez de tentar de novo', async () => {
    const bus = new InMemoryEventBus();

    await consumidor(bus).dispatch({ qualquer: 'coisa' });

    expect(bus.deadLettered).toHaveLength(1);
  });

  it('manda evento fora do catálogo para a DLQ', async () => {
    const bus = new InMemoryEventBus();

    await consumidor(bus).dispatch({ ...envelopeValido, type: 'template.widget.inventado' });

    expect(bus.deadLettered[0]?.reason).toContain('catálogo');
  });

  it('evento válido segue para o handler; falha ali é retentada, não descartada', async () => {
    const bus = new InMemoryEventBus();

    // o pool é falso de propósito: a falha acontece já dentro do handler
    await expect(consumidor(bus).dispatch(envelopeValido)).rejects.toThrow();

    // nada foi para a DLQ — quem decide isso é o BullMQ, após 5 tentativas
    expect(bus.deadLettered).toEqual([]);
  });
});
