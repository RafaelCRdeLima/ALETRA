/**
 * Campos de Killing: as direções em que a geometria não muda.
 *
 * Um campo ξ é de Killing quando arrastar tudo ao longo do fluxo dele é uma
 * isometria — comprimentos e ângulos sobrevivem à viagem. A condição é
 * ℒ_ξ g = 0, e a Lie derivada da métrica mede exatamente a taxa com que os
 * comprimentos mudam sob o fluxo.
 *
 * ## Por que isto entra num programa de geometria e não de física
 *
 * Porque é onde as duas se encontram, e o encontro tem nome: **se ξ é de
 * Killing, ⟨ξ, u⟩ é constante ao longo de toda geodésica**. É assim que se
 * resolve uma órbita. Na fatia equatorial de Schwarzschild, ξ = ∂_φ dá
 * L = r²·(dφ/dλ), o momento angular; na esfera, sen²θ·(dφ/dλ), que é a relação
 * de Clairaut. O aluno que sai daqui sabendo o que é curvatura e não sabendo
 * disso ainda não sabe resolver nada.
 *
 * ## Um cuidado que o desenho precisa carregar
 *
 * O defeito é **pontual**. ∂_θ na esfera tem defeito 2·|cotg θ|, que zera no
 * equador — ali, mexer em θ não muda sen²θ em primeira ordem. Um número zero na
 * tela não quer dizer "campo de Killing", quer dizer "de Killing aqui". Por
 * isso `worstKillingDefect` existe: a diferença entre as duas afirmações é o
 * conteúdo, e não um detalhe de implementação.
 */
import { degeneracyOf } from './degenerate';
import type { VectorField } from './flow';
import { flow } from './flow';
import { invert } from './linalg';
import type { MetricFn } from './metric';

/** O passo das diferenças finitas, na mesma faixa de D5. */
export const DEFAULT_H_KILLING = 1e-5;

const passoDe = (h: number, valor: number): number => h * Math.max(1, Math.abs(valor));

/**
 * (ℒ_ξ g)_ij = ξ^k ∂_k g_ij + g_kj ∂_i ξ^k + g_ik ∂_j ξ^k
 *
 * Os dois últimos termos são o que distingue esta conta de "derivar g na
 * direção de ξ": o fluxo não só leva o ponto, ele também roda e estica a base
 * coordenada, e o que a métrica sente é a soma das três coisas.
 */
export function lieDerivativeMetric(
  metric: MetricFn,
  xi: VectorField,
  x: Float64Array,
  dim: number,
  out: Float64Array,
  h = DEFAULT_H_KILLING,
): void {
  const g = new Float64Array(dim * dim);
  const gMais = new Float64Array(dim * dim);
  const gMenos = new Float64Array(dim * dim);
  const campo = new Float64Array(dim);
  const campoMais = new Float64Array(dim);
  const campoMenos = new Float64Array(dim);
  const probe = Float64Array.from(x);

  metric(x, g);
  xi(x, campo);

  // ∂_k g_ij e ∂_k ξ^i, os dois por diferença central no mesmo passo.
  const dg = new Float64Array(dim * dim * dim); // dg[k][i][j]
  const dxi = new Float64Array(dim * dim); // dxi[k][i]
  for (let k = 0; k < dim; k++) {
    const passo = passoDe(h, x[k]!);
    probe[k] = x[k]! + passo;
    metric(probe, gMais);
    xi(probe, campoMais);
    probe[k] = x[k]! - passo;
    metric(probe, gMenos);
    xi(probe, campoMenos);
    probe[k] = x[k]!;

    for (let i = 0; i < dim * dim; i++) {
      dg[k * dim * dim + i] = (gMais[i]! - gMenos[i]!) / (2 * passo);
    }
    for (let i = 0; i < dim; i++) {
      dxi[k * dim + i] = (campoMais[i]! - campoMenos[i]!) / (2 * passo);
    }
  }

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      let soma = 0;
      for (let k = 0; k < dim; k++) {
        soma += campo[k]! * dg[k * dim * dim + i * dim + j]!;
        soma += g[k * dim + j]! * dxi[i * dim + k]!;
        soma += g[i * dim + k]! * dxi[j * dim + k]!;
      }
      out[i * dim + j] = soma;
    }
  }
}

/**
 * ‖ℒ_ξ g‖ = √(g^ik g^jl (ℒ_ξ g)_ij (ℒ_ξ g)_kl), zero exatamente onde ξ é de
 * Killing.
 *
 * A norma é tomada **com a métrica**, e não somando quadrados das componentes:
 * a segunda dependeria da carta, e um número que muda ao trocar de coordenadas
 * não pode ser a resposta a "esta simetria existe?".
 */
export function killingDefect(
  metric: MetricFn,
  xi: VectorField,
  x: Float64Array,
  dim: number,
  h = DEFAULT_H_KILLING,
): number {
  const g = new Float64Array(dim * dim);
  const gInv = new Float64Array(dim * dim);
  const L = new Float64Array(dim * dim);
  metric(x, g);
  invert(g, dim, gInv);
  lieDerivativeMetric(metric, xi, x, dim, L, h);

  let soma = 0;
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      for (let k = 0; k < dim; k++) {
        for (let l = 0; l < dim; l++) {
          soma += gInv[i * dim + k]! * gInv[j * dim + l]! * L[i * dim + j]! * L[k * dim + l]!;
        }
      }
    }
  }
  return Math.sqrt(Math.max(0, soma));
}

/**
 * O maior defeito numa varredura da carta — o que separa "de Killing aqui" de
 * "campo de Killing".
 *
 * Amostra as bordas junto com o interior de propósito: numa carta cujo interior
 * é bem-comportado, é perto da borda que a simetria costuma falhar.
 *
 * Pontos onde a métrica degenera ficam de fora, pelo mesmo critério que D7 usa
 * para hachurar: nos polos da esfera g_φφ = 0, a inversa explode e o pior
 * defeito saía 1,6e16 — um número sobre a carta ter acabado, e não sobre a
 * simetria existir.
 */
export function worstKillingDefect(
  metric: MetricFn,
  xi: VectorField,
  bounds: { readonly min: readonly number[]; readonly max: readonly number[] },
  dim: number,
  resolucao = 12,
  h = DEFAULT_H_KILLING,
): number {
  const x = new Float64Array(dim);
  const g = new Float64Array(dim * dim);
  let pior = 0;
  for (let a = 0; a <= resolucao; a++) {
    for (let b = 0; b <= resolucao; b++) {
      x[0] = bounds.min[0]! + ((bounds.max[0]! - bounds.min[0]!) * a) / resolucao;
      x[1] = bounds.min[1]! + ((bounds.max[1]! - bounds.min[1]!) * b) / resolucao;
      metric(x, g);
      if (degeneracyOf(g, dim).degenerate) continue;
      const d = killingDefect(metric, xi, x, dim, h);
      if (Number.isFinite(d) && d > pior) pior = d;
    }
  }
  return pior;
}

/**
 * O jacobiano do fluxo, J^i_j = ∂φ_t(p)^i / ∂p^j.
 *
 * É o que empurra um vetor de p para φ_t(p) — o arrasto de Lie de um vetor. Sai
 * por diferença central sobre o próprio integrador, e não por uma segunda
 * equação a integrar junto: reaproveitar `flow` custa 2·dim integrações a mais
 * e nenhuma linha de método novo, e os fluxos aqui são curtos por construção.
 */
export function flowJacobian(
  xi: VectorField,
  x: Float64Array,
  t: number,
  steps: number,
  dim: number,
  out: Float64Array,
  h = 1e-4,
): void {
  const probe = Float64Array.from(x);
  for (let j = 0; j < dim; j++) {
    const passo = passoDe(h, x[j]!);
    probe[j] = x[j]! + passo;
    const mais = flow(xi, probe, t, steps, dim);
    probe[j] = x[j]! - passo;
    const menos = flow(xi, probe, t, steps, dim);
    probe[j] = x[j]!;
    for (let i = 0; i < dim; i++) {
      out[i * dim + j] = (mais[i]! - menos[i]!) / (2 * passo);
    }
  }
}

/** Empurra `v` de p para φ_t(p) pelo jacobiano: (J v)^i = J^i_j v^j. */
export function pushForward(
  jacobian: Float64Array,
  v: Float64Array,
  dim: number,
  out: Float64Array,
): void {
  for (let i = 0; i < dim; i++) {
    let soma = 0;
    for (let j = 0; j < dim; j++) soma += jacobian[i * dim + j]! * v[j]!;
    out[i] = soma;
  }
}

/**
 * ⟨ξ, u⟩ = g_ij ξ^i u^j — a carga que uma simetria conserva.
 *
 * Se ξ é de Killing e u é a tangente de uma geodésica, este número não muda ao
 * longo dela. É a energia e o momento angular da mecânica celeste, e sai daqui
 * sem que ninguém precise falar de força.
 */
export function killingCharge(
  metric: MetricFn,
  xi: VectorField,
  x: Float64Array,
  u: Float64Array,
  dim: number,
): number {
  const g = new Float64Array(dim * dim);
  const campo = new Float64Array(dim);
  metric(x, g);
  xi(x, campo);

  let soma = 0;
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) soma += g[i * dim + j]! * campo[i]! * u[j]!;
  }
  return soma;
}
