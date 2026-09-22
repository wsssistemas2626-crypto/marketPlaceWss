import type { z } from 'zod';

import { cloudEventSchema, type CloudEvent } from './envelope.js';

export interface EventDefinition<TSchema extends z.ZodType = z.ZodType> {
  readonly type: string;
  readonly version: number;
  /** Schema do `data`. */
  readonly schema: TSchema;
  /** Eventos públicos podem ser assinados por webhooks externos. */
  readonly isPublic: boolean;
  readonly description: string;
}

const catalog = new Map<string, EventDefinition>();

const key = (type: string, version: number): string => `${type}@${version}`;

/**
 * Registra um evento no catálogo (`docs/arquitetura/03-integracoes.md`).
 *
 * Campo novo opcional = mesma versão; remover ou renomear = versão nova,
 * publicando as duas em paralelo durante a migração.
 */
export function registerEvent<TSchema extends z.ZodType>(
  definition: EventDefinition<TSchema>,
): EventDefinition<TSchema> {
  const id = key(definition.type, definition.version);
  if (catalog.has(id)) {
    throw new Error(`Evento já registrado no catálogo: ${id}`);
  }
  catalog.set(id, definition);
  return definition;
}

export function findEvent(type: string, version: number): EventDefinition | undefined {
  return catalog.get(key(type, version));
}

export function listEvents(): EventDefinition[] {
  return [...catalog.values()].sort((a, b) => a.type.localeCompare(b.type) || a.version - b.version);
}

export class UnknownEventError extends Error {
  constructor(type: string, version: number) {
    super(`Evento fora do catálogo: ${type}@${version}`);
    this.name = 'UnknownEventError';
  }
}

/**
 * Valida envelope **e** payload contra o catálogo. É o portão de entrada do
 * consumidor: evento malformado ou desconhecido não vira trabalho.
 */
export function parseEvent(value: unknown): CloudEvent {
  const envelope = cloudEventSchema.parse(value);
  const definition = findEvent(envelope.type, envelope.dataschemaversion);
  if (definition === undefined) {
    throw new UnknownEventError(envelope.type, envelope.dataschemaversion);
  }

  return { ...envelope, data: definition.schema.parse(envelope.data) } as CloudEvent;
}
