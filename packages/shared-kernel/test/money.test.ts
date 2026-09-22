import { describe, expect, it } from 'vitest';

import { ValidationError } from '../src/errors.js';
import { Money } from '../src/money.js';

describe('Money — criação', () => {
  it('guarda centavos inteiros', () => {
    expect(Money.fromCents(1234).cents).toBe(1234);
    expect(Money.fromCents(1234).currency).toBe('BRL');
    expect(Money.zero().isZero()).toBe(true);
  });

  it('recusa valor fracionário, infinito ou NaN', () => {
    expect(() => Money.fromCents(10.5)).toThrow(ValidationError);
    expect(() => Money.fromCents(Number.NaN)).toThrow(ValidationError);
    expect(() => Money.fromCents(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });

  it('converte string decimal com ponto ou vírgula', () => {
    expect(Money.fromDecimal('10').cents).toBe(1000);
    expect(Money.fromDecimal('10.5').cents).toBe(1050);
    expect(Money.fromDecimal('10,50').cents).toBe(1050);
    expect(Money.fromDecimal(' 1234,56 ').cents).toBe(123456);
    expect(Money.fromDecimal('-0,01').cents).toBe(-1);
  });

  it('recusa decimal malformado ou com mais de duas casas', () => {
    for (const value of ['', 'abc', '10.555', '1.2.3', 'R$ 10']) {
      expect(() => Money.fromDecimal(value), value).toThrow(ValidationError);
    }
  });
});

describe('Money — aritmética', () => {
  it('soma e subtrai', () => {
    expect(Money.fromCents(1000).add(Money.fromCents(250)).cents).toBe(1250);
    expect(Money.fromCents(1000).subtract(Money.fromCents(250)).cents).toBe(750);
    expect(Money.sum([Money.fromCents(100), Money.fromCents(200)]).cents).toBe(300);
    expect(Money.sum([]).cents).toBe(0);
  });

  it('multiplica arredondando half-even', () => {
    // 5 centavos × 0,5 = 2,5 → 2 (par)
    expect(Money.fromCents(5).multiply(0.5).cents).toBe(2);
    // 7 centavos × 0,5 = 3,5 → 4 (par)
    expect(Money.fromCents(7).multiply(0.5).cents).toBe(4);
    expect(Money.fromCents(1000).multiply(3).cents).toBe(3000);
  });

  it('calcula percentual em pontos-base', () => {
    // 12% de R$ 100,00
    expect(Money.fromCents(10_000).percentageInBasisPoints(1200).cents).toBe(1200);
    // 15% de R$ 0,33 = 4,95 centavos → 5
    expect(Money.fromCents(33).percentageInBasisPoints(1500).cents).toBe(5);
    expect(() => Money.fromCents(100).percentageInBasisPoints(1.5)).toThrow(ValidationError);
  });

  it('recusa operação com fator inválido ou moeda diferente', () => {
    expect(() => Money.fromCents(100).multiply(Number.NaN)).toThrow(ValidationError);

    const outra = Money.fromCents(100, 'BRL' as never);
    expect(outra.add(Money.fromCents(1)).cents).toBe(101);

    const estrangeiro = Object.assign(Object.create(Money.prototype), { cents: 100, currency: 'USD' });
    expect(() => Money.fromCents(100).add(estrangeiro)).toThrow(ValidationError);
    expect(() => Money.fromCents(100).compare(estrangeiro)).toThrow(ValidationError);
  });
});

describe('Money — rateio sem perda (RN-FIN-03)', () => {
  it('distribui 1 centavo entre 3 sem criar nem perder centavos', () => {
    const partes = Money.fromCents(1).allocate([1, 1, 1]);

    expect(partes.map((parte) => parte.cents)).toEqual([1, 0, 0]);
    expect(Money.sum(partes).cents).toBe(1);
  });

  it('manda o resto para o índice indicado (plataforma no split)', () => {
    const partes = Money.fromCents(100).allocate([1, 1, 1], 2);

    expect(partes.map((parte) => parte.cents)).toEqual([33, 33, 34]);
    expect(Money.sum(partes).cents).toBe(100);
  });

  it('respeita pesos diferentes e peso zero', () => {
    const partes = Money.fromCents(10_000).allocate([70, 30, 0]);

    expect(partes.map((parte) => parte.cents)).toEqual([7000, 3000, 0]);
    expect(Money.sum(partes).cents).toBe(10_000);
  });

  it('fecha a soma exatamente em valores que não dividem', () => {
    for (const total of [1, 7, 33, 999, 100_003]) {
      const partes = Money.fromCents(total).allocate([3, 5, 7, 11]);
      expect(Money.sum(partes).cents, `total ${total}`).toBe(total);
    }
  });

  it('funciona com valor negativo (estorno)', () => {
    const partes = Money.fromCents(-100).allocate([1, 1, 1]);

    expect(Money.sum(partes).cents).toBe(-100);
  });

  it('recusa pesos inválidos', () => {
    expect(() => Money.fromCents(100).allocate([])).toThrow(ValidationError);
    expect(() => Money.fromCents(100).allocate([-1, 2])).toThrow(ValidationError);
    expect(() => Money.fromCents(100).allocate([0, 0])).toThrow(ValidationError);
    expect(() => Money.fromCents(100).allocate([1, 1], 5)).toThrow(ValidationError);
    expect(() => Money.fromCents(100).allocate([1, 1], -1)).toThrow(ValidationError);
    expect(() => Money.fromCents(100).allocate([Number.NaN])).toThrow(ValidationError);
  });
});

describe('Money — comparação e apresentação', () => {
  it('compara e testa igualdade', () => {
    expect(Money.fromCents(100).compare(Money.fromCents(200))).toBe(-1);
    expect(Money.fromCents(200).compare(Money.fromCents(100))).toBe(1);
    expect(Money.fromCents(100).compare(Money.fromCents(100))).toBe(0);
    expect(Money.fromCents(100).equals(Money.fromCents(100))).toBe(true);
    expect(Money.fromCents(100).equals(Money.fromCents(101))).toBe(false);
    expect(Money.fromCents(-1).isNegative()).toBe(true);
    expect(Money.fromCents(1).isNegative()).toBe(false);
  });

  it('formata em pt-BR e serializa de forma estável', () => {
    // o Intl usa espaço não separável entre "R$" e o número, que varia com a versão do ICU
    expect(Money.fromCents(123_456).format().replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(Money.fromCents(150).toJSON()).toEqual({ cents: 150, currency: 'BRL' });
    expect(Money.fromCents(150).toString()).toBe('BRL 1.50');
  });
});
