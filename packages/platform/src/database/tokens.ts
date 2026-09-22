/**
 * Tokens de injeção dos clientes de infraestrutura.
 *
 * Ficam no platform para que módulos e apps usem o mesmo símbolo — e para
 * deixar explícito qual role cada um carrega (ADR-014 §3).
 */

/** Pool do runtime, conectado com o role `app` (sujeito a RLS). */
export const DATABASE_POOL = Symbol('DATABASE_POOL');

/** Pool do role `platform` (BYPASSRLS): só outbox relay e `@PlatformJob`. */
export const DATABASE_POOL_PLATFORM = Symbol('DATABASE_POOL_PLATFORM');

/** Cliente Redis (BullMQ, cache, idempotência). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
