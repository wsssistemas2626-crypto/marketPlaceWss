/**
 * Arredondamento *half-even* (bancário): empates vão para o inteiro par.
 *
 * É o exigido pela RN-FIN-03. `Math.round` é *half-up* e enviesa a soma de
 * muitos itens para cima — inaceitável em cálculo de comissão e split.
 */
export function roundHalfEven(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundHalfEven espera um número finito, recebeu ${value}`);
  }

  const floor = Math.floor(value);
  const remainder = value - floor;

  if (remainder > 0.5) return floor + 1;
  if (remainder < 0.5) return floor;
  // empate exato: fica no vizinho par
  return floor % 2 === 0 ? floor : floor + 1;
}
