import { AsyncLocalStorage } from 'node:async_hooks';

import { TenantContextMissingError } from './tenant-errors.js';

export type TenantStatus = 'provisioning' | 'trial' | 'active' | 'suspended' | 'cancelled';

/**
 * Identidade do tenant da requisição/job em andamento (ADR-012).
 *
 * É resolvido **uma vez** na borda (host, organização da Clerk, API key ou
 * envelope do evento) e nunca aceito do corpo, query ou header livre.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly slug: string;
  readonly status: TenantStatus;
  /** Implantação que atende este tenant. Padrão: `shared-1`. */
  readonly cell: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Executa `fn` com o contexto do tenant ativo. */
export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Contexto atual, ou `undefined` fora de uma requisição/job com tenant. */
export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

/**
 * Contexto atual; lança se não houver. Use em repositórios e casos de uso —
 * é a rede que impede uma consulta "sem tenant" passar despercebida.
 */
export function requireTenant(): TenantContext {
  const context = storage.getStore();
  if (context === undefined) {
    throw new TenantContextMissingError();
  }
  return context;
}

/** Roda um trecho explicitamente **sem** tenant (outbox relay, `@PlatformJob`). */
export function runWithoutTenant<T>(fn: () => T): T {
  return storage.exit(fn);
}
