/**
 * As três métricas pré-carregadas da Etapa 2 — que são também os três casos
 * padrão-ouro de D8.
 *
 * A esfera aparece aqui de novo, agora escrita como expressão e derivada por
 * diferença finita. Ela é o teste de regressão da Etapa 1: se a cena da esfera
 * mudar de aparência ao trocar a fórmula fechada por FD, a generalização perdeu
 * fidelidade e é isso que precisa ser consertado, não a tolerância do teste.
 */
import { chart, type Chart } from './chart';
import type { ChartBounds } from './degenerate';
import { VERSAO_ATUAL, type SceneDoc } from './scene';
import { SPHERE_CHART } from './sphere';

export interface MetricExample {
  readonly id: string;
  readonly label: string;
  readonly chart: Chart;
  /** Triângulo superior: [g₀₀, g₀₁, g₁₁]. */
  readonly components: readonly string[];
  readonly bounds: ChartBounds;
  readonly initialPoint: readonly number[];
  readonly initialVector: readonly number[];
  readonly initialOmega: readonly number[];
  /**
   * Comprimento máximo do vetor **na métrica**, não na carta nem na tela.
   *
   * Recortar por |v|_g é a única régua que os dois painéis podem compartilhar:
   * ela é a mesma quantidade geométrica dos dois lados, enquanto "0,42 unidades
   * de mundo" só quer dizer algo no mergulho e "45% do intervalo" só quer dizer
   * algo na carta. Como a métrica induzida é o pullback do mergulho, |v|_g é
   * exatamente o comprimento da seta desenhada em ℝ³ — o recorte não precisa
   * escolher entre os painéis.
   *
   * O valor é por exemplo porque as escalas não se comparam: um passo de 0,4 é
   * meio raio na esfera e um confete em Schwarzschild.
   */
  readonly maxVector: number;
  /** Curvatura gaussiana em forma fechada, quando conhecida (D8). */
  readonly closedCurvature: (x: Float64Array) => number;
  /**
   * Identificador do mergulho em ℝ³, ou nulo para superfícies que só vivem na
   * carta. O catálogo está em `embedding.ts`; a métrica digitada aqui e o
   * mergulho de lá descrevem a mesma superfície, e há teste garantindo isso.
   */
  readonly embedding: string | null;
  readonly note: string;
}

export const SPHERE_EXAMPLE: MetricExample = {
  id: 'esfera',
  label: 'Esfera (R = 1)',
  chart: SPHERE_CHART,
  components: ['1', '0', 'sin(theta)^2'],
  // Os limites incluem os polos de propósito. Recortá-los deixaria a cena mais
  // bem-comportada e tornaria inalcançável justamente o que a nota promete: a
  // carta falhando onde a superfície não tem nada de errado (D7).
  bounds: { min: [0, -Math.PI], max: [Math.PI, Math.PI] },
  initialPoint: [1.15, 0.55],
  initialVector: [0.28, 0.5],
  initialOmega: [6, 2.5],
  maxVector: 0.42,
  closedCurvature: () => 1,
  embedding: 'esfera',
  note: 'Curvatura constante K = 1. Os polos θ=0 e θ=π são singularidades de coordenada.',
};

/**
 * O plano euclidiano é o controle experimental da Etapa 3.
 *
 * Com g = δ, ♭ e ♯ são a identidade numérica: v♭ tem exatamente os mesmos
 * componentes que v. Não é um caso degenerado nem um exemplo fraco — é a razão
 * pela qual quem só trabalhou em ℝⁿ nunca precisou distinguir vetor de covetor,
 * e sem ele o aluno não tem contra o que comparar a esfera.
 */
export const EUCLIDEAN_EXAMPLE: MetricExample = {
  id: 'euclidiano',
  label: 'Plano euclidiano',
  chart: chart(['x', 'y']),
  components: ['1', '0', '1'],
  bounds: { min: [-3, -3], max: [3, 3] },
  initialPoint: [0, 0],
  initialVector: [1.2, 0.7],
  initialOmega: [1.5, 0.8],
  maxVector: 2.2,
  closedCurvature: () => 0,
  embedding: null,
  note:
    'Curvatura zero, e ♭ não faz nada: v♭ tem os mesmos números que v. ' +
    'É por isso que em ℝ² ninguém precisa distinguir vetor de covetor.',
};

/**
 * Cilindro: curvo no espaço, **plano por dentro**.
 *
 * A métrica tem componentes constantes, então os Christoffels somem e K = 0 —
 * a mesma geometria do plano euclidiano, enrolada. É o contraexemplo mais barato
 * para "curvatura é o quanto a superfície entorta no espaço": a folha de papel
 * enrolada não esticou nem rasgou, e nada da geometria dela mudou.
 */
export const CYLINDER_EXAMPLE: MetricExample = {
  id: 'cilindro',
  label: 'Cilindro (R = 1)',
  chart: chart(['phi', 'z']),
  components: ['1', '0', '1'],
  bounds: { min: [-Math.PI, -2], max: [Math.PI, 2] },
  initialPoint: [0.6, 0],
  initialVector: [0.35, 0.4],
  initialOmega: [4, 3],
  maxVector: 0.7,
  closedCurvature: () => 0,
  embedding: 'cilindro',
  note:
    'K = 0 em toda parte: o cilindro é o plano enrolado. Compare com a esfera — ' +
    'entortar no espaço não é o mesmo que ter curvatura.',
};

/**
 * Cone: também plano, e pelo motivo mais bonito.
 *
 * A circunferência à distância r do vértice é 2πr·sen α, menor que 2πr. O que
 * falta é o déficit angular, e ele está **todo concentrado no vértice**:
 * curvatura zero em toda parte e ainda assim uma superfície que não é o plano.
 */
export const CONE_EXAMPLE: MetricExample = {
  id: 'cone',
  label: 'Cone (sen α = 0,6)',
  chart: chart(['r', 'phi']),
  components: ['1', '0', '0.36*r^2'],
  bounds: { min: [0.15, -Math.PI], max: [2.5, Math.PI] },
  initialPoint: [1.2, 0.4],
  initialVector: [0.3, 0.35],
  initialOmega: [4, 3],
  maxVector: 0.6,
  closedCurvature: () => 0,
  embedding: 'cone',
  note:
    'K = 0 fora do vértice, mas a circunferência a distância r é 2πr·0,6 e não ' +
    '2πr. O déficit está todo concentrado no vértice, onde a carta acaba.',
};

/**
 * Toro: os três sinais de curvatura numa superfície só.
 *
 * K = cos v / (a(R + a·cos v)) é positiva na parte de fora, negativa na parte de
 * dentro e zero nos círculos de cima e de baixo. Arrastar o mesmo ponto pelo
 * tubo percorre os três regimes — o que esfera, cilindro e hiperbólico só
 * mostram em cenas separadas.
 */
export const TORUS_EXAMPLE: MetricExample = {
  id: 'toro',
  label: 'Toro (R = 2, a = 0,8)',
  chart: chart(['u', 'v']),
  components: ['(2 + 0.8*cos(v))^2', '0', '0.64'],
  bounds: { min: [-Math.PI, -Math.PI], max: [Math.PI, Math.PI] },
  initialPoint: [0.6, 0.5],
  initialVector: [0.18, 0.4],
  initialOmega: [5, 3],
  maxVector: 0.6,
  closedCurvature: (x) => Math.cos(x[1]!) / (0.8 * (2 + 0.8 * Math.cos(x[1]!))),
  embedding: 'toro',
  note:
    'K = cos v / (a(R + a·cos v)): positiva por fora, negativa por dentro, zero ' +
    'nos círculos de cima e de baixo. Arraste o ponto pelo tubo e veja o sinal virar.',
};

export const MOEBIUS_EXAMPLE: MetricExample = {
  id: 'moebius',
  label: 'Fita de Möbius (R = 2)',
  chart: chart(['u', 'v']),
  components: ['(2 + v*cos(u/2))^2 + v^2/4', '0', '1'],
  bounds: { min: [-Math.PI, -1], max: [Math.PI, 1] },
  initialPoint: [0.6, 0.2],
  initialVector: [0.18, 0.4],
  initialOmega: [5, 3],
  maxVector: 0.8,
  // K = −R²/(4·g_uu²), e com R = 2 o numerador cancela o 4.
  closedCurvature: (x) => {
    const guu = (2 + x[1]! * Math.cos(x[0]! / 2)) ** 2 + x[1]! ** 2 / 4;
    return -1 / (guu * guu);
  },
  embedding: 'moebius',
  // A nota viaja na URL, e por isso é curta: a versão longa desta explicação
  // está no comentário de `moebiusEmbedding`, onde não custa endereço nenhum.
  note:
    'K < 0 em toda parte, nunca zero. Mas o que a fita tem de próprio a carta ' +
    'não mostra: o retângulo ao lado é orientável e a fita não é. Só o painel ' +
    'de ℝ³ sabe da torção.',
};

export const HYPERBOLIC_EXAMPLE: MetricExample = {
  id: 'hiperbolico',
  label: 'Plano hiperbólico (semiplano superior)',
  chart: chart(['x', 'y']),
  components: ['1/y^2', '0', '1/y^2'],
  bounds: { min: [-2, 0.12], max: [2, 3] },
  initialPoint: [0, 1],
  initialVector: [0.9, 0.55],
  initialOmega: [3, 1.5],
  maxVector: 1.4,
  closedCurvature: () => -1,
  embedding: null,
  note: 'Curvatura constante K = -1. A borda y=0 está infinitamente longe, não é um lugar.',
};

/** Fatia equatorial espacial de Schwarzschild com M = 1: ds² = dr²/(1-2/r) + r²dφ². */
export const SCHWARZSCHILD_EXAMPLE: MetricExample = {
  id: 'schwarzschild',
  label: 'Schwarzschild — fatia equatorial (M = 1)',
  chart: chart(['r', 'phi']),
  components: ['1/(1 - 2/r)', '0', 'r^2'],
  bounds: { min: [0.2, -Math.PI], max: [12, Math.PI] },
  initialPoint: [6, 0],
  // g_φφ = r² = 36 aqui, então uma componente v^φ pequena já é um vetor
  // comprido. Com painel 3D o comprimento **métrico** passou a ter consequência
  // de desenho: era 7, que perto de r=6 é comparável ao funil inteiro, e o
  // disco tangente atravessava a garganta e saía pela borda. D10 pede um
  // retalho local, e local aqui é da ordem de 2.
  initialVector: [1.1, 0.25],
  initialOmega: [1.2, 3.2],
  maxVector: 2.4,
  closedCurvature: (x) => -1 / (x[0]! * x[0]! * x[0]!),
  embedding: 'schwarzschild',
  note:
    'K = -M/r³. O funil é esta fatia mergulhada: cada círculo tem raio r, mas ' +
    'a distância entre dois vizinhos é maior que Δr. Em r=2 o funil acaba e a ' +
    'carta segue sozinha; em r=0 a curvatura diverge de verdade.',
};

export const EXAMPLES: readonly MetricExample[] = [
  SPHERE_EXAMPLE,
  TORUS_EXAMPLE,
  CYLINDER_EXAMPLE,
  CONE_EXAMPLE,
  MOEBIUS_EXAMPLE,
  EUCLIDEAN_EXAMPLE,
  HYPERBOLIC_EXAMPLE,
  SCHWARZSCHILD_EXAMPLE,
];

export function exampleById(id: string): MetricExample {
  return EXAMPLES.find((example) => example.id === id) ?? SPHERE_EXAMPLE;
}

// ------------------------------------------------- ponte com o formato de cena

/** Estado editável que uma cena carrega junto com a métrica. */
export interface SceneState {
  readonly ponto: readonly number[];
  readonly vetor: readonly number[];
  readonly omega: readonly number[];
  readonly eta: readonly number[];
  readonly u: readonly number[];
  readonly laco: readonly number[];
  readonly modo: 'uma' | 'duas' | 'derivada' | 'colchete' | 'holonomia' | 'geodesica';
  readonly bemol: number;
  /** A métrica como o autor digitou, que pode já ter divergido do exemplo. */
  readonly metrica: readonly string[];
  /** Os campos digitados das Etapas 6 e 7. */
  readonly campos: SceneDoc['campos'];
}

export function exampleToScene(example: MetricExample, estado: SceneState): SceneDoc {
  return {
    versao: VERSAO_ATUAL,
    carta: [...example.chart.names],
    metrica: [...estado.metrica],
    limites: { min: [...example.bounds.min], max: [...example.bounds.max] },
    ponto: [...estado.ponto],
    vetor: [...estado.vetor],
    omega: [...estado.omega],
    eta: [...estado.eta],
    u: [...estado.u],
    laco: [...estado.laco],
    modo: estado.modo,
    campos: estado.campos,
    maxVetor: example.maxVector,
    bemol: estado.bemol,
    mergulho: example.embedding,
    rotulo: example.label,
    nota: example.note,
  };
}

/**
 * Uma cena carregada vira um exemplo em memória, e daí o resto do produto não
 * precisa saber de onde ela veio: cena de URL e exemplo embutido entram pelo
 * mesmo caminho.
 *
 * `closedCurvature` é NaN porque uma cena qualquer não tem forma fechada
 * conhecida. O campo só é lido pelos testes de D8, nunca em tempo de execução.
 */
export function sceneToExample(cena: SceneDoc): MetricExample {
  return {
    id: 'cena',
    label: cena.rotulo || 'Cena carregada',
    chart: chart(cena.carta),
    components: [...cena.metrica],
    bounds: { min: [...cena.limites.min], max: [...cena.limites.max] },
    initialPoint: [...cena.ponto],
    initialVector: [...cena.vetor],
    initialOmega: [...cena.omega],
    maxVector: cena.maxVetor,
    closedCurvature: () => Number.NaN,
    embedding: cena.mergulho,
    note: cena.nota,
  };
}
