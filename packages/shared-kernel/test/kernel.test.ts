import { describe, expect, it } from 'vitest';

import { FixedClock, SystemClock } from '../src/clock.js';
import { createDomainEvent } from '../src/domain-event.js';
import {
  ConflictError,
  DomainError,
  InvariantViolationError,
  NotFoundError,
  ValidationError,
} from '../src/errors.js';
import { Id } from '../src/id.js';
import { andThen, err, isErr, isOk, map, mapErr, ok, unwrap, unwrapOr } from '../src/result.js';
import { roundHalfEven } from '../src/rounding.js';

describe('roundHalfEven', () => {
  it('manda o empate para o par', () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
  });

  it('arredonda normalmente fora do empate', () => {
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
    expect(roundHalfEven(-2.4)).toBe(-2);
    expect(roundHalfEven(7)).toBe(7);
  });

  it('recusa valor não finito', () => {
    expect(() => roundHalfEven(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfEven(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('Clock', () => {
  it('SystemClock devolve o instante atual', () => {
    const antes = Date.now();
    const agora = new SystemClock().now();

    expect(agora).toBeInstanceOf(Date);
    expect(agora.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('FixedClock avança e reposiciona sob controle do teste', () => {
    const clock = new FixedClock('2026-03-01T10:00:00.000Z');

    expect(clock.now().toISOString()).toBe('2026-03-01T10:00:00.000Z');
    expect(clock.advance(3_600_000).toISOString()).toBe('2026-03-01T11:00:00.000Z');
    expect(clock.set('2027-01-01T00:00:00.000Z').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(new FixedClock().now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('não devolve a instância interna (evita mutação de fora)', () => {
    const clock = new FixedClock('2026-03-01T10:00:00.000Z');
    const instante = clock.now();
    instante.setFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});

describe('Id (UUID v7)', () => {
  it('gera um UUID v7 válido a partir do Clock', () => {
    const clock = new FixedClock('2026-05-04T03:02:01.000Z');
    const id = Id.create(clock);

    expect(Id.isValid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(Id.timestampOf(id).toISOString()).toBe('2026-05-04T03:02:01.000Z');
  });

  it('é ordenável no tempo', () => {
    const clock = new FixedClock('2026-01-01T00:00:00.000Z');
    const primeiro = Id.create(clock);
    clock.advance(1);
    const segundo = Id.create(clock);

    expect(primeiro < segundo).toBe(true);
  });

  it('gera ids distintos no mesmo milissegundo', () => {
    const clock = new FixedClock();
    const ids = new Set(Array.from({ length: 200 }, () => Id.create(clock)));

    expect(ids.size).toBe(200);
  });

  it('recusa UUID v4, texto solto e timestamp inválido', () => {
    expect(Id.isValid('9f1b8b7a-2c4e-4a3f-8c2d-1a2b3c4d5e6f')).toBe(false);
    expect(Id.isValid('nao-e-uuid')).toBe(false);
    expect(() => Id.parse('nao-e-uuid')).toThrow(ValidationError);
    expect(() => Id.fromTimestamp(-1)).toThrow(ValidationError);
    expect(() => Id.fromTimestamp(1.5)).toThrow(ValidationError);
  });

  it('parse devolve o próprio id quando válido', () => {
    const id = Id.fromTimestamp(1_772_000_000_000);

    expect(Id.parse(id)).toBe(id);
  });
});

describe('Result', () => {
  it('distingue sucesso de erro', () => {
    const sucesso = ok(42);
    const falha = err(new ValidationError('inválido'));

    expect(isOk(sucesso)).toBe(true);
    expect(isErr(sucesso)).toBe(false);
    expect(isOk(falha)).toBe(false);
    expect(isErr(falha)).toBe(true);
  });

  it('map e mapErr agem no lado certo', () => {
    expect(unwrap(map(ok(2), (value) => value * 3))).toBe(6);
    expect(map(err('falhou'), (value: number) => value * 3)).toEqual({ ok: false, error: 'falhou' });
    expect(mapErr(err('x'), (error) => `${error}!`)).toEqual({ ok: false, error: 'x!' });
    expect(mapErr(ok(1), () => 'nunca')).toEqual({ ok: true, value: 1 });
  });

  it('andThen encadeia só no sucesso', () => {
    const dobra = (value: number) => ok(value * 2);

    expect(unwrap(andThen(ok(2), dobra))).toBe(4);
    expect(andThen(err('parou'), dobra)).toEqual({ ok: false, error: 'parou' });
  });

  it('unwrap lança o erro e unwrapOr devolve o padrão', () => {
    expect(() => unwrap(err(new ValidationError('boom')))).toThrow(ValidationError);
    expect(() => unwrap(err({ codigo: 1 }))).toThrow(DomainError);
    expect(unwrapOr(err('x'), 7)).toBe(7);
    expect(unwrapOr(ok(1), 7)).toBe(1);
  });
});

describe('DomainError', () => {
  it('carrega código, mensagem e detalhes', () => {
    const erro = new ValidationError('CPF inválido', { field: 'document' });

    expect(erro).toBeInstanceOf(DomainError);
    expect(erro.code).toBe('validation_error');
    expect(erro.name).toBe('ValidationError');
    expect(erro.details).toEqual({ field: 'document' });
    expect(erro.toJSON()).toEqual({
      code: 'validation_error',
      message: 'CPF inválido',
      details: { field: 'document' },
    });
  });

  it('cada especialização tem seu código', () => {
    expect(new InvariantViolationError('transição proibida').code).toBe('invariant_violation');
    expect(new ConflictError('duplicado').code).toBe('conflict');

    const naoEncontrado = new NotFoundError('Pedido', { id: 'x' });
    expect(naoEncontrado.code).toBe('not_found');
    expect(naoEncontrado.message).toBe('Pedido não encontrado');
    expect(naoEncontrado.details).toEqual({ resource: 'Pedido', id: 'x' });
  });

  it('erro base aceita código livre e detalhes vazios', () => {
    const erro = new DomainError('custom_code', 'algo');

    expect(erro.code).toBe('custom_code');
    expect(erro.details).toEqual({});
  });
});

describe('createDomainEvent', () => {
  const clock = new FixedClock('2026-07-01T12:00:00.000Z');
  const tenantId = Id.fromTimestamp(1_770_000_000_000);

  it('monta o envelope com id v7, horário do Clock e tenant', () => {
    const evento = createDomainEvent(
      {
        type: 'orders.order.placed',
        source: 'mkt/orders',
        tenantId,
        subject: 'order/0191',
        data: { total: 1000 },
      },
      clock,
    );

    expect(Id.isValid(evento.id)).toBe(true);
    expect(evento.time.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(evento.tenantId).toBe(tenantId);
    expect(evento.dataSchemaVersion).toBe(1);
    expect(evento.data).toEqual({ total: 1000 });
    expect(evento.sellerId).toBeUndefined();
    expect(evento.correlationId).toBeUndefined();
  });

  it('inclui sellerId, correlationId e versão de schema quando informados', () => {
    const evento = createDomainEvent(
      {
        type: 'orders.seller_order.shipped',
        source: 'mkt/orders',
        tenantId,
        subject: 'seller_order/1',
        data: {},
        sellerId: 'seller-1',
        correlationId: 'req-1',
        dataSchemaVersion: 2,
      },
      clock,
    );

    expect(evento.sellerId).toBe('seller-1');
    expect(evento.correlationId).toBe('req-1');
    expect(evento.dataSchemaVersion).toBe(2);
  });

  it('exige o padrão <modulo>.<entidade>.<verbo> no tipo', () => {
    for (const type of ['orders.placed', 'Orders.Order.Placed', 'orders..placed', '']) {
      expect(
        () => createDomainEvent({ type, source: 'mkt/orders', tenantId, subject: 's', data: {} }, clock),
        type,
      ).toThrow(ValidationError);
    }
  });

  it('exige tenantId válido — evento sem tenant não existe (ADR-012)', () => {
    expect(() =>
      createDomainEvent(
        { type: 'orders.order.placed', source: 'mkt/orders', tenantId: 'sem-tenant', subject: 's', data: {} },
        clock,
      ),
    ).toThrow(ValidationError);
  });
});
