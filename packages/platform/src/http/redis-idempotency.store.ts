import type { IdempotencyRecord, IdempotencyStore } from './idempotency.js';

/** O mínimo do Redis usado aqui — mantém o pacote testável sem servidor. */
export interface IdempotencyRedis {
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag: 'NX'): Promise<'OK' | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<'OK' | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

/**
 * Armazenamento das chaves de idempotência no Redis (24 h).
 *
 * `SET ... NX PX` é atômico: duas requisições simultâneas com a mesma chave
 * não conseguem ambas iniciar o trabalho.
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redis: IdempotencyRedis) {}

  async putIfAbsent(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<IdempotencyRecord | undefined> {
    const stored = await this.redis.set(key, JSON.stringify(record), 'PX', ttlMs, 'NX');
    if (stored === 'OK') return undefined;

    const current = await this.redis.get(key);
    return current === null ? undefined : (JSON.parse(current) as IdempotencyRecord);
  }

  async set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(record), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
