/**
 * Mergulhos: como uma carta vira superfície em ℝ³.
 *
 * Até a Etapa 9 havia um só, a esfera, escrito à mão com base e normal em forma
 * fechada. Acrescentar cilindro, cone e toro não pede repetir esse trabalho três
 * vezes: dado x(u,v), a base tangente é ∂x/∂u e ∂x/∂v, a normal é o produto
 * vetorial delas, e a **métrica induzida** é o produto escalar entre elas. Um
 * mergulho precisa dizer só duas coisas — onde fica o ponto, e como voltar da
 * superfície para a carta.
 *
 * ## Por que a métrica continua digitada
 *
 * Seria possível derivar g do mergulho e dispensar as expressões. Não é o que se
 * quer: o produto existe para o aluno *ver* a métrica e mexer nela, e uma métrica
 * derivada em silêncio seria uma caixa-preta no lugar do objeto de estudo.
 *
 * O preço é que as duas descrições podem discordar, e discordar em silêncio — o
 * painel de carta mostrando uma geometria e o de mergulho mostrando outra. É
 * exatamente o tipo de erro que este produto não pode cometer, então há teste:
 * para cada superfície, a métrica induzida pelo mergulho tem de bater com a
 * métrica digitada, componente a componente.
 */

/** O passo das derivadas do mergulho, na mesma faixa de D5. */
export const DEFAULT_H_MERGULHO = 1e-5;

export interface Embedding {
  readonly id: string;
  /** x(u,v) → ℝ³. */
  readonly point: (x: Float64Array, out: Float64Array) => void;
  /**
   * ℝ³ → carta. O arraste vem de um raycast, que devolve um ponto do espaço;
   * sem a volta, não há como saber que coordenada o aluno agarrou.
   */
  readonly chartOf: (p: readonly number[], out: Float64Array) => void;
}

/**
 * Base tangente por diferença central do mergulho.
 * `out` recebe 6 números: ∂x/∂u em [0..2], ∂x/∂v em [3..5].
 */
export function embeddingBasis(
  embedding: Embedding,
  x: Float64Array,
  out: Float64Array,
  h = DEFAULT_H_MERGULHO,
): void {
  const mais = new Float64Array(3);
  const menos = new Float64Array(3);
  const probe = Float64Array.from(x);

  for (let i = 0; i < 2; i++) {
    const passo = h * Math.max(1, Math.abs(x[i]!));
    probe[i] = x[i]! + passo;
    embedding.point(probe, mais);
    probe[i] = x[i]! - passo;
    embedding.point(probe, menos);
    probe[i] = x[i]!;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = (mais[k]! - menos[k]!) / (2 * passo);
  }
}

/** Normal unitária: e_u × e_v. */
export function embeddingNormal(
  embedding: Embedding,
  x: Float64Array,
  out: Float64Array,
  h = DEFAULT_H_MERGULHO,
): void {
  const e = new Float64Array(6);
  embeddingBasis(embedding, x, e, h);
  const n = [
    e[1]! * e[5]! - e[2]! * e[4]!,
    e[2]! * e[3]! - e[0]! * e[5]!,
    e[0]! * e[4]! - e[1]! * e[3]!,
  ];
  const norma = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  for (let k = 0; k < 3; k++) out[k] = n[k]! / norma;
}

/**
 * A métrica induzida pelo mergulho: g_ij = e_i · e_j.
 *
 * Não é usada para desenhar — quem manda é a métrica digitada. Existe para o
 * teste que garante que as duas concordam.
 */
export function inducedMetric(
  embedding: Embedding,
  x: Float64Array,
  out: Float64Array,
  h = DEFAULT_H_MERGULHO,
): void {
  const e = new Float64Array(6);
  embeddingBasis(embedding, x, e, h);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      out[i * 2 + j] =
        e[i * 3]! * e[j * 3]! + e[i * 3 + 1]! * e[j * 3 + 1]! + e[i * 3 + 2]! * e[j * 3 + 2]!;
    }
  }
}

// ------------------------------------------------------------- as superfícies

/** Esfera de raio R, em (θ, φ). */
export function sphereEmbedding(R = 1): Embedding {
  return {
    id: 'esfera',
    point: (x, out) => {
      const s = Math.sin(x[0]!);
      out[0] = R * s * Math.cos(x[1]!);
      out[1] = R * s * Math.sin(x[1]!);
      out[2] = R * Math.cos(x[0]!);
    },
    chartOf: (p, out) => {
      const r = Math.hypot(p[0]!, p[1]!, p[2]!) || 1;
      out[0] = Math.acos(Math.min(1, Math.max(-1, p[2]! / r)));
      out[1] = Math.atan2(p[1]!, p[0]!);
    },
  };
}

/**
 * Cilindro de raio R, em (φ, z).
 *
 * Curvo no espaço e **plano por dentro**: g = diag(R², 1) tem componentes
 * constantes, logo Christoffels nulos e K = 0. É o contraexemplo mais barato
 * para "curvatura é o quanto a superfície entorta no espaço" — a folha de papel
 * enrolada não estica nem rasga, e a geometria dela não mudou.
 */
export function cylinderEmbedding(R = 1): Embedding {
  return {
    id: 'cilindro',
    point: (x, out) => {
      out[0] = R * Math.cos(x[0]!);
      out[1] = R * Math.sin(x[0]!);
      out[2] = x[1]!;
    },
    chartOf: (p, out) => {
      out[0] = Math.atan2(p[1]!, p[0]!);
      out[1] = p[2]!;
    },
  };
}

/**
 * Cone de meio-ângulo com seno `sa`, em (r, φ), com r a distância ao vértice
 * medida **sobre a superfície**.
 *
 * Também plano fora do vértice, e pelo motivo mais bonito: a circunferência a
 * distância r é 2πr·sa, menor que 2πr. O que falta é o déficit angular, e ele
 * está todo concentrado num ponto — curvatura zero em toda parte e mesmo assim
 * uma superfície que não é o plano.
 */
export function coneEmbedding(sa = 0.6): Embedding {
  const ca = Math.sqrt(Math.max(0, 1 - sa * sa));
  return {
    id: 'cone',
    point: (x, out) => {
      const r = x[0]!;
      out[0] = r * sa * Math.cos(x[1]!);
      out[1] = r * sa * Math.sin(x[1]!);
      out[2] = r * ca;
    },
    chartOf: (p, out) => {
      out[0] = Math.hypot(p[0]!, p[1]!, p[2]!);
      out[1] = Math.atan2(p[1]!, p[0]!);
    },
  };
}

/**
 * Toro de raio maior R e menor a, em (u, v) — u dá a volta no buraco, v dá a
 * volta no tubo.
 *
 * A superfície mais informativa do conjunto: K = cos v / (a(R + a·cos v)) é
 * **positiva na parte de fora, negativa na parte de dentro e zero nos dois
 * círculos de cima e de baixo**. Os três sinais numa superfície só, alcançáveis
 * arrastando o mesmo ponto — o que esfera, cilindro e hiperbólico só mostram
 * separados.
 */
export function torusEmbedding(R = 2, a = 0.8): Embedding {
  return {
    id: 'toro',
    point: (x, out) => {
      const distancia = R + a * Math.cos(x[1]!);
      out[0] = distancia * Math.cos(x[0]!);
      out[1] = distancia * Math.sin(x[0]!);
      out[2] = a * Math.sin(x[1]!);
    },
    chartOf: (p, out) => {
      out[0] = Math.atan2(p[1]!, p[0]!);
      out[1] = Math.atan2(p[2]!, Math.hypot(p[0]!, p[1]!) - R);
    },
  };
}

const CATALOGO: Readonly<Record<string, Embedding>> = {
  esfera: sphereEmbedding(1),
  cilindro: cylinderEmbedding(1),
  cone: coneEmbedding(0.6),
  toro: torusEmbedding(2, 0.8),
};

export type EmbeddingId = keyof typeof CATALOGO;

export function embeddingById(id: string | null): Embedding | null {
  return id === null ? null : (CATALOGO[id] ?? null);
}
