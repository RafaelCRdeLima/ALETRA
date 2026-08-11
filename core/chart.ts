/**
 * Uma carta de coordenadas: a dimensão e os nomes dos eixos.
 *
 * `dim` é sempre lido daqui, nunca escrito como literal no resto do código (D12).
 * O escopo do projeto limita `dim` a 2 ou 3.
 */
export interface Chart {
  readonly dim: number;
  readonly names: readonly string[];
}

export function chart(names: readonly string[]): Chart {
  return { dim: names.length, names: [...names] };
}

/** Aloca um vetor de componentes zerado para esta carta. */
export function zeros(chart: Chart): Float64Array {
  return new Float64Array(chart.dim);
}
