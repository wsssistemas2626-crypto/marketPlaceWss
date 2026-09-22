import type { CloudEvent } from '@mkt/contracts';

/** Para onde o relay publica os eventos (BullMQ em produção). */
export interface EventBusPort {
  publish(event: CloudEvent): Promise<void>;
  /** Evento que não pode mais ser tentado (envelope inválido, estouro de tentativas). */
  publishToDeadLetter(event: CloudEvent | unknown, reason: string): Promise<void>;
}

export const EVENT_BUS = Symbol('EVENT_BUS');

/** Barramento em memória para testes e para o modo offline de desenvolvimento. */
export class InMemoryEventBus implements EventBusPort {
  readonly published: CloudEvent[] = [];
  readonly deadLettered: { event: unknown; reason: string }[] = [];

  async publish(event: CloudEvent): Promise<void> {
    this.published.push(event);
  }

  async publishToDeadLetter(event: unknown, reason: string): Promise<void> {
    this.deadLettered.push({ event, reason });
  }
}
