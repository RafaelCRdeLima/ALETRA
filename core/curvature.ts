/**
 * Curvatura gaussiana a partir do tensor de Riemann construído sobre os
 * Christoffels.
 *
 *   R^a_bcd = ∂_c Γ^a_db - ∂_d Γ^a_cb + Γ^a_ce Γ^e_db - Γ^a_de Γ^e_cb
 *   K = R_0101 / det(g)
 *
 * Este é o teste de regressão forte de D8: qualquer bug na cadeia de derivadas
 * aparece como K variando no espaço onde deveria ser constante. É também a
 * derivada de segunda ordem do projeto — ∂Γ é diferença finita de algo que já é
 * diferença finita — então o passo aqui é maior que o de D5 de propósito: com
 * dois níveis de FD encadeados, o ruído de arredondamento do nível de dentro
 * é dividido pelo passo de fora, e h ~ 1e-4 equilibra melhor que h ~ 1e-5.
 */
import { determinant } from './christoffel-fd';
import { christoffelIndex, type ChristoffelFn, type MetricFn } from './metric';

export const DEFAULT_H_CURVATURE = 1e-4;

export function gaussianCurvature(
  metric: MetricFn,
  christoffel: ChristoffelFn,
  x: Float64Array,
  h = DEFAULT_H_CURVATURE,
): number {
  const n = 2; // curvatura gaussiana é uma noção de superfície
  const g = new Float64Array(n * n);
  metric(x, g);

  const gamma = new Float64Array(n * n * n);
  christoffel(x, gamma);

  /** dGamma[c][a][b] = ∂_c Γ^a_?b — indexado por [(c·n + a)·n·n + b·n + d] abaixo. */
  const plus = new Float64Array(n * n * n);
  const minus = new Float64Array(n * n * n);
  const dGamma = new Float64Array(n * n * n * n);
  const probe = new Float64Array(n);

  for (let c = 0; c < n; c++) {
    const step = h * Math.max(1, Math.abs(x[c]!));
    probe.set(x);
    probe[c] = x[c]! + step;
    christoffel(probe, plus);
    probe[c] = x[c]! - step;
    christoffel(probe, minus);
    const denom = 2 * step;
    for (let i = 0; i < n * n * n; i++) {
      dGamma[c * n * n * n + i] = (plus[i]! - minus[i]!) / denom;
    }
  }

  const dG = (c: number, a: number, b: number, d: number): number =>
    dGamma[c * n * n * n + christoffelIndex(n, a, b, d)]!;
  const G = (a: number, b: number, c: number): number => gamma[christoffelIndex(n, a, b, c)]!;

  // R^a_101, para a = 0 e 1.
  const riemannUp = [0, 0];
  for (let a = 0; a < n; a++) {
    let value = dG(0, a, 1, 1) - dG(1, a, 0, 1);
    for (let e = 0; e < n; e++) {
      value += G(a, 0, e) * G(e, 1, 1) - G(a, 1, e) * G(e, 0, 1);
    }
    riemannUp[a] = value;
  }

  const r0101 = g[0]! * riemannUp[0]! + g[1]! * riemannUp[1]!;
  return r0101 / determinant(g, n);
}
