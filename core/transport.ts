/**
 * Transporte paralelo ao longo de uma curva, e a holonomia de um laço fechado.
 *
 *   dV^a/dλ = -Γ^a_bc (dx^b/dλ) V^c
 *
 * Levar um vetor "sem girá-lo" em volta de um laço e encontrá-lo girado ao
 * voltar é a demonstração mais direta de que a superfície é curva. O ângulo que
 * sobra não é erro de integração: é a curvatura englobada pelo laço.
 *
 * ## Por que isto é ao mesmo tempo o teste e o conteúdo
 *
 * Gauss-Bonnet diz que a holonomia de um laço é ∫∫ K dA sobre a região cercada.
 * Na esfera unitária K = 1, então o ângulo **é** a área. O teste que verifica o
 * motor é a mesma afirmação que a etapa ensina — se a cena mostra o número
 * certo, o integrador está correto, e vice-versa. D8 previu essa sinergia desde
 * o começo; ela chega aqui.
 *
 * ## Laço retangular na carta
 *
 * O laço é um retângulo em coordenadas, não um triângulo geodésico. Os dois
 * servem a Gauss-Bonnet, mas o retângulo é editável arrastando dois cantos, tem
 * área com forma fechada em qualquer métrica diagonal, e não exige resolver
 * geodésicas — que só chegam na Etapa 9. O preço é que os lados não são
 * geodésicos, o que não muda a holonomia: ela depende da região cercada, não do
 * caminho.
 */
import type { ChristoffelFn, MetricFn } from './metric';
import { christoffelIndex, normSquared } from './metric';

/**
 * Transporta V de `from` a `to` ao longo do segmento reto em coordenadas.
 *
 * "Reto em coordenadas" é escolha de caminho, não de geometria — o transporte é
 * paralelo em relação à conexão, e é a conexão que decide o que "não girar"
 * significa.
 */
export function transportAlongSegment(
  christoffel: ChristoffelFn,
  from: Float64Array,
  to: Float64Array,
  V: Float64Array,
  dim: number,
  steps: number,
): Float64Array {
  const delta = new Float64Array(dim);
  for (let i = 0; i < dim; i++) delta[i] = to[i]! - from[i]!;

  const gamma = new Float64Array(dim * dim * dim);
  const ponto = new Float64Array(dim);
  let atual = Float64Array.from(V);
  const dLambda = 1 / steps;

  // O campo de velocidade do vetor transportado, no parâmetro λ ∈ [0, 1].
  const derivada = (lambda: number, v: Float64Array, out: Float64Array): void => {
    for (let i = 0; i < dim; i++) ponto[i] = from[i]! + lambda * delta[i]!;
    christoffel(ponto, gamma);
    for (let a = 0; a < dim; a++) {
      let soma = 0;
      for (let b = 0; b < dim; b++) {
        for (let c = 0; c < dim; c++) {
          soma += gamma[christoffelIndex(dim, a, b, c)]! * delta[b]! * v[c]!;
        }
      }
      out[a] = -soma;
    }
  };

  // RK4 à mão porque a derivada depende de λ, e `rk4Step` só conhece campos
  // autônomos. Estender aquele para não-autônomo, só por esta chamada, deixaria
  // o integrador de fluxo mais complicado do que o resto do produto precisa.
  const k1 = new Float64Array(dim);
  const k2 = new Float64Array(dim);
  const k3 = new Float64Array(dim);
  const k4 = new Float64Array(dim);
  const tmp = new Float64Array(dim);

  for (let n = 0; n < steps; n++) {
    const lambda = n * dLambda;
    derivada(lambda, atual, k1);
    for (let i = 0; i < dim; i++) tmp[i] = atual[i]! + (dLambda / 2) * k1[i]!;
    derivada(lambda + dLambda / 2, tmp, k2);
    for (let i = 0; i < dim; i++) tmp[i] = atual[i]! + (dLambda / 2) * k2[i]!;
    derivada(lambda + dLambda / 2, tmp, k3);
    for (let i = 0; i < dim; i++) tmp[i] = atual[i]! + dLambda * k3[i]!;
    derivada(lambda + dLambda, tmp, k4);

    const proximo = new Float64Array(dim);
    for (let i = 0; i < dim; i++) {
      proximo[i] = atual[i]! + (dLambda / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
    }
    atual = proximo;
  }
  return atual;
}

/** Transporta ao longo de uma poligonal, devolvendo o vetor em cada vértice. */
export function transportAlongPath(
  christoffel: ChristoffelFn,
  caminho: readonly Float64Array[],
  V0: Float64Array,
  dim: number,
  stepsPorTrecho = 24,
): Float64Array[] {
  const vetores: Float64Array[] = [Float64Array.from(V0)];
  for (let i = 0; i + 1 < caminho.length; i++) {
    vetores.push(
      transportAlongSegment(
        christoffel,
        caminho[i]!,
        caminho[i + 1]!,
        vetores[vetores.length - 1]!,
        dim,
        stepsPorTrecho,
      ),
    );
  }
  return vetores;
}

/** Os quatro cantos de um retângulo em coordenadas, fechando no primeiro. */
export function rectangleLoop(
  canto: Float64Array,
  oposto: Float64Array,
): Float64Array[] {
  const [a0, a1] = [canto[0]!, canto[1]!];
  const [b0, b1] = [oposto[0]!, oposto[1]!];
  return [
    Float64Array.from([a0, a1]),
    Float64Array.from([b0, a1]),
    Float64Array.from([b0, b1]),
    Float64Array.from([a0, b1]),
    Float64Array.from([a0, a1]),
  ];
}

export interface Holonomia {
  readonly inicial: Float64Array;
  readonly final: Float64Array;
  /** Ângulo com sinal entre o vetor que partiu e o que voltou, em radianos. */
  readonly angulo: number;
  /** |V|_g no começo e no fim — o transporte tem de preservar isto. */
  readonly normaInicial: number;
  readonly normaFinal: number;
  readonly vetores: readonly Float64Array[];
}

/**
 * A holonomia de um laço: quanto o vetor voltou girado.
 *
 * O ângulo é medido numa base ortonormal da métrica no ponto de partida, não nos
 * componentes crus — em coordenadas oblíquas ou com escalas diferentes, o ângulo
 * entre componentes não é o ângulo geométrico, e seria justamente o tipo de erro
 * que este produto existe para não cometer.
 */
export function holonomy(
  metric: MetricFn,
  christoffel: ChristoffelFn,
  laco: readonly Float64Array[],
  V0: Float64Array,
  dim: number,
  stepsPorTrecho = 24,
): Holonomia {
  const vetores = transportAlongPath(christoffel, laco, V0, dim, stepsPorTrecho);
  const final = vetores[vetores.length - 1]!;

  const g = new Float64Array(dim * dim);
  metric(laco[0]!, g);

  const produto = (a: Float64Array, b: Float64Array): number => {
    let soma = 0;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) soma += g[i * dim + j]! * a[i]! * b[j]!;
    }
    return soma;
  };

  const normaInicial = Math.sqrt(Math.max(0, normSquared(g, V0, dim)));
  const normaFinal = Math.sqrt(Math.max(0, normSquared(g, final, dim)));

  // Base ortonormal com e1 ao longo de V0; o sinal do ângulo vem da orientação
  // de (e1, e2), que é a mesma da carta.
  const e1 = new Float64Array(dim);
  for (let i = 0; i < dim; i++) e1[i] = V0[i]! / (normaInicial || 1);

  const cru = Float64Array.from([-e1[1]!, e1[0]!]);
  const projecao = produto(cru, e1);
  const e2 = new Float64Array(dim);
  for (let i = 0; i < dim; i++) e2[i] = cru[i]! - projecao * e1[i]!;
  const normaE2 = Math.sqrt(Math.max(1e-300, produto(e2, e2)));
  for (let i = 0; i < dim; i++) e2[i] /= normaE2;

  return {
    inicial: Float64Array.from(V0),
    final,
    angulo: Math.atan2(produto(final, e2), produto(final, e1)),
    normaInicial,
    normaFinal,
    vetores,
  };
}

/**
 * A área da região cercada por um retângulo em coordenadas, ∫∫ √det g.
 *
 * É o que Gauss-Bonnet compara com a holonomia quando K é constante — e o que,
 * com K variável, vira a integral da curvatura. Regra do trapézio dupla: a
 * malha é grosseira de propósito, porque o número existe para ser comparado com
 * o ângulo em tela, não para ser exato na décima casa.
 */
export function enclosedArea(
  metric: MetricFn,
  canto: Float64Array,
  oposto: Float64Array,
  dim: number,
  amostras = 64,
): number {
  const g = new Float64Array(dim * dim);
  const x = new Float64Array(dim);
  const largura = oposto[0]! - canto[0]!;
  const altura = oposto[1]! - canto[1]!;
  let soma = 0;

  for (let i = 0; i < amostras; i++) {
    for (let j = 0; j < amostras; j++) {
      x[0] = canto[0]! + (largura * (i + 0.5)) / amostras;
      x[1] = canto[1]! + (altura * (j + 0.5)) / amostras;
      metric(x, g);
      const det = g[0]! * g[3]! - g[1]! * g[2]!;
      if (det > 0) soma += Math.sqrt(det);
    }
  }
  return (soma * Math.abs(largura * altura)) / (amostras * amostras);
}
