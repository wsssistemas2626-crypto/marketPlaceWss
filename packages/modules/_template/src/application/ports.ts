import type { DomainEvent } from '@mkt/shared-kernel';

/**
 * Unidade de trabalho. O caso de uso agrupa mudança de estado e evento numa
 * transação só, sem saber que existe SQL do outro lado.
 */
export interface TransactionPort {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/** Publica eventos de domínio (via outbox, na transação corrente). */
export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}

export const TRANSACTION = Symbol('TRANSACTION');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
