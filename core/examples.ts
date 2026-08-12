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
  /** Só a esfera tem mergulho em ℝ³ nesta etapa; as outras vivem só no painel 2D. */
  readonly embedding: 'sphere' | null;
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
  embedding: 'sphere',
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
  initialVector: [2.4, 0.9],
  initialOmega: [1.2, 2],
  maxVector: 7,
  closedCurvature: (x) => -1 / (x[0]! * x[0]! * x[0]!),
  embedding: null,
  note:
    'K = -M/r³. Em r=2 a carta falha mas a geometria está bem (horizonte); ' +
    'em r=0 a curvatura diverge de verdade.',
};

export const EXAMPLES: readonly MetricExample[] = [
  SPHERE_EXAMPLE,
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
  readonly bemol: number;
  /** A métrica como o autor digitou, que pode já ter divergido do exemplo. */
  readonly metrica: readonly string[];
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
    maxVetor: example.maxVector,
    bemol: estado.bemol,
    // O arquivo de cena é lido e escrito por gente, então fala português; o
    // código interno segue em inglês. A tradução mora aqui, nas duas pontes, e
    // em nenhum outro lugar.
    mergulho: example.embedding === 'sphere' ? 'esfera' : null,
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
    embedding: cena.mergulho === 'esfera' ? 'sphere' : null,
    note: cena.nota,
  };
}
