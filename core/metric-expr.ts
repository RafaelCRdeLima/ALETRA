/**
 * Da expressão digitada para uma MetricFn utilizável.
 *
 * Os componentes vêm como o triângulo superior em ordem row-major — para dim 2,
 * [g₀₀, g₀₁, g₁₁] — porque a métrica é simétrica e pedir g₁₀ de novo só criaria
 * a chance de o aluno digitar dois valores incompatíveis.
 */
import type { Chart } from './chart';
import { evaluateNode, ParseError, parse, type Node } from './expr';
import type { MetricFn } from './metric';

export interface MetricSource {
  readonly chart: Chart;
  readonly components: readonly string[];
}

/** Quantas expressões o triângulo superior de uma métrica dim×dim precisa. */
export function upperTriangleCount(dim: number): number {
  return (dim * (dim + 1)) / 2;
}

/** Par de índices (i, j) do componente `index` do triângulo superior. */
export function componentIndices(dim: number, index: number): [number, number] {
  let k = 0;
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      if (k === index) return [i, j];
      k++;
    }
  }
  throw new Error(`componente ${index} não existe em dimensão ${dim}`);
}

/** Rótulo legível do componente, ex. "g_θφ" — usa os símbolos de tela da carta. */
export function componentLabel(chart: Chart, index: number): string {
  const [i, j] = componentIndices(chart.dim, index);
  return `g_${chart.symbols[i]}${chart.symbols[j]}`;
}

/**
 * Compila as expressões numa MetricFn. Erros de parse sobem com o nome do
 * componente na frente, porque "erro em g_θφ: não conheço 'sen'" é acionável e
 * "SyntaxError at 4" não é.
 */
export function compileMetric(source: MetricSource): MetricFn {
  const { chart, components } = source;
  const expected = upperTriangleCount(chart.dim);
  if (components.length !== expected) {
    throw new Error(
      `uma métrica em dimensão ${chart.dim} precisa de ${expected} componentes, ` +
        `recebi ${components.length}`,
    );
  }

  const trees: Node[] = components.map((text, index) => {
    try {
      return parse(text, chart.names);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new ParseError(
          `erro em ${componentLabel(chart, index)}: ${error.message}`,
          error.position,
        );
      }
      throw error;
    }
  });

  const n = chart.dim;
  return (x, out) => {
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const value = evaluateNode(trees[k]!, x);
        out[i * n + j] = value;
        out[j * n + i] = value;
        k++;
      }
    }
  };
}
