import { randomFillSync } from 'node:crypto';

import type { Clock } from './clock.js';
import { ValidationError } from './errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Identificador do sistema: **UUID v7** (RFC 9562) — 48 bits de timestamp em
 * milissegundos + aleatoriedade. Ordenável no tempo, o que mantém os índices
 * do Postgres compactos sem expor contagem por tenant (CLAUDE.md §5 e
 * `arquitetura/06-multi-tenancy.md` §3.4).
 *
 * O Node ainda não gera v7 (`randomUUID` é v4), então geramos aqui.
 */
export const Id = {
  /** Gera um novo UUID v7 usando o instante do `Clock` informado. */
  create(clock: Clock): string {
    return Id.fromTimestamp(clock.now().getTime());
  },

  fromTimestamp(milliseconds: number): string {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new ValidationError(`Timestamp inválido para UUID v7: ${milliseconds}`, {
        field: 'milliseconds',
      });
    }

    const bytes = new Uint8Array(16);
    randomFillSync(bytes);
    const view = new DataView(bytes.buffer);

    // 48 bits de timestamp (big-endian) nos bytes 0..5
    const timestamp = BigInt(milliseconds);
    for (let index = 0; index < 6; index += 1) {
      view.setUint8(index, Number((timestamp >> BigInt(8 * (5 - index))) & 0xffn));
    }

    // versão 7 nos 4 bits altos do byte 6; variante RFC 4122 (10xx) no byte 8
    view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
    view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  },

  isValid(value: string): boolean {
    return UUID_PATTERN.test(value);
  },

  /** Valida e devolve o id; use na fronteira (DTO → domínio). */
  parse(value: string, field = 'id'): string {
    if (!Id.isValid(value)) {
      throw new ValidationError(`Identificador não é um UUID v7 válido: "${value}"`, { field });
    }
    return value;
  },

  /** Instante embutido no id — útil para ordenação e diagnóstico. */
  timestampOf(value: string): Date {
    const hex = Id.parse(value).replace(/-/g, '').slice(0, 12);
    return new Date(Number.parseInt(hex, 16));
  },
} as const;
