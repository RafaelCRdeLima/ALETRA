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

import type { ChartBounds } from './degenerate';

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
  /**
   * Onde o mergulho existe, quando não é a carta inteira.
   *
   * Até aqui carta e superfície coincidiam, e a pergunta não aparecia. Em
   * Schwarzschild elas divergem: a carta vai de r=0,2 a r=12 de propósito,
   * porque é dentro do horizonte que D7 tem o que dizer, e o paraboloide de
   * Flamm existe só a partir de r=2M. Recortar os limites de desenho é o
   * jeito honesto — a superfície **acaba** onde acaba, e quem continua
   * falando de r<2M é o painel de carta, que é onde aquilo ainda é geometria.
   */
  readonly domain?: (bounds: ChartBounds) => ChartBounds;
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

/**
 * O ponto está onde o mergulho existe?
 *
 * Sem isto, um ponto fora do domínio ainda é aceito pela métrica — em
 * Schwarzschild, r entre 2M e 2,04M tem g positiva-definida e passa por
 * `probeMetric` sem reclamar — mas o mergulho recorta, a diferença finita vê
 * derivada nula e a base tangente inteira colapsa a zero. Disco, pilha e vetor
 * somem sem explicação, e nos modos de curva a direção nula ainda leva a câmera
 * para dentro da superfície.
 */
export function insideDomain(
  embedding: Embedding,
  x: Float64Array,
  bounds: ChartBounds,
): boolean {
  const d = embedding.domain?.(bounds);
  if (!d) return true;
  for (let i = 0; i < x.length; i++) {
    if (!(x[i]! >= d.min[i]! && x[i]! <= d.max[i]!)) return false;
  }
  return true;
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

/**
 * Fita de Möbius de raio R, em (u, v) — u dá a volta, v atravessa a fita.
 *
 * A carta é ortogonal e a métrica sai limpa: g_uu = (R + v·cos(u/2))² + v²/4,
 * g_uv = 0 e g_vv = 1, porque v já é comprimento de arco através da fita. A
 * curvatura tem forma fechada, K = −R²/(4·g_uu²): **negativa em toda parte e
 * nunca zero**, ao contrário do cilindro e do cone, que também entortam no
 * espaço e mesmo assim são planos.
 *
 * ## O que esta superfície não tem como contar pela carta
 *
 * A fita é não-orientável, e isso **não está na métrica**. O g acima vive num
 * retângulo [−π,π]×[−w,w], que é um disco: orientável, contrátil, sem nada de
 * especial. O que faz a fita ser fita é a colagem das duas bordas — (π, v) é o
 * mesmo ponto que (−π, −v) — e `ChartBounds` é um retângulo, sem lugar onde
 * guardar colagem nenhuma.
 *
 * Não é um defeito a consertar aqui. É a coisa mais interessante que a
 * superfície tem a dizer, e o painel de ℝ³ a diz sozinho, porque ali a fita se
 * vê virando do avesso. O produto já vive de os dois painéis discordarem; a
 * novidade é o tipo de discordância. Nas outras superfícies os dois desenham a
 * mesma informação de jeitos diferentes. Aqui um dos dois sabe algo que o outro
 * não tem como saber.
 *
 * A consequência prática é que o arraste para na costura em vez de dar a volta:
 * `movePoint` recorta aos limites, como em toda superfície. Dar a volta pediria
 * modelar a colagem em `ChartBounds` e propagá-la por máscara, curvas, laço de
 * holonomia e geodésica — bem além de acrescentar uma superfície, e mexendo em
 * tudo que hoje é retângulo.
 */
export function moebiusEmbedding(R = 2): Embedding {
  return {
    id: 'moebius',
    point: (x, out) => {
      const meia = x[0]! / 2;
      const raio = R + x[1]! * Math.cos(meia);
      out[0] = raio * Math.cos(x[0]!);
      out[1] = raio * Math.sin(x[0]!);
      out[2] = x[1]! * Math.sin(meia);
    },
    chartOf: (p, out) => {
      const u = Math.atan2(p[1]!, p[0]!);
      const meia = u / 2;
      /*
       * ρ − R = v·cos(u/2) e p_z = v·sen(u/2). Projetar nos dois recupera v de
       * uma vez, sem dividir por um cosseno que zera na metade da volta — que é
       * onde a fita está de lado e a divisão explodiria.
       */
      out[0] = u;
      out[1] = (Math.hypot(p[0]!, p[1]!) - R) * Math.cos(meia) + p[2]! * Math.sin(meia);
    },
  };
}

/**
 * A fatia equatorial de Schwarzschild, mergulhada de verdade: o paraboloide de
 * Flamm, em (r, φ).
 *
 * Com z(r) = 2√(2M(r−2M)), a superfície de revolução (r cos φ, r sen φ, z(r))
 * tem g_rr = 1 + z'² = 1/(1−2M/r) e g_φφ = r². Não é uma ilustração do buraco
 * negro: é **a mesma métrica que está digitada nos campos**, isometricamente
 * mergulhada. Por isso o teste de consistência do catálogo vale aqui como nas
 * outras.
 *
 * O funil é a resposta ao pedido de "esferas concêntricas". Cada círculo de r
 * constante é o equador de uma dessas esferas, e tem comprimento 2πr — mas a
 * distância *entre* dois círculos vizinhos, medida sobre o funil, é maior que
 * Δr, e a razão entre as duas cresce sem limite ao se aproximar da garganta.
 * (O funil em si não fica infinitamente longo: o que diverge é a inclinação,
 * não o comprimento — a distância própria até o horizonte é finita.) É
 * exatamente o que 1/(1−2M/r) diz, e é o que o desenho tem para dizer.
 *
 * Ele acaba em r=2M, e isso não é limitação do desenho. Dentro do horizonte a
 * fatia estática não é uma superfície do espaço, e nenhum mergulho a alcança.
 * A carta continua desenhando lá, hachurada — as duas imagens discordam, e
 * dessa vez a discordância é o conteúdo.
 */
export function flammEmbedding(M = 1): Embedding {
  const garganta = 2 * M;
  // A borda desenhada fica um pouco acima da garganta: em r=2M exatamente,
  // z' = √(2M/(r−2M)) diverge, e a base tangente por diferença finita junto.
  const rMin = garganta * 1.02;
  return {
    id: 'schwarzschild',
    point: (x, out) => {
      // Guarda, não geometria: nada deveria avaliar aqui abaixo — `domain`
      // recorta a malha e `probeMetric` impede o ponto de entrar no horizonte.
      const r = Math.max(x[0]!, rMin);
      out[0] = r * Math.cos(x[1]!);
      out[1] = r * Math.sin(x[1]!);
      out[2] = 2 * Math.sqrt(2 * M * (r - garganta));
    },
    chartOf: (p, out) => {
      out[0] = Math.hypot(p[0]!, p[1]!);
      out[1] = Math.atan2(p[1]!, p[0]!);
    },
    domain: (b) => ({
      min: [Math.max(b.min[0]!, rMin), b.min[1]!],
      max: [...b.max],
    }),
  };
}

const CATALOGO: Readonly<Record<string, Embedding>> = {
  esfera: sphereEmbedding(1),
  cilindro: cylinderEmbedding(1),
  cone: coneEmbedding(0.6),
  toro: torusEmbedding(2, 0.8),
  moebius: moebiusEmbedding(2),
  schwarzschild: flammEmbedding(1),
};

export type EmbeddingId = keyof typeof CATALOGO;

export function embeddingById(id: string | null): Embedding | null {
  return id === null ? null : (CATALOGO[id] ?? null);
}
