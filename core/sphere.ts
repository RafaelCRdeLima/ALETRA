/**
 * A esfera de raio R em coordenadas (θ, φ) — o caso padrão-ouro da Etapa 1 (D6)
 * e o primeiro dos três casos de teste de D8.
 *
 * Aqui os Christoffels são a fórmula fechada, deliberadamente: a Etapa 1 testa
 * se a linguagem visual funciona, não se o motor numérico é geral. A diferença
 * finita entra na Etapa 2, e estes valores viram o padrão contra o qual ela é
 * medida.
 *
 *   x = (θ, φ),  θ ∈ (0, π),  φ ∈ [0, 2π)
 *   g_θθ = R²,   g_φφ = R² sin²θ,   g_θφ = 0
 */
import { chart, type Chart } from './chart';
import { christoffelIndex, type ChristoffelFn, type MetricFn } from './metric';

export const SPHERE_CHART: Chart = chart(['theta', 'phi']);

const DIM = SPHERE_CHART.dim;

export function sphereMetric(R: number): MetricFn {
  return (x, out) => {
    const s = Math.sin(x[0]!);
    out[0] = R * R;
    out[1] = 0;
    out[2] = 0;
    out[3] = R * R * s * s;
  };
}

/**
 * Γ^θ_φφ = -sinθ cosθ,  Γ^φ_θφ = Γ^φ_φθ = cotθ,  resto zero.
 * Independe de R — o fator R² da métrica cancela na fórmula do Christoffel.
 */
export function sphereChristoffel(): ChristoffelFn {
  return (x, out) => {
    out.fill(0);
    const theta = x[0]!;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    out[christoffelIndex(DIM, 0, 1, 1)] = -s * c;
    out[christoffelIndex(DIM, 1, 0, 1)] = c / s;
    out[christoffelIndex(DIM, 1, 1, 0)] = c / s;
  };
}

/** Curvatura gaussiana: constante 1/R² em toda parte. */
export function sphereCurvature(R: number): number {
  return 1 / (R * R);
}

/** Mergulho em ℝ³: out ← R(sinθ cosφ, sinθ sinφ, cosθ). */
export function sphereEmbed(R: number, x: Float64Array, out: Float64Array): void {
  const [theta, phi] = [x[0]!, x[1]!];
  const s = Math.sin(theta);
  out[0] = R * s * Math.cos(phi);
  out[1] = R * s * Math.sin(phi);
  out[2] = R * Math.cos(theta);
}

/**
 * Base coordenada do plano tangente, empurrada para ℝ³.
 * `out` recebe 6 entradas: e_θ em [0..2], e_φ em [3..5].
 *
 * Por construção |e_θ|² = g_θθ e |e_φ|² = g_φφ — é o que amarra o desenho em ℝ³
 * à métrica, e o que o teste de consistência verifica.
 */
export function sphereBasis(R: number, x: Float64Array, out: Float64Array): void {
  const [theta, phi] = [x[0]!, x[1]!];
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);

  out[0] = R * ct * cp;
  out[1] = R * ct * sp;
  out[2] = -R * st;

  out[3] = -R * st * sp;
  out[4] = R * st * cp;
  out[5] = 0;
}

/** Normal unitária à superfície em ℝ³ (a direção radial). */
export function sphereNormal(x: Float64Array, out: Float64Array): void {
  const [theta, phi] = [x[0]!, x[1]!];
  const s = Math.sin(theta);
  out[0] = s * Math.cos(phi);
  out[1] = s * Math.sin(phi);
  out[2] = Math.cos(theta);
}

/**
 * Converte um ponto de ℝ³ na esfera para (θ, φ).
 * Usado só pelo arraste — o raycast devolve ℝ³, o estado guarda a carta.
 */
export function sphereChartOf(p: readonly number[], out: Float64Array): void {
  const [px, py, pz] = [p[0]!, p[1]!, p[2]!];
  const r = Math.hypot(px, py, pz);
  out[0] = Math.acos(Math.min(1, Math.max(-1, pz / r)));
  out[1] = Math.atan2(py, px);
}
