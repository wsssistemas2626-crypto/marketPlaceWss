import { DomainError } from '@mkt/shared-kernel';

import { currentTenant, runWithoutTenant } from '../tenancy/tenant-context.js';

const PLATFORM_JOB = Symbol('PLATFORM_JOB');

export interface PlatformJobMetadata {
  /** Por que este job pode rodar sem tenant. Vai para o log e para a revisão. */
  readonly justification: string;
}

export class JobWithoutTenantError extends DomainError {
  constructor(jobName: string) {
    super(
      'job_without_tenant',
      `O job "${jobName}" rodou sem TenantContext. Todo job carrega tenantId; ` +
        'se ele é mesmo de plataforma, marque com @PlatformJob(justificativa) (CLAUDE.md §4.12).',
      { job: jobName },
    );
  }
}

/**
 * Marca um job que roda **sem** tenant — varredura de outbox, métricas da
 * plataforma, cobrança do SaaS.
 *
 * É exceção, não regra: sem a marca, um job sem tenant é erro. A justificativa
 * fica no código para a revisão saber por que aquele job é diferente.
 */
export function PlatformJob(justification: string): ClassDecorator {
  return (target) => {
    Reflect.defineProperty(target, PLATFORM_JOB, {
      value: { justification } satisfies PlatformJobMetadata,
      enumerable: false,
    });
  };
}

export function platformJobMetadata(target: unknown): PlatformJobMetadata | undefined {
  if (typeof target !== 'function' && typeof target !== 'object') return undefined;
  const holder = target as { constructor?: unknown };
  const candidate =
    (Reflect.get(Object(target), PLATFORM_JOB) as PlatformJobMetadata | undefined) ??
    (holder.constructor === undefined
      ? undefined
      : (Reflect.get(Object(holder.constructor), PLATFORM_JOB) as PlatformJobMetadata | undefined));

  return candidate;
}

export const isPlatformJob = (target: unknown): boolean => platformJobMetadata(target) !== undefined;

/**
 * Executa o trabalho de um job garantindo a regra do CLAUDE.md §4.12:
 * ou existe TenantContext, ou o job está marcado como de plataforma.
 */
export async function runJob<T>(job: { name: string }, work: () => Promise<T>): Promise<T> {
  if (isPlatformJob(job)) {
    // roda explicitamente fora de qualquer tenant, para não herdar contexto por acidente
    return runWithoutTenant(work);
  }

  if (currentTenant() === undefined) {
    throw new JobWithoutTenantError(job.name);
  }

  return work();
}
