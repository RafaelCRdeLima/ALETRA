/**
 * Assinaturas do motor geométrico.
 *
 * Na Etapa 1 as duas são preenchidas por fórmula fechada (D6); na Etapa 2 a
 * mesma assinatura passa a ser preenchida por diferença finita sobre uma métrica
 * digitada (D5). Trocar a implementação não deve tocar em nada rio abaixo.
 */

/**
 * Preenche `out` com g_ij no ponto `x`.
 * `out` tem dim×dim entradas, row-major: g_ij fica em `out[i * dim + j]`.
 */
export type MetricFn = (x: Float64Array, out: Float64Array) => void;

/**
 * Preenche `out` com Γ^a_bc no ponto `x`.
 * `out` tem dim³ entradas: Γ^a_bc fica em `out[(a * dim + b) * dim + c]`.
 */
export type ChristoffelFn = (x: Float64Array, out: Float64Array) => void;

/** Índice de Γ^a_bc no layout linear acima. */
export function christoffelIndex(dim: number, a: number, b: number, c: number): number {
  return (a * dim + b) * dim + c;
}

/** Norma ao quadrado de um vetor tangente na métrica: g_ij v^i v^j. */
export function normSquared(g: Float64Array, v: Float64Array, dim: number): number {
  let total = 0;
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      total += g[i * dim + j]! * v[i]! * v[j]!;
    }
  }
  return total;
}
