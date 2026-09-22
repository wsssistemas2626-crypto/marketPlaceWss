import { describe, expect, it } from 'vitest';

import { findEvent, listEvents, parseEvent, UnknownEventError } from '../src/events/catalog.js';
import { cloudEventSchema } from '../src/events/envelope.js';
import { WIDGET_CREATED } from '../src/events/template-events.js';

const envelope = {
  specversion: '1.0' as const,
  id: '0193a000-0000-7000-8000-000000000001',
  source: 'mkt/template',
  type: 'template.widget.created',
  dataschemaversion: 1,
  time: '2026-04-01T09:00:00.000Z',
  subject: 'widget/0193a000-0000-7000-8000-000000000002',
  tenantid: '0193a000-0000-7000-8000-00000000000a',
  data: { widgetId: '0193a000-0000-7000-8000-000000000002', slug: 'w', name: 'W', priceCents: 100 },
};

describe('envelope CloudEvents', () => {
  it('aceita um envelope completo', () => {
    expect(cloudEventSchema.parse(envelope).tenantid).toBe(envelope.tenantid);
  });

  it('exige tenantid em UUID v7 (ADR-012)', () => {
    expect(() => cloudEventSchema.parse({ ...envelope, tenantid: undefined })).toThrow();
    expect(() => cloudEventSchema.parse({ ...envelope, tenantid: 'loja-a' })).toThrow();
  });

  it('exige o padrão <modulo>.<entidade>.<verbo> no type', () => {
    expect(() => cloudEventSchema.parse({ ...envelope, type: 'widget.created' })).toThrow();
  });

  it('exige id em UUID v7 e time ISO', () => {
    expect(() => cloudEventSchema.parse({ ...envelope, id: 'abc' })).toThrow();
    expect(() => cloudEventSchema.parse({ ...envelope, time: 'ontem' })).toThrow();
  });
});

describe('catálogo de eventos', () => {
  it('valida o payload contra o schema registrado', () => {
    expect(parseEvent(envelope).data).toEqual(envelope.data);
    expect(() => parseEvent({ ...envelope, data: { widgetId: 1 } })).toThrow();
  });

  it('recusa evento fora do catálogo', () => {
    expect(() => parseEvent({ ...envelope, type: 'template.widget.explodiu' })).toThrow(UnknownEventError);
    expect(() => parseEvent({ ...envelope, dataschemaversion: 99 })).toThrow(UnknownEventError);
  });

  it('expõe as definições registradas', () => {
    expect(findEvent('template.widget.created', 1)).toBe(WIDGET_CREATED);
    expect(listEvents().map((event) => event.type)).toContain('template.widget.created');
  });
});
