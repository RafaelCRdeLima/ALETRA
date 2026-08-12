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
import { invert } from './linalg';
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

