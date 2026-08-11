/**
 * Christoffels por diferença central sobre g (D5).
 *
 *   Γ^a_bc = ½ g^ad (∂_b g_dc + ∂_c g_db - ∂_d g_bc)
 *
 * O passo h fica entre 1e-5 e 1e-6, relativo à escala da coordenada: a
 * heurística h ~ √ε daria ~1e-8 para a derivada isolada, mas o resultado ainda
 * passa por mais uma camada de álgebra antes de virar pixel, e um passo um pouco
 * maior é mais robusto sem custar precisão visível. h não é exposto na interface
 * — é parâmetro de engenharia, não conceito pedagógico.
 */
import type { ChristoffelFn, MetricFn } from './metric';

export const DEFAULT_H = 1e-5;

export function christoffelFromMetric(
  metric: MetricFn,
  dim: number,
  h = DEFAULT_H,
): ChristoffelFn {
  const n = dim;
  const g = new Float64Array(n * n);
  const gPlus = new Float64Array(n * n);
  const gMinus = new Float64Array(n * n);
  const gInv = new Float64Array(n * n);
  /** dg[(b·n + d)·n + c] = ∂_b g_dc */
  const dg = new Float64Array(n * n * n);
  const probe = new Float64Array(n);

  return (x, out) => {
    metric(x, g);
    invert(g, n, gInv);

    for (let b = 0; b < n; b++) {
      const step = h * Math.max(1, Math.abs(x[b]!));
      probe.set(x);
      probe[b] = x[b]! + step;
      metric(probe, gPlus);
      probe[b] = x[b]! - step;
      metric(probe, gMinus);

      const denom = 2 * step;
      for (let d = 0; d < n; d++) {
        for (let c = 0; c < n; c++) {
          dg[(b * n + d) * n + c] = (gPlus[d * n + c]! - gMinus[d * n + c]!) / denom;
        }
      }
    }

    out.fill(0);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        for (let c = 0; c < n; c++) {
          let sum = 0;
          for (let d = 0; d < n; d++) {
            sum +=
              gInv[a * n + d]! *
              (dg[(b * n + d) * n + c]! + dg[(c * n + d) * n + b]! - dg[(d * n + b) * n + c]!);
          }
          out[(a * n + b) * n + c] = 0.5 * sum;
        }
      }
    }
  };
}

/** Determinante de uma matriz n×n row-major (n ≤ 3, o escopo do projeto). */
export function determinant(m: Float64Array, n: number): number {
  if (n === 1) return m[0]!;
  if (n === 2) return m[0]! * m[3]! - m[1]! * m[2]!;
  if (n === 3) {
    return (
      m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
      m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
      m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
    );
  }
  throw new Error(`dimensão ${n} fora do escopo do projeto`);
}

/** Inversa por Gauss-Jordan. Devolve tudo NaN se a matriz for singular. */
export function invert(m: Float64Array, n: number, out: Float64Array): void {
  const a = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i * 2 * n + j] = m[i * n + j]!;
    a[i * 2 * n + n + i] = 1;
  }

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row * 2 * n + col]!) > Math.abs(a[pivot * 2 * n + col]!)) pivot = row;
    }
    if (!Number.isFinite(a[pivot * 2 * n + col]!) || Math.abs(a[pivot * 2 * n + col]!) < 1e-300) {
      out.fill(Number.NaN);
      return;
    }
    if (pivot !== col) {
      for (let k = 0; k < 2 * n; k++) {
        const tmp = a[col * 2 * n + k]!;
        a[col * 2 * n + k] = a[pivot * 2 * n + k]!;
        a[pivot * 2 * n + k] = tmp;
      }
    }
    const diag = a[col * 2 * n + col]!;
    for (let k = 0; k < 2 * n; k++) a[col * 2 * n + k] /= diag;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row * 2 * n + col]!;
      if (factor === 0) continue;
      for (let k = 0; k < 2 * n; k++) a[row * 2 * n + k] -= factor * a[col * 2 * n + k]!;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i * n + j] = a[i * 2 * n + n + j]!;
  }
}
