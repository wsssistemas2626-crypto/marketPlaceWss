/** Cliente Redis reduzido ao que esta checagem precisa (facilita o teste). */
export interface RedisConfigReader {
  config(command: 'GET', parameter: string): Promise<unknown>;
}

export class RedisEvictionPolicyError extends Error {
  constructor(policy: string) {
    super(
      `Redis está com maxmemory-policy="${policy}"; o BullMQ exige "noeviction" — ` +
        'jobs seriam descartados silenciosamente sob pressão de memória.',
    );
    this.name = 'RedisEvictionPolicyError';
  }
}

function readPolicy(raw: unknown): string | undefined {
  // `CONFIG GET maxmemory-policy` devolve ['maxmemory-policy', '<valor>'].
  if (Array.isArray(raw) && typeof raw[1] === 'string') return raw[1];
  return undefined;
}

/**
 * Armadilha #4 de `docs/arquitetura/07-infraestrutura-railway.md`: o BullMQ exige
 * `noeviction`. Em produção isso derruba o boot; fora dela, apenas avisa
 * (Redis gerenciado pode bloquear `CONFIG GET`).
 */
export async function assertRedisEvictionPolicy(
  redis: RedisConfigReader,
  options: { readonly isProduction: boolean; readonly warn: (message: string) => void },
): Promise<void> {
  let policy: string | undefined;
  try {
    policy = readPolicy(await redis.config('GET', 'maxmemory-policy'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    options.warn(`Não foi possível ler maxmemory-policy do Redis: ${message}`);
    return;
  }

  if (policy === undefined) {
    options.warn('Redis não informou maxmemory-policy; checagem do BullMQ ignorada.');
    return;
  }
  if (policy === 'noeviction') return;

  if (options.isProduction) throw new RedisEvictionPolicyError(policy);
  options.warn(new RedisEvictionPolicyError(policy).message);
}
