import { Writable } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
  currentCorrelationId,
  newCorrelationId,
  runWithCorrelationId,
} from '../src/observability/correlation-id.js';
import { contextualLogger, createLogger, logContext, REDACT_PATHS } from '../src/observability/logger.js';
import {
  fingerprintRequest,
  IdempotencyKeyConflictError,
  IdempotentRequestInFlightError,
  runIdempotent,
  type IdempotencyRecord,
  type IdempotencyStore,
} from '../src/http/idempotency.js';
import { RedisIdempotencyStore, type IdempotencyRedis } from '../src/http/redis-idempotency.store.js';
import { runWithTenant, type TenantContext } from '../src/tenancy/tenant-context.js';

const TENANT_A = '0193a000-0000-7000-8000-00000000000a';
const contexto: TenantContext = { tenantId: TENANT_A, slug: 'loja-a', status: 'active', cell: 'shared-1' };

/** Coleta as linhas de log emitidas pelo pino. */
function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)));
      callback();
    },
  });
  const logger = createLogger({ service: 'teste' });
  return { lines, logger: logger.child({}, { level: 'info' }), stream };
}

describe('log sem dados pessoais (RNF-LGPD-04)', () => {
  it('reda CPF, e-mail, telefone, endereço e segredos em qualquer profundidade', () => {
    const lines: Record<string, unknown>[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(JSON.parse(String(chunk)));
        callback();
      },
    });

    // mesma configuração de redação do logger de produção, escrevendo no stream do teste
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, stream);
    logger.info(
      {
        buyer: { cpf: '123.456.789-09', email: 'pessoa@example.com', phone: '11999999999' },
        shipping: { address: 'Rua X, 123', zipCode: '01310-000' },
        payment: { cardNumber: '4111111111111111', cvv: '123' },
        authorization: 'Bearer abc',
        orderId: 'pedido-1',
      },
      'pedido criado',
    );

    const registro = JSON.stringify(lines[0]);
    for (const vazamento of [
      '123.456.789-09',
      'pessoa@example.com',
      '11999999999',
      'Rua X, 123',
      '01310-000',
      '4111111111111111',
      'Bearer abc',
    ]) {
      expect(registro, vazamento).not.toContain(vazamento);
    }
    // o que não é pessoal continua no log
    expect(registro).toContain('pedido-1');
    expect(registro).toContain('[redacted]');
  });
});

describe('correlation id', () => {
  it('aceita o id recebido e o devolve no header', () => {
    const middleware = new CorrelationIdMiddleware();
    const setHeader = vi.fn();
    let visto: string | undefined;

    middleware.use({ headers: { [CORRELATION_ID_HEADER]: 'req-123' } }, { setHeader }, () => {
      visto = currentCorrelationId();
    });

    expect(visto).toBe('req-123');
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'req-123');
  });

  it('gera um id quando não vem nenhum', () => {
    const middleware = new CorrelationIdMiddleware();
    let visto: string | undefined;

    middleware.use({ headers: {} }, {}, () => {
      visto = currentCorrelationId();
    });

    expect(visto).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('entra no contexto do log junto com o tenant', () => {
    runWithCorrelationId('req-9', () => {
      runWithTenant(contexto, () => {
        expect(logContext()).toEqual({
          'tenant.id': TENANT_A,
          'tenant.slug': 'loja-a',
          correlation_id: 'req-9',
        });
      });
    });
  });

  it('fora de requisição o contexto fica vazio', () => {
    expect(logContext()).toEqual({});
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });

  it('contextualLogger cria filho com os campos do contexto', () => {
    const { logger } = captureLogger();
    const filho = runWithCorrelationId('req-1', () =>
      runWithTenant(contexto, () => contextualLogger(logger)),
    );

    expect(filho.bindings()).toMatchObject({ 'tenant.id': TENANT_A, correlation_id: 'req-1' });
  });
});

describe('idempotência de requisição (US-007)', () => {
  class StoreEmMemoria implements IdempotencyStore {
    readonly registros = new Map<string, IdempotencyRecord>();

    async putIfAbsent(key: string, record: IdempotencyRecord): Promise<IdempotencyRecord | undefined> {
      const existente = this.registros.get(key);
      if (existente !== undefined) return existente;
      this.registros.set(key, record);
      return undefined;
    }

    async set(key: string, record: IdempotencyRecord): Promise<void> {
      this.registros.set(key, record);
    }

    async delete(key: string): Promise<void> {
      this.registros.delete(key);
    }
  }

  const entrada = {
    tenantId: TENANT_A,
    key: 'chave-1',
    method: 'POST',
    path: '/v1/store/orders',
    body: { total: 1000 },
  };

  it('executa uma vez e repete a resposta guardada', async () => {
    const store = new StoreEmMemoria();
    let execucoes = 0;
    const trabalho = async () => {
      execucoes += 1;
      return { statusCode: 201, body: { id: 'pedido-1' } };
    };

    const primeira = await runIdempotent(store, entrada, trabalho);
    const segunda = await runIdempotent(store, entrada, trabalho);

    expect(execucoes).toBe(1);
    expect(primeira).toMatchObject({ replayed: false, statusCode: 201 });
    expect(segunda).toMatchObject({ replayed: true, statusCode: 201, body: { id: 'pedido-1' } });
  });

  it('mesma chave com corpo diferente é conflito', async () => {
    const store = new StoreEmMemoria();
    await runIdempotent(store, entrada, async () => ({ statusCode: 201, body: {} }));

    await expect(
      runIdempotent(store, { ...entrada, body: { total: 9999 } }, async () => ({
        statusCode: 201,
        body: {},
      })),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
  });

  it('requisição ainda em andamento não é reexecutada', async () => {
    const store = new StoreEmMemoria();
    await store.putIfAbsent(`t:${TENANT_A}:idempotency:chave-1`, {
      fingerprint: fingerprintRequest(entrada.method, entrada.path, entrada.body),
      status: 'in_flight',
    });

    await expect(
      runIdempotent(store, entrada, async () => ({ statusCode: 201, body: {} })),
    ).rejects.toBeInstanceOf(IdempotentRequestInFlightError);
  });

  it('falha libera a chave para nova tentativa', async () => {
    const store = new StoreEmMemoria();

    await expect(
      runIdempotent(store, entrada, async () => {
        throw new Error('gateway fora do ar');
      }),
    ).rejects.toThrow('gateway fora do ar');

    expect(store.registros.size).toBe(0);

    const retry = await runIdempotent(store, entrada, async () => ({ statusCode: 201, body: { ok: true } }));
    expect(retry.replayed).toBe(false);
  });

  it('a chave é por tenant', async () => {
    const store = new StoreEmMemoria();
    await runIdempotent(store, entrada, async () => ({ statusCode: 201, body: {} }));

    const outroTenant = await runIdempotent(
      store,
      { ...entrada, tenantId: '0193a000-0000-7000-8000-00000000000b' },
      async () => ({ statusCode: 201, body: {} }),
    );

    expect(outroTenant.replayed).toBe(false);
    expect([...store.registros.keys()]).toHaveLength(2);
  });
});

describe('RedisIdempotencyStore', () => {
  it('usa SET NX PX e lê o registro existente', async () => {
    const dados = new Map<string, string>();
    const redis = {
      set: vi.fn(async (key: string, value: string, _mode: string, _ttl: number, flag?: string) => {
        if (flag === 'NX' && dados.has(key)) return null;
        dados.set(key, value);
        return 'OK' as const;
      }),
      get: vi.fn(async (key: string) => dados.get(key) ?? null),
      del: vi.fn(async (key: string) => (dados.delete(key) ? 1 : 0)),
    } as unknown as IdempotencyRedis;

    const store = new RedisIdempotencyStore(redis);
    const registro = { fingerprint: 'abc', status: 'in_flight' as const };

    expect(await store.putIfAbsent('k', registro, 1_000)).toBeUndefined();
    expect(await store.putIfAbsent('k', registro, 1_000)).toEqual(registro);

    await store.delete('k');
    expect(await store.putIfAbsent('k', registro, 1_000)).toBeUndefined();
  });
});
