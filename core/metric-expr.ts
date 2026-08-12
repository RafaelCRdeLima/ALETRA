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
/**
 * Compila uma lista de expressões com a gramática fechada de D4, nomeando o
 * componente que falhou.
 *
 * "erro em g_θφ: não conheço 'sen'" é acionável; "SyntaxError at 4" não é. O
 * rótulo vem de fora porque o mesmo compilador serve à métrica, à 1-form digitada
 * da Etapa 6 e à função de que ela é o diferencial.
 */
function compilarExpressoes(
  chart: Chart,
  textos: readonly string[],
  rotulo: (indice: number) => string,
): Node[] {
  return textos.map((text, index) => {
    try {
      return parse(text, chart.names);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new ParseError(`erro em ${rotulo(index)}: ${error.message}`, error.position);
      }
      throw error;
    }
  });
}

/**
 * Uma 0-form digitada: um número em cada ponto.
 *
 * A Etapa 6 precisa disto porque d de componentes constantes é zero — para haver
 * derivada exterior, ω tem de ser um *campo*. E um campo que o aluno digita passa
 * exatamente pelo mesmo parser da métrica, então nenhuma superfície de ataque
 * nova entra com aquela etapa.
 */
export function compileScalar(chart: Chart, texto: string): (x: Float64Array) => number {
  const [arvore] = compilarExpressoes(chart, [texto], () => 'f');
  return (x) => evaluateNode(arvore!, x);
}

/** Uma 1-form digitada como campo: componentes em cada ponto. */
export function compileFormField(
  chart: Chart,
  componentes: readonly string[],
): (x: Float64Array, out: Float64Array) => void {
  const arvores = compilarExpressoes(
    chart,
    componentes,
    (i) => `ω_${chart.symbols[i] ?? i}`,
  );
  return (x, out) => {
    for (let i = 0; i < arvores.length; i++) out[i] = evaluateNode(arvores[i]!, x);
  };
}

export function compileMetric(source: MetricSource): MetricFn {
  const { chart, components } = source;
  const expected = upperTriangleCount(chart.dim);
  if (components.length !== expected) {
    throw new Error(
      `uma métrica em dimensão ${chart.dim} precisa de ${expected} componentes, ` +
        `recebi ${components.length}`,
    );
  }

  const trees = compilarExpressoes(chart, components, (i) => componentLabel(chart, i));

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
