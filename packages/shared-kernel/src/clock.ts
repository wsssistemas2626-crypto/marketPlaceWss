/**
 * Fonte de tempo injetável. O domínio nunca chama `Date.now()` direto
 * (CLAUDE.md §9): sem isso, regras com prazo (repasse, expiração de reserva,
 * validade de cotação) viram testes lentos e instáveis.
 */
export interface Clock {
  now(): Date;
}

/** Relógio real. Datas sempre em UTC no banco (CLAUDE.md §5). */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Relógio controlado, para testes e simulação de prazos. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date | string = '2026-01-01T00:00:00.000Z') {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  /** Avança o relógio e devolve o novo instante. */
  advance(milliseconds: number): Date {
    this.current = new Date(this.current.getTime() + milliseconds);
    return this.now();
  }

  set(instant: Date | string): Date {
    this.current = new Date(instant);
    return this.now();
  }
}
