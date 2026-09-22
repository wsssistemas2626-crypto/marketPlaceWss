import type { CheckResult, CheckStatus, HealthProbe, HealthReport } from './health.types.js';

export interface RunHealthChecksOptions {
  /** Timeout por dependência. Curto de propósito: o healthcheck não pode segurar o deploy. */
  readonly timeoutMs?: number;
  /** Injetável para testes determinísticos (CLAUDE.md §9: nada de `Date.now()` solto). */
  readonly now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

class ProbeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`timeout after ${timeoutMs}ms`);
    this.name = 'ProbeTimeoutError';
  }
}

async function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/**
 * Executa todas as probes em paralelo. O relatório fica `down` se qualquer
 * dependência falhar — é o que a Railway usa para decidir se o deploy subiu.
 */
export async function runHealthChecks(
  probes: readonly HealthProbe[],
  options: RunHealthChecksOptions = {},
): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());

  const entries = await Promise.all(
    probes.map(async (probe): Promise<[string, CheckResult]> => {
      const startedAt = now();
      try {
        await withTimeout(probe.check(), timeoutMs);
        return [probe.name, { status: 'up', latencyMs: now() - startedAt }];
      } catch (error) {
        return [probe.name, { status: 'down', latencyMs: now() - startedAt, error: describe(error) }];
      }
    }),
  );

  const checks = Object.fromEntries(entries);
  const status: CheckStatus = entries.every(([, result]) => result.status === 'up') ? 'up' : 'down';
  return { status, checks };
}
