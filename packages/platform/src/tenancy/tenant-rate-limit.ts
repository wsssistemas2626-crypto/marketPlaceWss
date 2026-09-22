import { tenantCacheKeyFor } from './tenant-keys.js';

/** O mínimo do Redis de que o limitador precisa (facilita teste e troca). */
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Quanto falta para a janela reiniciar. */
  readonly resetInMs: number;
  readonly limit: number;
}

export interface TenantRateLimitOptions {
  readonly limit: number;
  readonly windowMs: number;
  /** Identifica o que está sendo limitado: rota, api key, IP. */
  readonly bucket: string;
}

/**
 * Janela fixa por tenant, no Redis.
 *
 * A cota é **por tenant** (vem do plano — US-073), além dos limites por IP,
 * usuário e API key da US-007: um tenant não consome a capacidade do outro
 * (`06-multi-tenancy.md` §4).
 */
export async function checkTenantRateLimit(
  store: RateLimitStore,
  tenantId: string,
  options: TenantRateLimitOptions,
): Promise<RateLimitDecision> {
  const key = tenantCacheKeyFor(tenantId, 'ratelimit', options.bucket);
  const hits = await store.incr(key);

  if (hits === 1) {
    await store.pexpire(key, options.windowMs);
  }

  const ttl = await store.pttl(key);
  return {
    allowed: hits <= options.limit,
    remaining: Math.max(options.limit - hits, 0),
    resetInMs: ttl > 0 ? ttl : options.windowMs,
    limit: options.limit,
  };
}
