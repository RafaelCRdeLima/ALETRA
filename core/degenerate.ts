/**
 * Detectar e rotular onde a métrica não serve — nunca travar (D7).
 *
 * E, quando o caso permitir, dizer *qual* dos dois problemas é. A distinção
 * entre singularidade de coordenada (a carta falha, a geometria está bem) e
 * singularidade de curvatura (a geometria diverge de verdade) é um dos erros
 * conceituais mais comuns em relatividade introdutória, e o produto está numa
 * posição rara de poder mostrá-la ao vivo em vez de só descrevê-la.
 *
 * O critério é computável: nos dois casos g degenera, mas só na singularidade de
 * curvatura o K diverge junto. É por isso que a classificação abaixo aproxima o
 * ponto por várias distâncias e olha se |K| cresce ou se acomoda. O teste é
 * heurístico — ele decide por taxa de crescimento, não por prova — e serve para
 * rotular a interface, não para fundamentar uma afirmação matemática.
 */
import { determinant } from './linalg';
import { gaussianCurvature } from './curvature';
import type { ChristoffelFn, MetricFn } from './metric';

export type SingularityKind = 'ok' | 'coordinate' | 'curvature' | 'degenerate';

export interface MetricProbe {
  readonly kind: SingularityKind;
  readonly det: number;
  readonly message: string;
}

/** Abaixo disto, det(g) é indistinguível de zero na escala da própria métrica. */
const DET_THRESHOLD = 1e-9;
/** Escala de g abaixo da qual a métrica é nula para todos os efeitos. */
const NULL_SCALE = 1e-150;
/** Crescimento de |K| por década de aproximação que já conta como divergência. */
const BLOWUP_RATIO = 50;

/**
 * O predicado, num lugar só: a métrica serve aqui?
 *
 * O critério é **positividade** (Sylvester: todos os menores principais líderes
 * positivos), não só det ≠ 0. Isto importa e o caso de Schwarzschild mostra por
 * quê: dentro do horizonte, g_rr = 1/(1-2M/r) fica *negativa*, e o determinante,
 * sendo produto de duas quantidades negativas... continua sendo grande. Um teste
 * só de "det ≈ 0" atravessa a região inteira sem notar nada, porque det não zera
 * nem explode ali de um jeito que um limiar relativo capture. O que quebra é o
 * sinal — a carta deixa de descrever uma superfície, e é isso que precisa ser
 * hachurado.
 *
 * O escopo do projeto é riemanniano (as três métricas de D8 são positivas
 * definidas onde valem), então exigir positividade é o critério correto e não
 * uma aproximação.
 *
 * O limiar é relativo à escala da própria métrica, senão uma métrica em unidades
 * pequenas seria condenada por ser pequena. Mas relativo sozinho não basta: com
 * g ≡ 0 a escala é 0, `scale^k` faz underflow e o teste vira `0 <= 0` — daí o
 * corte absoluto antes do relativo.
 */
function degeneracyOf(g: Float64Array, dim: number): { degenerate: boolean; det: number } {
  let scale = 0;
  for (let i = 0; i < g.length; i++) {
    if (!Number.isFinite(g[i]!)) return { degenerate: true, det: Number.NaN };
    scale = Math.max(scale, Math.abs(g[i]!));
  }
  if (scale < NULL_SCALE) return { degenerate: true, det: 0 };

  const det = determinant(g, dim);
  for (let k = 1; k <= dim; k++) {
    const minor = leadingMinor(g, dim, k);
    if (!Number.isFinite(minor) || minor <= DET_THRESHOLD * Math.pow(scale, k)) {
      return { degenerate: true, det };
    }
  }
  return { degenerate: false, det };
}

/** Determinante do bloco k×k no canto superior esquerdo de g. */
function leadingMinor(g: Float64Array, dim: number, k: number): number {
  if (k === dim) return determinant(g, dim);
  const block = new Float64Array(k * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) block[i * k + j] = g[i * dim + j]!;
  }
  return determinant(block, k);
}

export function probeMetric(
  metric: MetricFn,
  christoffel: ChristoffelFn,
  dim: number,
  x: Float64Array,
): MetricProbe {
  const g = new Float64Array(dim * dim);
  metric(x, g);

  const { degenerate, det } = degeneracyOf(g, dim);
  if (!degenerate) return { kind: 'ok', det, message: '' };

  const kind = classify(metric, christoffel, dim, x);
  return { kind, det, message: messageFor(kind) };
}

/** |K| cresce ao aproximar? Então é curvatura. Se acomoda, é a carta. */
function classify(
  metric: MetricFn,
  christoffel: ChristoffelFn,
  dim: number,
  x: Float64Array,
): SingularityKind {
  if (dim !== 2) return 'degenerate';

  const distances = [1e-1, 1e-2, 1e-3];
  const samples: number[] = [];
  const probe = new Float64Array(dim);

  for (const delta of distances) {
    let best = Number.NaN;
    for (let axis = 0; axis < dim; axis++) {
      for (const sign of [1, -1]) {
        probe.set(x);
        probe[axis] = x[axis]! + sign * delta * Math.max(1, Math.abs(x[axis]!));
        const k = gaussianCurvature(metric, christoffel, probe);
        if (Number.isFinite(k) && (Number.isNaN(best) || Math.abs(k) > Math.abs(best))) {
          best = k;
        }
      }
    }
    if (Number.isFinite(best)) samples.push(Math.abs(best));
  }

  if (samples.length < 2) return 'degenerate';
  const far = samples[0]!;
  const near = samples[samples.length - 1]!;
  if (far < 1e-12) return near > 1e-6 ? 'curvature' : 'coordinate';
  return near / far > BLOWUP_RATIO ? 'curvature' : 'coordinate';
}

function messageFor(kind: SingularityKind): string {
  switch (kind) {
    case 'coordinate':
      return (
        'Aqui a carta deixa de funcionar, mas a superfície não tem nada de especial ' +
        'neste ponto: é uma singularidade de coordenada. Outra escolha de coordenadas ' +
        'atravessaria sem tropeço.'
      );
    case 'curvature':
      return (
        'Aqui a curvatura diverge de verdade. Não é a carta que falha, é a geometria — ' +
        'nenhuma mudança de coordenadas conserta este ponto.'
      );
    default:
      return (
        'Aqui a métrica deixa de ser positiva definida: esta região da carta não ' +
        'descreve uma superfície, e não há o que medir nela.'
      );
  }
}

export interface ChartBounds {
  readonly min: readonly number[];
  readonly max: readonly number[];
}

/**
 * Máscara de degeneração sobre a região visível da carta, para hachurar o painel
 * 2D. Só marca "serve / não serve" — classificar cada célula custaria uma
 * curvatura por célula, e a classificação só interessa onde o aluno esbarrar.
 */
export function degeneracyMask(
  metric: MetricFn,
  dim: number,
  bounds: ChartBounds,
  resolution: number,
): Uint8Array {
  const mask = new Uint8Array(resolution * resolution);
  const g = new Float64Array(dim * dim);
  const x = new Float64Array(dim);

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      x[0] = lerp(bounds.min[0]!, bounds.max[0]!, col / (resolution - 1));
      x[1] = lerp(bounds.min[1]!, bounds.max[1]!, row / (resolution - 1));
      metric(x, g);
      mask[row * resolution + col] = degeneracyOf(g, dim).degenerate ? 1 : 0;
    }
  }
  return mask;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
