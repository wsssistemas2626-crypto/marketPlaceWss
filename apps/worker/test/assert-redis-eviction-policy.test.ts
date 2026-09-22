import { describe, expect, it, vi } from 'vitest';

import {
  assertRedisEvictionPolicy,
  RedisEvictionPolicyError,
  type RedisConfigReader,
} from '../src/infrastructure/assert-redis-eviction-policy.js';

const reader = (value: unknown): RedisConfigReader => ({ config: async () => value });
const failing = (message: string): RedisConfigReader => ({
  config: async () => {
    throw new Error(message);
  },
});

describe('assertRedisEvictionPolicy', () => {
  it('aceita noeviction sem avisar', async () => {
    const warn = vi.fn();

    await assertRedisEvictionPolicy(reader(['maxmemory-policy', 'noeviction']), {
      isProduction: true,
      warn,
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('derruba o boot em produção quando a política é outra', async () => {
    await expect(
      assertRedisEvictionPolicy(reader(['maxmemory-policy', 'allkeys-lru']), {
        isProduction: true,
        warn: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(RedisEvictionPolicyError);
  });

  it('apenas avisa fora de produção', async () => {
    const warn = vi.fn();

    await assertRedisEvictionPolicy(reader(['maxmemory-policy', 'allkeys-lru']), {
      isProduction: false,
      warn,
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('noeviction');
  });

  it('não impede o boot se o Redis gerenciado bloquear CONFIG GET', async () => {
    const warn = vi.fn();

    await assertRedisEvictionPolicy(failing('ERR unknown command CONFIG'), {
      isProduction: true,
      warn,
    });

    expect(warn).toHaveBeenCalledOnce();
  });
});
