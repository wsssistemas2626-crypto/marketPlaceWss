import { ValidationError } from './errors.js';
import { roundHalfEven } from './rounding.js';

/** Só existe BRL no escopo atual (ver `docs/01-visao-produto.md` §6). */
export type Currency = 'BRL';

const DECIMAL_PATTERN = /^-?\d+(?:[.,]\d{1,2})?$/;

/**
 * Valor monetário imutável, sempre em **centavos inteiros** (CLAUDE.md §4.6).
 *
 * Nunca use `number` com casas decimais para dinheiro: 0.1 + 0.2 !== 0.3 em
 * ponto flutuante e o erro se acumula em comissão, split e ledger.
 */
export class Money {
  private constructor(
    readonly cents: number,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  static fromCents(cents: number, currency: Currency = 'BRL'): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new ValidationError(`Dinheiro precisa ser um inteiro de centavos, recebeu ${cents}`, {
        field: 'cents',
      });
    }
    return new Money(cents, currency);
  }

  /** Aceita "10", "10.5", "10,50" — no máximo duas casas decimais. */
  static fromDecimal(value: string, currency: Currency = 'BRL'): Money {
    if (!DECIMAL_PATTERN.test(value.trim())) {
      throw new ValidationError(`Valor decimal inválido: "${value}"`, { field: 'value' });
    }

    const normalized = value.trim().replace(',', '.');
    const negative = normalized.startsWith('-');
    const [whole = '0', fraction = ''] = normalized.replace('-', '').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

    return Money.fromCents(negative ? -cents : cents, currency);
  }

  static zero(currency: Currency = 'BRL'): Money {
    return new Money(0, currency);
  }

  /** Soma uma lista garantindo moeda única; lista vazia é zero. */
  static sum(values: readonly Money[], currency: Currency = 'BRL'): Money {
    return values.reduce<Money>((total, value) => total.add(value), Money.zero(currency));
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new ValidationError(`Não é possível operar ${this.currency} com ${other.currency}`, {
        field: 'currency',
      });
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromCents(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromCents(this.cents - other.cents, this.currency);
  }

  /** Multiplica por um fator arbitrário, arredondando half-even (RN-FIN-03). */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new ValidationError(`Fator inválido: ${factor}`, { field: 'factor' });
    }
    return Money.fromCents(roundHalfEven(this.cents * factor), this.currency);
  }

  /** Percentual em pontos-base (1% = 100 bps), para evitar float na taxa. */
  percentageInBasisPoints(basisPoints: number): Money {
    if (!Number.isInteger(basisPoints)) {
      throw new ValidationError(`Pontos-base precisam ser inteiros, recebeu ${basisPoints}`, {
        field: 'basisPoints',
      });
    }
    return Money.fromCents(roundHalfEven((this.cents * basisPoints) / 10_000), this.currency);
  }

  /**
   * Divide o valor entre `weights` **sem perder nem criar centavos**: a soma do
   * resultado é sempre exatamente este valor. Os centavos que sobram do
   * arredondamento vão para `remainderTo` — no split de um pedido, o índice da
   * plataforma (RN-FIN-03).
   */
  allocate(weights: readonly number[], remainderTo = 0): Money[] {
    if (weights.length === 0) {
      throw new ValidationError('É preciso ao menos um peso para ratear', { field: 'weights' });
    }
    if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
      throw new ValidationError('Pesos precisam ser números não negativos', { field: 'weights' });
    }
    if (remainderTo < 0 || remainderTo >= weights.length) {
      throw new ValidationError(`Índice de resto fora da faixa: ${remainderTo}`, {
        field: 'remainderTo',
      });
    }

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total === 0) {
      throw new ValidationError('A soma dos pesos não pode ser zero', { field: 'weights' });
    }

    const shares = weights.map((weight) => Math.trunc((this.cents * weight) / total));
    const distributed = shares.reduce((sum, share) => sum + share, 0);
    const remainder = this.cents - distributed;

    return shares.map((share, index) =>
      Money.fromCents(index === remainderTo ? share + remainder : share, this.currency),
    );
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }

  /** -1, 0 ou 1 — serve direto em `Array.prototype.sort`. */
  compare(other: Money): number {
    this.assertSameCurrency(other);
    return Math.sign(this.cents - other.cents);
  }

  /** Texto para UI em pt-BR (ex.: "R$ 1.234,56"). */
  format(locale = 'pt-BR'): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: this.currency }).format(
      this.cents / 100,
    );
  }

  /** Serialização estável para DTOs, eventos e banco. */
  toJSON(): { cents: number; currency: Currency } {
    return { cents: this.cents, currency: this.currency };
  }

  toString(): string {
    return `${this.currency} ${(this.cents / 100).toFixed(2)}`;
  }
}
