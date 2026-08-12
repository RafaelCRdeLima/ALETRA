/**
 * Geodésicas: a linha mais reta possível que a superfície permite.
 *
 *   d²x^a/dλ² = -Γ^a_bc (dx^b/dλ)(dx^c/dλ)
 *
 * Escrita como sistema de primeira ordem em (x, v) e integrada por RK4 de passo
 * fixo (D5). O integrador chegou na Etapa 7 para os fluxos do colchete; aqui ele
 * é reaproveitado, que era o plano desde o começo — só a ordem das etapas
 * inverteu.
 *
 * ## Parar é conteúdo, não erro
 *
 * Uma geodésica pode sair da carta ou chegar onde a métrica degenera. D7 diz que
 * o produto detecta e rotula em vez de travar, e este é o caso de uso mais
 * direto disso: uma geodésica de Schwarzschild dirigida a r=2M para no horizonte,
 * e o motivo da parada é a lição — a carta acabou, não a geometria.
 */
import { determinant } from './linalg';
import type { ChristoffelFn, MetricFn } from './metric';
import { christoffelIndex, normSquared } from './metric';

export type MotivoDaParada = 'completa' | 'fora-da-carta' | 'metrica-degenerada';

export interface Geodesica {
  readonly caminho: Float64Array[];
  readonly velocidades: Float64Array[];
  readonly motivo: MotivoDaParada;
  /** Comprimento de arco integrado, ∫|v|_g dλ. */
  readonly comprimento: number;
  /** Maior desvio relativo de |v|_g ao longo do caminho — deve ficar em zero. */
  readonly desvioDeNorma: number;
}

export interface OpcoesGeodesica {
  readonly passos: number;
  readonly dLambda: number;
  readonly limites?: { readonly min: readonly number[]; readonly max: readonly number[] };
}

/** Aceleração geodésica: -Γ^a_bc v^b v^c. */
function aceleracao(
  gamma: Float64Array,
  v: Float64Array,
  dim: number,
  out: Float64Array,
): void {
  for (let a = 0; a < dim; a++) {
    let soma = 0;
    for (let b = 0; b < dim; b++) {
      for (let c = 0; c < dim; c++) {
        soma += gamma[christoffelIndex(dim, a, b, c)]! * v[b]! * v[c]!;
      }
    }
    out[a] = -soma;
  }
}

/** A métrica serve aqui? Mesmo critério de D7, sem o custo de classificar. */
function utilizavel(metric: MetricFn, x: Float64Array, dim: number): boolean {
  const g = new Float64Array(dim * dim);
  metric(x, g);
  let escala = 0;
  for (let i = 0; i < g.length; i++) {
    if (!Number.isFinite(g[i]!)) return false;
    escala = Math.max(escala, Math.abs(g[i]!));
  }
  if (escala < 1e-150) return false;
  const det = determinant(g, dim);
  return Number.isFinite(det) && det > 1e-9 * Math.pow(escala, dim) && g[0]! > 0;
}

export function traceGeodesic(
  metric: MetricFn,
  christoffel: ChristoffelFn,
  x0: Float64Array,
  v0: Float64Array,
  dim: number,
  opcoes: OpcoesGeodesica,
): Geodesica {
  const { passos, dLambda, limites } = opcoes;

  const caminho: Float64Array[] = [Float64Array.from(x0)];
  const velocidades: Float64Array[] = [Float64Array.from(v0)];

  const g = new Float64Array(dim * dim);
  metric(x0, g);
  const normaInicial = Math.sqrt(Math.max(0, normSquared(g, v0, dim)));

  const gamma = new Float64Array(dim * dim * dim);
  const kx = [0, 1, 2, 3].map(() => new Float64Array(dim));
  const kv = [0, 1, 2, 3].map(() => new Float64Array(dim));
  const tx = new Float64Array(dim);
  const tv = new Float64Array(dim);

  /** Um estágio de RK4: dx/dλ = v, dv/dλ = -Γvv. */
  const estagio = (x: Float64Array, v: Float64Array, i: number): void => {
    christoffel(x, gamma);
    kx[i]!.set(v);
    aceleracao(gamma, v, dim, kv[i]!);
  };

  let comprimento = 0;
  let desvioDeNorma = 0;
  let motivo: MotivoDaParada = 'completa';

  for (let n = 0; n < passos; n++) {
    const x = caminho[caminho.length - 1]!;
    const v = velocidades[velocidades.length - 1]!;

    estagio(x, v, 0);
    for (const [i, peso] of [
      [1, 0.5],
      [2, 0.5],
      [3, 1],
    ] as const) {
      for (let d = 0; d < dim; d++) {
        tx[d] = x[d]! + peso * dLambda * kx[i - 1]![d]!;
        tv[d] = v[d]! + peso * dLambda * kv[i - 1]![d]!;
      }
      if (!utilizavel(metric, tx, dim)) {
        motivo = 'metrica-degenerada';
        break;
      }
      estagio(tx, tv, i);
    }
    if (motivo !== 'completa') break;

    const proximoX = new Float64Array(dim);
    const proximoV = new Float64Array(dim);
    for (let d = 0; d < dim; d++) {
      proximoX[d] =
        x[d]! + (dLambda / 6) * (kx[0]![d]! + 2 * kx[1]![d]! + 2 * kx[2]![d]! + kx[3]![d]!);
      proximoV[d] =
        v[d]! + (dLambda / 6) * (kv[0]![d]! + 2 * kv[1]![d]! + 2 * kv[2]![d]! + kv[3]![d]!);
    }

    if (limites && foraDosLimites(proximoX, limites, dim)) {
      motivo = 'fora-da-carta';
      break;
    }
    if (!utilizavel(metric, proximoX, dim)) {
      motivo = 'metrica-degenerada';
      break;
    }

    metric(proximoX, g);
    const norma = Math.sqrt(Math.max(0, normSquared(g, proximoV, dim)));
    if (normaInicial > 1e-12) {
      desvioDeNorma = Math.max(desvioDeNorma, Math.abs(norma - normaInicial) / normaInicial);
    }
    comprimento += norma * dLambda;

    caminho.push(proximoX);
    velocidades.push(proximoV);
  }

  return { caminho, velocidades, motivo, comprimento, desvioDeNorma };
}

function foraDosLimites(
  x: Float64Array,
  limites: { readonly min: readonly number[]; readonly max: readonly number[] },
  dim: number,
): boolean {
  for (let i = 0; i < dim; i++) {
    if (x[i]! < limites.min[i]! || x[i]! > limites.max[i]!) return true;
  }
  return false;
}

/**
 * Desvio geodésico: duas geodésicas que partem quase paralelas.
 *
 * A separação entre elas cresce onde K < 0 e encolhe onde K > 0 — é a curvatura
 * lida como um efeito sobre trajetórias, e não como um número abstrato. É por
 * isso que a etapa desenha duas e não uma.
 */
export interface Desvio {
  readonly principal: Geodesica;
  readonly vizinha: Geodesica;
  /** Separação métrica em cada passo comum às duas. */
  readonly separacoes: number[];
}

export function geodesicDeviation(
  metric: MetricFn,
  christoffel: ChristoffelFn,
  x0: Float64Array,
  v0: Float64Array,
  offset: Float64Array,
  dim: number,
  opcoes: OpcoesGeodesica,
): Desvio {
  const principal = traceGeodesic(metric, christoffel, x0, v0, dim, opcoes);

  const inicioVizinho = new Float64Array(dim);
  for (let i = 0; i < dim; i++) inicioVizinho[i] = x0[i]! + offset[i]!;
  const vizinha = traceGeodesic(metric, christoffel, inicioVizinho, v0, dim, opcoes);

  const g = new Float64Array(dim * dim);
  const delta = new Float64Array(dim);
  const separacoes: number[] = [];
  const comum = Math.min(principal.caminho.length, vizinha.caminho.length);

  for (let n = 0; n < comum; n++) {
    const a = principal.caminho[n]!;
    const b = vizinha.caminho[n]!;
    for (let i = 0; i < dim; i++) delta[i] = b[i]! - a[i]!;
    metric(a, g);
    separacoes.push(Math.sqrt(Math.max(0, normSquared(g, delta, dim))));
  }
  return { principal, vizinha, separacoes };
}
