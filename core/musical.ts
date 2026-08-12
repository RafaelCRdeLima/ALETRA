/**
 * Os isomorfismos musicais: ♭ desce o índice, ♯ sobe.
 *
 *   v♭_i = g_ij v^j        ω♯^i = g^ij ω_j
 *
 * O ponto pedagógico da Etapa 3 não é a fórmula, é o que ela revela: `v` e `v♭`
 * são o **mesmo objeto** em duas notações, e a diferença entre as duas só é
 * visível porque a métrica não é euclidiana. Onde g = δ os componentes coincidem
 * número a número — ♭ vira a identidade, e é por isso que quem só trabalhou em
 * ℝⁿ com produto interno padrão nunca precisou distinguir vetor de covetor.
 *
 * É a métrica que faz a distinção existir. Por isso a esfera é o cenário certo
 * para mostrá-la, e o plano euclidiano é o controle experimental.
 */
import { invert } from './linalg';
import { form, type Form } from './forms';
import type { MetricFn } from './metric';

/** v♭_i = g_ij v^j — de vetor para 1-form. */
export function flat(g: Float64Array, v: Float64Array, dim: number, out: Float64Array): Float64Array {
  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (let j = 0; j < dim; j++) sum += g[i * dim + j]! * v[j]!;
    out[i] = sum;
  }
  return out;
}

/** ω♯^i = g^ij ω_j — de 1-form para vetor. Recebe a métrica **inversa**. */
export function sharp(
  gInverse: Float64Array,
  omega: Float64Array,
  dim: number,
  out: Float64Array,
): Float64Array {
  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (let j = 0; j < dim; j++) sum += gInverse[i * dim + j]! * omega[j]!;
    out[i] = sum;
  }
  return out;
}

/**
 * v♭ como uma 1-form pronta para desenhar.
 *
 * Devolver um `Form` e não um array solto importa: o resto do produto já sabe
 * desenhar 1-forms e contrair com elas, então v♭ entra pela mesma porta que ω e
 * ganha de graça a pilha, o véu e a contagem. É o dividendo do layout de D12.
 */
export function flatForm(metric: MetricFn, x: Float64Array, v: Float64Array, dim: number): Form {
  const g = new Float64Array(dim * dim);
  metric(x, g);
  const components = new Float64Array(dim);
  flat(g, v, dim, components);
  return form(dim, 1, Array.from(components));
}

/** ω♯ como vetor, a partir da métrica no ponto. */
export function sharpVector(
  metric: MetricFn,
  x: Float64Array,
  omega: Float64Array,
  dim: number,
  out: Float64Array,
): Float64Array {
  const g = new Float64Array(dim * dim);
  metric(x, g);
  const gInverse = new Float64Array(dim * dim);
  invert(g, dim, gInverse);
  return sharp(gInverse, omega, dim, out);
}
