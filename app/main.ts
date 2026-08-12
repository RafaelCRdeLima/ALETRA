import * as THREE from 'three';
import { christoffelFromMetric } from '../core/christoffel-fd';
import { degeneracyMask, probeMetric, type MetricProbe } from '../core/degenerate';
import {
  EXAMPLES,
  exampleById,
  exampleToScene,
  sceneToExample,
  type MetricExample,
} from '../core/examples';
import { sceneFromParam, sceneToParam, type SceneDoc } from '../core/scene';
import { evaluate, form, type Form } from '../core/forms';
import { flatForm } from '../core/musical';
import { cellEdges, cellEdgesFromDensity, wedge } from '../core/wedge';
import { differential0, differential1, type FormField } from '../core/exterior';
import { flowPath } from '../core/flow';
import { lieBracket } from '../core/lie';
import { enclosedArea, holonomy, rectangleLoop } from '../core/transport';
import { gaussianCurvature } from '../core/curvature';
import { geodesicDeviation, traceGeodesic, type Geodesica } from '../core/geodesic';
import { compileFormField, compileScalar } from '../core/metric-expr';
import { ParseError } from '../core/expr';
import { normSquared, type ChristoffelFn, type MetricFn } from '../core/metric';
import { compileMetric, componentIndices } from '../core/metric-expr';
import { read } from '../core/reading';
import { sphereChartOf } from '../core/sphere';
import { createChartPanel } from '../render/svg/chart-panel';
import { fromWorld, sphereFrame, toWorld, type TangentFrame } from '../render/three/frame';
import { disposeChildren } from '../render/three/primitives';
import { basico } from '../render/three/materials';
import { createStage, PALETTE } from '../render/three/scene';
import { buildStack } from '../render/three/stack';
import { buildVector } from '../render/three/vector';
import { veilTexture } from '../render/three/veil';

const DIM = 2;
const R = 1;
const DISC_RADIUS = 0.5;
const MASK_RESOLUTION = 56;

interface Scene {
  example: MetricExample;
  components: string[];
  metric: MetricFn;
  christoffel: ChristoffelFn;
  mask: Uint8Array | null;
  x: Float64Array;
  v: Float64Array;
  /** Segundo vetor, para cercar a região cujas células se contam (Etapa 5). */
  u: Float64Array;
  omega: Form;
  /** Segunda 1-form: ω ∧ η é a 2-form da cena. */
  eta: Form;
  /**
   * A diagonal do laço da holonomia (Etapa 8).
   *
   * Estado próprio, e não `u` reaproveitado: a escala natural de um vetor
   * tangente e a de um laço diferem por uma ordem de grandeza. Com `u` servindo
   * aos dois, o laço nascia do tamanho de uma seta, o giro dava 0,06 rad, e os
   * dois vetores se sobrepunham — a etapa inteira ficava invisível com os
   * números certos.
   */
  laco: Float64Array;
  parseError: string | null;
  probe: MetricProbe | null;
}

/**
 * O padrão de η e u é a rotação de 90° de ω e v na carta.
 *
 * Não é arbitrário: um η paralelo a ω daria ω∧η = 0 e um ladrilho sem células,
 * que é a pior primeira impressão possível para uma etapa cujo objetivo é
 * contar células. A rotação garante que a grade nasça bem cruzada.
 */
const perpendicular = (c: ArrayLike<number>): number[] => [-c[1]!, c[0]!];

/**
 * Um laço grande o bastante para o giro se ver.
 *
 * A holonomia é ∫∫K dA: num laço pequeno o ângulo é pequeno, e "o vetor volta
 * rodado" vira "o vetor volta". A diagonal é uma fração generosa da carta,
 * recortada para não passar dos limites a partir do ponto atual.
 */
function lacoPadrao(
  bounds: { min: readonly number[]; max: readonly number[] },
  ponto: readonly number[],
): Float64Array {
  const saida = new Float64Array(DIM);
  for (let i = 0; i < DIM; i++) {
    const span = bounds.max[i]! - bounds.min[i]!;
    const desejado = 0.32 * span;
    const cabe = bounds.max[i]! - ponto[i]!;
    saida[i] = Math.min(desejado, Math.max(0.05 * span, cabe * 0.85));
  }
  return saida;
}

/**
 * Qual vetor os controles de "u" editam: o segundo vetor, ou a diagonal do laço.
 * Um par de campos serve aos dois porque nunca aparecem juntos.
 */
const alvoU = (): Float64Array => (modo === 'holonomia' ? scene.laco : scene.u);

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} não encontrado`);
  return node as T;
};

const ptBR = (n: number): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ------------------------------------------------------------------- estado

/**
 * `?limpo=1` esconde todo o cromo e deixa só a cena e o numeral — as condições
 * que o PLAN.md especifica para o teste de 30 segundos da Etapa 1.
 * `?exemplo=<id>` escolhe a superfície; sem ele, a esfera (D6).
 */
const params = new URLSearchParams(window.location.search);
const MODO_LIMPO = params.get('limpo') === '1';

/**
 * A morfose de v para v♭, em [0, 1] (Etapa 3).
 *
 * Mora fora de `Scene` de propósito: é uma escolha de *vista*, não um dado da
 * cena. Trocar de superfície para comparar euclidiano com esfera — que é o
 * gesto central desta etapa — não pode desfazer a posição do controle.
 */
let bemol = 0;

/**
 * Modo de leitura. Em 'uma' o numeral conta folhas atravessadas por v; em
 * 'duas' conta células cercadas por u e v.
 *
 * São dois modos e não uma tela só porque as duas leituras competem: mostrar
 * ⟨ω,v⟩ e (ω∧η)(u,v) ao mesmo tempo obrigaria o aluno a descobrir sozinho qual
 * número corresponde a qual desenho, que é exatamente o trabalho que este
 * produto existe para poupar.
 */
type Modo = 'uma' | 'duas' | 'derivada' | 'colchete' | 'holonomia' | 'geodesica';
const MODOS: readonly Modo[] = ['uma', 'duas', 'derivada', 'colchete', 'holonomia', 'geodesica'];
const paramModo = params.get('modo');
let modo: Modo = MODOS.includes(paramModo as Modo) ? (paramModo as Modo) : 'uma';

/**
 * O campo ω e a função f da Etapa 6, como texto.
 *
 * São expressões e não constantes porque d de componentes constantes é zero: sem
 * campo não há derivada exterior para desenhar. Os padrões são escolhidos para o
 * primeiro olhar já mostrar alguma coisa — ω = -y dx + x dy circula (dω = 2), e
 * f = x·y dá um df cujo d colapsa.
 */
const campoOmega = ['0', '0'];
let funcaoF = '0';
let usarDf = false;
let erroCampo: string | null = null;

/** Os dois campos vetoriais da Etapa 7, e o tempo de cada trecho de fluxo. */
const campoX = ['1', '0'];
const campoY = ['0', 'x'];
/**
 * Passo de fluxo generoso por padrão.
 *
 * Com t pequeno o vão é da ordem de t² e vira alguns pixels num painel de
 * centenas — os números ficavam certos e o desenho ilegível, que para este
 * produto é o mesmo que estar errado. Com t grande o vão é visível, e a glosa
 * mostrando t²·|[X,Y]| ao lado deixa o próprio aluno ver a aproximação apertar
 * conforme ele encolhe o passo.
 */
let tempoFluxo = 1.2;

/** Alcance da geodésica (em λ) e se a vizinha é traçada junto. */
let alcance = 3;
let verDesvio = true;

/**
 * Padrões dos campos: X coordenado e Y = (1 + x) ∂_y, cujo colchete é ∂_y.
 *
 * Escolhidos para o quadrilátero nascer aberto **e não degenerado**. Dois campos
 * que comutam dariam vão zero, e o aluno veria um losango fechado sem saber que
 * aquilo era o ponto. Mas `Y = x ∂_y` — o exemplo de livro — tem outro problema:
 * ele *vale zero* na origem, que é o ponto inicial do plano euclidiano, e aí o
 * primeiro trecho de um dos caminhos não sai do lugar. Os dois caminhos se
 * sobrepõem, o quadrilátero vira triângulo, e o desenho conta uma história
 * errada. O `1 +` não muda o colchete e desfaz a degenerescência.
 *
 * O caso que comuta continua a um campo de distância: trocar `1 + x` por `1`
 * fecha o quadrilátero na frente do aluno.
 */
function padroesDosCampos(nomes: readonly string[]): { x: [string, string]; y: [string, string] } {
  const a = nomes[0] ?? 'x';
  return { x: ['1', '0'], y: ['0', `1 + ${a}`] };
}

/**
 * Passo de fluxo proporcional ao tamanho da carta.
 *
 * Um t fixo serve a uma carta só: 1,2 é generoso no plano euclidiano (que vai de
 * -3 a 3) e joga o caminho para fora da esfera (onde θ só vai até π). A fração
 * do menor intervalo mantém o quadrilátero visível e dentro da carta em todas.
 */
function passoPadrao(bounds: { min: readonly number[]; max: readonly number[] }): number {
  const menor = Math.min(bounds.max[0]! - bounds.min[0]!, bounds.max[1]! - bounds.min[1]!);
  return Math.min(2, Math.max(0.1, 0.2 * menor));
}

/**
 * Os padrões do campo vêm dos nomes da carta, não escritos à mão.
 *
 * `-y dx + x dy` só faz sentido numa carta que tenha x e y; na esfera daria erro
 * de parse na primeira troca de superfície. Montando a partir de `chart.names`,
 * o padrão nasce válido em qualquer carta — e continua sendo uma forma que
 * circula (dω = 2), que é o que o primeiro olhar precisa mostrar.
 *
 * O `1 -` não é enfeite. Com ω = -y dx + x dy exato, o campo **vale zero** na
 * origem, que é o ponto inicial do plano euclidiano: as células apareciam e a
 * pilha de ω não, o que parece defeito e é geometria. A constante desloca ω sem
 * mexer em dω — a derivada não vê constante — então a pilha aparece e a
 * circulação continua sendo 2.
 */
function padroesDoCampo(nomes: readonly string[]): { omega: [string, string]; f: string } {
  const [a, b] = [nomes[0] ?? 'x', nomes[1] ?? 'y'];
  return { omega: [`1 - ${b}`, a], f: `${a}*${b}` };
}

/**
 * Uma cena vinda do endereço tem precedência sobre `?exemplo=`, e um endereço
 * quebrado não pode derrubar a página: a cena de origem continua sendo aberta e
 * a mensagem explica o que houve. Um aluno que recebeu um link truncado no
 * WhatsApp precisa ver *alguma coisa*, não uma tela branca.
 */
let cenaInicial: SceneDoc | null = null;
let erroCena: string | null = null;
const paramCena = params.get('cena');
if (paramCena !== null) {
  try {
    cenaInicial = sceneFromParam(paramCena);
    bemol = cenaInicial.bemol;
    modo = cenaInicial.modo;
  } catch (error) {
    erroCena = error instanceof Error ? error.message : 'não consegui ler a cena do endereço';
  }
}

let scene: Scene = buildScene(
  cenaInicial ? sceneToExample(cenaInicial) : exampleById(params.get('exemplo') ?? ''),
);
scene.parseError = erroCena;
// η e u não passam pelo `MetricExample`, que descreve a superfície e não os
// objetos em cima dela — então vêm da cena diretamente.
if (cenaInicial) {
  scene.eta = form(DIM, 1, [...cenaInicial.eta]);
  scene.u.set(cenaInicial.u);
  if (cenaInicial.laco) scene.laco.set(cenaInicial.laco);
}

function buildScene(example: MetricExample): Scene {
  const components = [...example.components];
  const metric = compileMetric({ chart: example.chart, components });
  return {
    example,
    components,
    metric,
    christoffel: christoffelFromMetric(metric, DIM),
    mask: degeneracyMask(metric, DIM, example.bounds, MASK_RESOLUTION),
    x: Float64Array.from(example.initialPoint),
    v: Float64Array.from(example.initialVector),
    u: Float64Array.from(perpendicular(example.initialVector)),
    omega: form(DIM, 1, [...example.initialOmega]),
    eta: form(DIM, 1, perpendicular(example.initialOmega)),
    laco: lacoPadrao(example.bounds, example.initialPoint),
    parseError: null,
    probe: null,
  };
}

/** Recompila a métrica digitada. Erro de parse não derruba a cena — congela nela. */
function recompile(): void {
  try {
    const metric = compileMetric({ chart: scene.example.chart, components: scene.components });
    scene.metric = metric;
    scene.christoffel = christoffelFromMetric(metric, DIM);
    scene.mask = degeneracyMask(metric, DIM, scene.example.bounds, MASK_RESOLUTION);
    scene.parseError = null;
  } catch (error) {
    scene.parseError =
      error instanceof ParseError || error instanceof Error
        ? error.message
        : 'não consegui ler esta métrica';
  }
}

/**
 * O mergulho em ℝ³ é o da esfera unitária, em forma fechada. Se o aluno editar a
 * métrica, ele deixa de corresponder ao que está escrito — e o painel precisa
 * dizer isso em vez de desenhar uma superfície que não é mais a da conta.
 */
function embeddingMatches(): boolean {
  return (
    scene.example.embedding === 'sphere' &&
    scene.components.every((text, i) => text === scene.example.components[i])
  );
}

// -------------------------------------------------------------- painel 3D

const stage = createStage(el('stage'), R);

// No modo limpo o painel ocupa a tela inteira em vez de metade dela, então a
// mesma câmera deixa sobrar margem. Aproximar transforma essa sobra em folha
// maior — e o que o teste de 30 segundos mede é justamente se as folhas se
// leem.
if (MODO_LIMPO) stage.camera.position.multiplyScalar(0.82);
const veil = veilTexture();
const tangentGroup = new THREE.Group();
const stackGroup = new THREE.Group();
const bemolGroup = new THREE.Group();
const vectorGroup = new THREE.Group();
stage.scene.add(tangentGroup, stackGroup, bemolGroup, vectorGroup);

const pointHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 24, 16),
  new THREE.MeshStandardMaterial({ color: PALETTE.handle, roughness: 0.3 }),
);
const tipHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.038, 24, 16),
  new THREE.MeshStandardMaterial({
    color: PALETTE.vector,
    roughness: 0.35,
    transparent: true,
    opacity: 0.6,
  }),
);
const uHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.036, 24, 16),
  new THREE.MeshStandardMaterial({
    color: PALETTE.eta,
    roughness: 0.35,
    transparent: true,
    opacity: 0.65,
  }),
);
stage.scene.add(pointHandle, tipHandle, uHandle);

let frame: TangentFrame = sphereFrame(R, scene.x);

/** Enquanto false, o laço de animação não gasta frame com um canvas escondido. */
let painelAtivo = true;

/**
 * As opacidades da morfose (Etapa 3).
 *
 * A seta nunca some de todo: some ela e o aluno vê duas pilhas trocando de cor,
 * em vez de um objeto mudando de notação. ω escurece mas fica, porque o numeral
 * ⟨ω,v⟩ continua na tela e um número sem referente visível é o que este produto
 * existe para não fazer.
 */
function opacidades(): { omega: number; bemol: number; seta: number } {
  return {
    omega: 0.92 * (1 - 0.8 * bemol),
    bemol: 0.95 * bemol,
    seta: 1 - 0.68 * bemol,
  };
}

/** Componentes só entram no desenho se forem finitos — métrica degenerada dá NaN. */
function finitos(components: Float64Array): Float64Array {
  for (let i = 0; i < components.length; i++) {
    if (!Number.isFinite(components[i]!)) return new Float64Array(components.length);
  }
  return components;
}

function render3D(
  value: number,
  active: boolean,
  vBemol: Form,
  comCelulas: boolean,
  omegaLocal: Form,
): void {
  painelAtivo = active;
  stage.renderer.domElement.style.display = active ? '' : 'none';
  for (const object of [
    tangentGroup,
    stackGroup,
    bemolGroup,
    vectorGroup,
    pointHandle,
    tipHandle,
    uHandle,
  ]) {
    object.visible = active;
  }

  const aviso = el<HTMLParagraphElement>('sem-mergulho');
  aviso.hidden = active;
  if (!active) {
    aviso.textContent =
      modo === 'colchete' || modo === 'holonomia' || modo === 'geodesica'
      ? 'Esta leitura vive na carta: é lá que o laço se fecha e o giro se lê. ' +
        'Ainda não há desenho dela em ℝ³.'
      : scene.example.embedding === 'sphere'
        ? 'A métrica foi editada: o mergulho desenhado aqui é o da esfera original e já não ' +
          'corresponde ao que está escrito. O painel de carta continua correto.'
        : `Esta métrica não tem um mergulho em ℝ³ definido neste estágio — ${scene.example.label} ` +
          'vive só na carta. O painel ao lado continua sendo a geometria inteira.';
    return;
  }

  atualizarPlanoTangente(frame);

  const opa = opacidades();

  disposeChildren(stackGroup);
  stackGroup.add(
    buildStack(form(DIM, 1, Array.from(finitos(omegaLocal.components))), frame, veil, {
      radius: DISC_RADIUS,
      maxSheets: 14,
      thickness: 0.13,
      color: PALETTE.brand,
      opacity: opa.omega,
    }),
  );

  // No modo 2-form este grupo carrega η: a pilha dele cruza a de ω e o ladrilho
  // aparece no próprio plano tangente, que é plano — as células são coplanares
  // e a ressalva de D10 sobre profundidade não chega a valer aqui.
  disposeChildren(bemolGroup);
  if (modo === 'duas') {
    bemolGroup.add(
      buildStack(scene.eta, frame, veil, {
        radius: DISC_RADIUS,
        maxSheets: 14,
        thickness: 0.13,
        color: PALETTE.eta,
        opacity: 0.9,
      }),
    );
  } else if (opa.bemol > 0.01) {
    bemolGroup.add(
      buildStack(form(DIM, 1, Array.from(finitos(vBemol.components))), frame, veil, {
        radius: DISC_RADIUS,
        maxSheets: 14,
        thickness: 0.13,
        color: PALETTE.vector,
        opacity: opa.bemol,
      }),
    );
  }

  disposeChildren(vectorGroup);
  vectorGroup.add(
    buildVector(frame, scene.v, value, {
      shaftRadius: 0.016,
      headLength: 0.08,
      headRadius: 0.04,
      colorWhole: PALETTE.vector,
      colorFraction: PALETTE.fraction,
      opacity: opa.seta,
      showFraction: !comCelulas,
    }),
  );
  if (comCelulas) {
    vectorGroup.add(
      buildVector(frame, scene.u, 0, {
        shaftRadius: 0.014,
        headLength: 0.07,
        headRadius: 0.036,
        colorWhole: PALETTE.eta,
        colorFraction: PALETTE.eta,
        showFraction: false,
      }),
    );
  }

  pointHandle.position.copy(frame.point);
  tipHandle.position.copy(frame.point).add(toWorld(frame, scene.v));
  uHandle.visible = comCelulas;
  if (comCelulas) uHandle.position.copy(frame.point).add(toWorld(frame, scene.u));
}

const gScratch = new Float64Array(DIM * DIM);

/**
 * Recorta o vetor pelo comprimento **métrico**, não pelo da tela.
 *
 * Antes havia dois recortes brigando: um em unidades de mundo (do disco do painel
 * 3D) e outro em fração do intervalo da carta. O primeiro vencia, e o resultado
 * era o vetor do painel 2D limitado por um raio de disco que não significa nada
 * na carta. |v|_g é a mesma quantidade nos dois painéis — e, como a métrica
 * induzida é o pullback do mergulho, é exatamente o comprimento da seta em ℝ³.
 */
function clampVectorMetric(vetor: Float64Array): void {
  scene.metric(scene.x, gScratch);
  const lengthSq = normSquared(gScratch, vetor, DIM);
  if (!Number.isFinite(lengthSq) || lengthSq <= 0) return;

  const length = Math.sqrt(lengthSq);
  const max = scene.example.maxVector;
  if (length > max) {
    const factor = max / length;
    for (let i = 0; i < DIM; i++) vetor[i] *= factor;
  }
}

/**
 * O disco tangente e as setas da base são criados **uma vez** e atualizados no
 * lugar.
 *
 * A geometria deles não muda com o arraste — só a posição e a orientação. Antes
 * eram reconstruídos por evento, junto com material e geometria novos, o que
 * somava alocação e recompilação de shader ao custo de cada movimento do mouse.
 * Mover um objeto que já existe é uma matriz; recriá-lo é tudo de novo.
 */
const tangentDisc = new THREE.Mesh(
  new THREE.CircleGeometry(DISC_RADIUS, 64),
  basico(PALETTE.tangent, 0.1, { depthWrite: false }),
);
tangentDisc.renderOrder = 1;

const basisArrows = [0, 1].map(() => {
  const helper = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(),
    1,
    PALETTE.tangent,
    0.06,
    0.03,
  );
  helper.renderOrder = 2;
  return helper;
});
tangentGroup.add(tangentDisc, ...basisArrows);

const EIXO_Z = new THREE.Vector3(0, 0, 1);

function atualizarPlanoTangente(f: TangentFrame): void {
  tangentDisc.quaternion.setFromUnitVectors(EIXO_Z, f.normal);
  tangentDisc.position.copy(f.point);

  f.basis.forEach((e, i) => {
    const seta = basisArrows[i];
    if (!seta) return;
    seta.position.copy(f.point);
    seta.setDirection(e.clone().normalize());
    seta.setLength(Math.min(e.length(), DISC_RADIUS * 0.8), 0.06, 0.03);
  });
}

// -------------------------------------------------------------- painel 2D

const chartPanel = createChartPanel({
  onPointDrag: (a, b) => movePoint(Float64Array.from([a, b])),
  onVectorDrag: (a, b) => {
    scene.v.set([a, b]);
    update();
  },
  onVectorUDrag: (a, b) => {
    alvoU().set([a, b]);
    update();
  },
});
el('carta-corpo').appendChild(chartPanel.element);

/**
 * Move o ponto base, mas nunca para dentro de uma região degenerada (D7): ali a
 * conta não existe, então a alça simplesmente não vai — e a interface diz por quê,
 * distinguindo a carta que falha da geometria que diverge.
 */
function movePoint(candidate: Float64Array): void {
  const { min, max } = scene.example.bounds;
  for (let i = 0; i < DIM; i++) {
    candidate[i] = Math.max(min[i]!, Math.min(max[i]!, candidate[i]!));
  }

  const probe = probeMetric(scene.metric, scene.christoffel, DIM, candidate);
  if (probe.kind !== 'ok') {
    scene.probe = probe;
    update();
    return;
  }
  scene.probe = null;
  scene.x.set(candidate);
  update();
}

// ------------------------------------------------------------------ numeral

/**
 * Montado por nó, não por innerHTML. Só entram números formatados aqui, então a
 * string seria segura hoje — mas D4 existe justamente para que este produto não
 * tenha caminho de HTML interpolado, e deixar um aberto convida o próximo trecho
 * a interpolar algo que veio do aluno.
 */
function paintNumeral(
  value: number,
  colchete: Colchete | null,
  giro: Giro | null,
  traco: Traco | null,
): void {
  const reading = read(value);
  el('numeral-value').textContent = Number.isFinite(value) ? ptBR(reading.value) : '—';

  // O colchete não conta nada: ele mede um vão. A glosa põe ao lado o que a
  // teoria prevê, t²·|[X,Y]|, porque é a comparação que distingue "abriu" de
  // "abriu pelo colchete" — sem ela, erro de integração passaria por geometria.
  // A holonomia é um ângulo, e a glosa põe ao lado a área cercada — que é o
  // mesmo número quando K = 1. É a leitura de Gauss-Bonnet acontecendo na tela:
  // o ângulo não *parece* a área, ele **é** a área.
  // A geodésica não conta nada: mede comprimento. A glosa mostra a separação da
  // vizinha, que é a curvatura vista como efeito — encolhe onde K>0, cresce onde
  // K<0. E o aviso de parada, quando há, é conteúdo (D7).
  if (modo === 'geodesica') {
    const alvo = el('numeral-gloss');
    if (traco?.vizinha) {
      const forte = document.createElement('span');
      forte.className = 'frac';
      forte.textContent = ptBR(traco.separacaoFinal);
      alvo.replaceChildren(`separação ${ptBR(traco.separacaoInicial)} → `, forte);
    } else {
      alvo.replaceChildren('comprimento de arco');
    }
    const parada = el('parada-geodesica');
    parada.textContent = traco ? (PARADA[traco.principal.motivo] ?? '') : '';
    return;
  }

  if (modo === 'holonomia') {
    const alvo = el('numeral-gloss');
    const forte = document.createElement('span');
    forte.className = 'frac';
    forte.textContent = giro ? ptBR(giro.area) : '—';
    alvo.replaceChildren('área cercada = ', forte, ' rad de curvatura');
    return;
  }

  if (modo === 'colchete') {
    const previsto = colchete ? ptBR(colchete.previsto) : '—';
    const alvo = el('numeral-gloss');
    const forte = document.createElement('span');
    forte.className = 'frac';
    forte.textContent = previsto;
    alvo.replaceChildren('t²·|[X, Y]| = ', forte);
    return;
  }

  // A unidade muda com o modo, mas a disciplina de D11 não: o inteiro é o que
  // foi atravessado ou cercado por completo, e a fração nunca some.
  const [singular, plural] =
    modo === 'uma' ? ['folha', 'folhas'] : ['célula', 'células'];
  const inteiras = Math.abs(reading.whole);
  const resto = document.createElement('span');
  resto.className = 'frac';

  if (inteiras === 0) {
    resto.textContent = ptBR(Math.abs(reading.fraction));
    el('numeral-gloss').replaceChildren(resto, ` de uma ${singular}`);
    return;
  }
  resto.textContent = `+ ${ptBR(Math.abs(reading.fraction))}`;
  el('numeral-gloss').replaceChildren(
    `${inteiras} ${inteiras === 1 ? singular : plural} `,
    resto,
  );
}

const forte = (texto: string): HTMLElement => {
  const b = document.createElement('b');
  b.textContent = texto;
  return b;
};

/**
 * A leitura de v♭ — os mesmos componentes de v passados pela métrica.
 *
 * É aqui que a Etapa 3 fica literal: no plano euclidiano estes números são
 * idênticos aos de v, e na esfera não são. O aluno não precisa acreditar que a
 * métrica faz diferença; ele lê a diferença, e vê os dois casos trocando o
 * seletor de superfície.
 *
 * |v|² é ⟨v♭, v⟩, ou seja quantas folhas de v♭ a própria seta atravessa.
 */
function paintBemol(vBemol: Form): void {
  const alvo = el('v-bemol');
  const [b0, b1] = [vBemol.components[0] ?? 0, vBemol.components[1] ?? 0];
  const normaQuadrada = evaluate(vBemol, [scene.v]);

  alvo.replaceChildren(
    'v♭ = (',
    forte(ptBR(b0)),
    ' ; ',
    forte(ptBR(b1)),
    ') · |v|² = ',
    forte(ptBR(normaQuadrada)),
  );
}

/**
 * O campo ω do modo derivada: o que foi digitado, ou df da função digitada.
 *
 * O segundo caso é a demonstração de d² = 0. Marcar "usar ω = df" troca o campo
 * por um que é, por construção, o diferencial de alguma coisa — e as células de
 * dω somem da tela. O zero não é afirmado por texto: ele é o ladrilho acabando.
 */
function compilarCampo(): FormField | null {
  try {
    erroCampo = null;
    if (!usarDf) return compileFormField(scene.example.chart, campoOmega);

    const f = compileScalar(scene.example.chart, funcaoF);
    return (x, out) => {
      out.set(differential0(f, x, DIM).components);
    };
  } catch (error) {
    erroCampo = error instanceof Error ? error.message : 'não consegui ler o campo';
    return null;
  }
}

function avaliarCampo(campo: FormField): Form {
  const out = new Float64Array(DIM);
  campo(scene.x, out);
  return form(DIM, 1, Array.from(out));
}

interface Giro {
  readonly caminho: Float64Array[];
  readonly transportado: Float64Array;
  readonly angulo: number;
  readonly area: number;
  /** Densidade da 2-form de curvatura no centro do laço: K·√det g. */
  readonly densidade: number;
  readonly desvioDeNorma: number;
}

/**
 * O laço, o vetor que voltou dele, e o ângulo.
 *
 * `u` é reaproveitado como o canto oposto do laço — não é um vetor tangente
 * neste modo, é a diagonal do retângulo. Reusar a alça que já existe evita mais
 * um controle numa barra já cheia, e o número nos campos continua querendo dizer
 * a mesma coisa: um deslocamento em coordenadas.
 *
 * `densidade` alimenta o ladrilho: a 2-form de curvatura é K·dA, então cada
 * célula dela vale exatamente **um radiano** de holonomia. Contar as células
 * dentro do laço é ler o ângulo — a oportunidade que D12 anotou seis etapas
 * atrás, cobrada aqui.
 */
function calcularGiro(): Giro | null {
  const oposto = Float64Array.from([scene.x[0]! + scene.laco[0]!, scene.x[1]! + scene.laco[1]!]);
  const caminho = rectangleLoop(scene.x, oposto);
  const h = holonomy(scene.metric, scene.christoffel, caminho, scene.v, DIM, 32);
  if (!Number.isFinite(h.angulo)) return null;

  const centro = Float64Array.from([
    scene.x[0]! + scene.laco[0]! / 2,
    scene.x[1]! + scene.laco[1]! / 2,
  ]);
  const g = new Float64Array(DIM * DIM);
  scene.metric(centro, g);
  const det = g[0]! * g[3]! - g[1]! * g[2]!;
  const K = gaussianCurvature(scene.metric, scene.christoffel, centro);

  return {
    caminho,
    transportado: h.final,
    angulo: h.angulo,
    area: enclosedArea(scene.metric, scene.x, oposto, DIM, 32),
    densidade: det > 0 && Number.isFinite(K) ? K * Math.sqrt(det) : 0,
    desvioDeNorma: Math.abs(h.normaFinal - h.normaInicial),
  };
}

interface Traco {
  readonly principal: Geodesica;
  readonly vizinha: Geodesica | null;
  readonly separacaoInicial: number;
  readonly separacaoFinal: number;
}

const PARADA: Readonly<Record<string, string>> = {
  completa: '',
  'fora-da-carta': 'A geodésica saiu da região desenhada da carta — ela continua, o desenho é que acabou.',
  'metrica-degenerada':
    'A geodésica parou onde a métrica deixa de servir. Não é a curva que acaba: é a carta. ' +
    'Em Schwarzschild isto é o horizonte, e outra escolha de coordenadas atravessaria.',
};

/**
 * A geodésica a partir de (p, v), e a vizinha que mostra o desvio.
 *
 * O passo de integração vem do alcance dividido por um número fixo de amostras,
 * e não o contrário: assim mexer no alcance muda o quanto da curva se vê, e não
 * a qualidade com que ela é integrada.
 */
function tracarGeodesica(): Traco | null {
  const AMOSTRAS = 220;
  const opcoes = {
    passos: AMOSTRAS,
    dLambda: alcance / AMOSTRAS,
    limites: scene.example.bounds,
  };
  if (!Number.isFinite(scene.v[0]!) || !Number.isFinite(scene.v[1]!)) return null;

  if (!verDesvio) {
    const principal = traceGeodesic(
      scene.metric, scene.christoffel, scene.x, scene.v, DIM, opcoes,
    );
    return { principal, vizinha: null, separacaoInicial: 0, separacaoFinal: 0 };
  }

  // O deslocamento da vizinha é perpendicular à partida, para a separação medir
  // desvio e não atraso: duas geodésicas na mesma reta se afastariam por estarem
  // em pontos diferentes da mesma curva, o que não é curvatura nenhuma.
  const lado = perpendicular(scene.v);
  const escala = 0.04 * Math.min(
    scene.example.bounds.max[0]! - scene.example.bounds.min[0]!,
    scene.example.bounds.max[1]! - scene.example.bounds.min[1]!,
  );
  const norma = Math.hypot(lado[0]!, lado[1]!) || 1;
  const offset = Float64Array.from([(lado[0]! / norma) * escala, (lado[1]! / norma) * escala]);

  const d = geodesicDeviation(
    scene.metric, scene.christoffel, scene.x, scene.v, offset, DIM, opcoes,
  );
  return {
    principal: d.principal,
    vizinha: d.vizinha,
    separacaoInicial: d.separacoes[0] ?? 0,
    separacaoFinal: d.separacoes[d.separacoes.length - 1] ?? 0,
  };
}

interface Colchete {
  readonly caminhoXY: Float64Array[];
  readonly caminhoYX: Float64Array[];
  readonly vao: number;
  readonly previsto: number;
}

/**
 * O quadrilátero de fluxos, com os caminhos inteiros e não só as pontas.
 *
 * `previsto` é t²·|[X,Y]| — a previsão da teoria. Mostrar os dois lado a lado é
 * o que separa "o quadrilátero abriu" de "o quadrilátero abriu **pelo colchete**":
 * sem a comparação, um erro de integração pareceria geometria.
 */
function calcularColchete(): Colchete | null {
  try {
    erroCampo = null;
    const X = compileFormField(scene.example.chart, campoX);
    const Y = compileFormField(scene.example.chart, campoY);
    const PASSOS = 14;
    const t = tempoFluxo;

    const trechoX = flowPath(X, scene.x, t, PASSOS, DIM);
    const trechoXY = flowPath(Y, trechoX[trechoX.length - 1]!, t, PASSOS, DIM);
    const trechoY = flowPath(Y, scene.x, t, PASSOS, DIM);
    const trechoYX = flowPath(X, trechoY[trechoY.length - 1]!, t, PASSOS, DIM);

    const fimXY = trechoXY[trechoXY.length - 1]!;
    const fimYX = trechoYX[trechoYX.length - 1]!;
    const b = lieBracket(X, Y, scene.x, DIM);

    return {
      caminhoXY: [...trechoX, ...trechoXY.slice(1)],
      caminhoYX: [...trechoY, ...trechoYX.slice(1)],
      vao: Math.hypot(fimXY[0]! - fimYX[0]!, fimXY[1]! - fimYX[1]!),
      previsto: t * t * Math.hypot(b[0]!, b[1]!),
    };
  } catch (error) {
    erroCampo = error instanceof Error ? error.message : 'não consegui ler os campos';
    return null;
  }
}

// ------------------------------------------------------------------- update

function update(): void {
  // O recorte vem antes de ler o número: se acontecesse durante o desenho do 3D,
  // a carta e o numeral mostrariam o valor de antes do recorte e os dois painéis
  // discordariam por um frame — justamente o que esta etapa existe para não fazer.
  // Os dois vetores, pela mesma régua. Recortar só v deixava u crescer além do
  // disco tangente — e o disco *é* o desenho do plano tangente, então uma seta
  // que passa dele lê-se como uma seta que saiu da superfície.
  clampVectorMetric(scene.v);
  clampVectorMetric(scene.u);
  const comMergulho = embeddingMatches();
  if (comMergulho) frame = sphereFrame(R, scene.x);
  document.body.classList.toggle('sem-mergulho', !comMergulho);

  const duasFormas = modo === 'duas';
  const derivada = modo === 'derivada';
  const colchete = modo === 'colchete' ? calcularColchete() : null;
  const giro = modo === 'holonomia' ? calcularGiro() : null;
  const traco = modo === 'geodesica' ? tracarGeodesica() : null;
  const comCelulas = duasFormas || derivada;

  // No modo derivada ω é o campo digitado (ou df dele), avaliado em p para a
  // pilha; a 2-form desenhada é dω, a circulação em torno da célula.
  const campo = derivada ? compilarCampo() : null;
  const dOmega = campo
    ? // Passo externo maior quando ω já é df: as diferenças finitas se encadeiam,
      // e o ruído do nível de dentro é dividido pelo passo de fora.
      differential1(campo, scene.x, DIM, usarDf ? 1e-3 : undefined)
    : null;
  const omegaLocal = campo ? avaliarCampo(campo) : scene.omega;

  const sigma = duasFormas ? wedge(scene.omega, scene.eta) : dOmega;
  const value =
    modo === 'geodesica'
      ? (traco?.principal.comprimento ?? 0)
      : modo === 'holonomia'
      ? (giro?.angulo ?? 0)
      : modo === 'colchete'
      ? (colchete?.vao ?? 0)
      : comCelulas
        ? sigma
          ? evaluate(sigma, [scene.u, scene.v])
          : 0
        : evaluate(scene.omega, [scene.v]);
  const vBemol = flatForm(scene.metric, scene.x, scene.v, DIM);
  const opa = opacidades();

  // No modo 2-form a segunda camada é η, e o cruzamento das duas pilhas é o
  // ladrilho. No modo 1-form ela é v♭, que é a leitura da Etapa 3.
  // No colchete não há one-form em cena: o desenho é só o quadrilátero.
  const camadas = [
    {
      components: finitos(omegaLocal.components),
      classe: 'folha',
      // Nas leituras que não têm one-form em cena — colchete, holonomia,
      // geodésica — a pilha de ω seria ruído puro sobre o que importa.
      opacidade:
        modo === 'colchete' || modo === 'holonomia' || modo === 'geodesica' ? 0 : opa.omega,
    },
    duasFormas
      ? { components: scene.eta.components, classe: 'folha-eta', opacidade: 0.92 }
      : {
          components: derivada ? new Float64Array(DIM) : finitos(vBemol.components),
          classe: 'folha-bemol',
          opacidade: derivada ? 0 : opa.bemol,
        },
  ];

  // No modo limpo a carta só aparece quando não há mergulho. Desenhar num painel
  // escondido custaria uma reconstrução de SVG por arraste, à toa.
  if (!MODO_LIMPO || !comMergulho) {
    chartPanel.render({
      bounds: scene.example.bounds,
      names: scene.example.chart.symbols,
      stacks: camadas,
      cell: giro
        ? {
            // O retângulo do laço, ladrilhado pela 2-form de curvatura: cada
            // célula vale um radiano de holonomia.
            u: Float64Array.from([scene.laco[0]!, 0]),
            v: Float64Array.from([0, scene.laco[1]!]),
            lattice: cellEdgesFromDensity(giro.densidade),
          }
        : comCelulas
        ? {
            u: scene.u,
            v: scene.v,
            // Com ∧ o retículo vem da fatoração escolhida; com dω não há
            // fatoração alguma, só a densidade — e aí o quadrado alinhado aos
            // eixos é a escolha que menos inventa.
            lattice: duasFormas
              ? cellEdges(scene.omega, scene.eta)
              : cellEdgesFromDensity(dOmega?.components[0] ?? 0),
          }
        : null,
      vectorU: comCelulas ? scene.u : giro ? scene.laco : null,
      loop: giro ? { caminho: giro.caminho, transportado: giro.transportado } : null,
      geodesic: traco
        ? { principal: traco.principal.caminho, vizinha: traco.vizinha?.caminho ?? null }
        : null,
      bracket: colchete
        ? { caminhoXY: colchete.caminhoXY, caminhoYX: colchete.caminhoYX }
        : null,
      point: scene.x,
      vector: scene.v,
      mask: scene.mask,
      maskResolution: MASK_RESOLUTION,
      cut: comCelulas || giro || traco ? null : { value, whole: read(value).whole },
    });
  }

  // O quadrilátero de fluxos ainda não tem desenho em ℝ³ — ele vive na carta.
  // Mostrar a cena 3D sem ele exibiria um vetor que não participa da leitura.
  // Nem o quadrilátero de fluxos nem o laço da holonomia têm desenho em ℝ³:
  // os dois vivem na carta. Mostrar a cena 3D sem eles exibiria um vetor que
  // não participa da leitura.
  const tresDe =
    comMergulho && modo !== 'colchete' && modo !== 'holonomia' && modo !== 'geodesica';
  render3D(value, tresDe, vBemol, comCelulas, omegaLocal);
  paintNumeral(value, colchete, giro, traco);
  paintBemol(vBemol);
  syncVectorFields();
  syncUFields();

  const erro = el<HTMLParagraphElement>('erro-metrica');
  const mensagem = scene.parseError ?? (derivada ? erroCampo : null);
  erro.hidden = mensagem === null;
  erro.textContent = mensagem ?? '';

  const aviso = el<HTMLParagraphElement>('aviso-singularidade');
  aviso.hidden = scene.probe === null;
  aviso.textContent = scene.probe?.message ?? '';

  el('nota-exemplo').textContent = scene.example.note;
}

// ---------------------------------------------------------------- controles

/** A cena que veio do endereço, se veio — para dar para voltar a ela no seletor. */
const exemploCarregado = cenaInicial ? sceneToExample(cenaInicial) : null;

function buildSelector(): void {
  const select = el<HTMLSelectElement>('seletor');
  const opcoes = exemploCarregado ? [exemploCarregado, ...EXAMPLES] : [...EXAMPLES];

  select.replaceChildren(
    ...opcoes.map((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.label;
      return option;
    }),
  );
  select.addEventListener('change', () => {
    const escolhido =
      exemploCarregado && select.value === exemploCarregado.id
        ? exemploCarregado
        : exampleById(select.value);
    scene = buildScene(escolhido);
    buildMetricFields();
    buildVectorFields();
    buildUFields();
    syncOmegaControls();
    syncEtaControls();
    resetCampos();
    syncCampoLabels();
    update();
  });
}

/** A cena como está agora — inclusive a métrica que o aluno tenha editado. */
function cenaAtual(): SceneDoc {
  return exampleToScene(scene.example, {
    ponto: Array.from(scene.x),
    vetor: Array.from(scene.v),
    omega: Array.from(scene.omega.components),
    eta: Array.from(scene.eta.components),
    u: Array.from(scene.u),
    laco: Array.from(scene.laco),
    modo,
    bemol,
    metrica: scene.components,
    campos: {
      omega: [...campoOmega],
      f: funcaoF,
      usarDf,
      x: [...campoX],
      y: [...campoY],
      passo: tempoFluxo,
    },
  });
}

function bindCopiar(): void {
  const botao = el<HTMLButtonElement>('copiar');
  botao.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('cena', sceneToParam(cenaAtual()));
    if (MODO_LIMPO) url.searchParams.set('limpo', '1');
    const endereco = url.toString();

    const avisar = (texto: string): void => {
      botao.textContent = texto;
      window.setTimeout(() => {
        botao.textContent = 'copiar link';
      }, 2200);
    };

    // A área de transferência pode ser negada (permissão, contexto inseguro).
    // Nesse caso o endereço vai para a barra, de onde dá para copiar à mão —
    // nunca um beco sem saída.
    navigator.clipboard?.writeText(endereco).then(
      () => avisar('copiado!'),
      () => {
        window.history.replaceState(null, '', endereco);
        avisar('está na barra ↑');
      },
    );
  });
}

function buildMetricFields(): void {
  const host = el('campos-metrica');
  host.replaceChildren(
    ...scene.components.map((value, index) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'campo';

      const [i, j] = componentIndices(DIM, index);
      const label = document.createElement('span');
      const sub = document.createElement('sub');
      sub.textContent = `${scene.example.chart.symbols[i]}${scene.example.chart.symbols[j]}`;
      label.append('g', sub, ' =');

      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.spellcheck = false;
      input.addEventListener('input', () => {
        scene.components[index] = input.value;
        recompile();
        update();
      });

      wrapper.append(label, input);
      return wrapper;
    }),
  );
}

/**
 * Componentes de v, editáveis e vivos durante o arraste.
 *
 * Pedido pelos alunos que testaram, e o pedido apontava um problema real: ω
 * aparecia com números e v só como gesto. A assimetria sugeria que a one-form é
 * *dado* e o vetor é *interação*, quando os dois são objetos igualmente
 * concretos — e a conta que o produto inteiro exibe, ω_a v^a, precisa dos dois
 * lados visíveis para ser conferível.
 *
 * Índice em cima, não embaixo: v^θ contra ω_θ. A posição do índice é o que
 * distingue vetor de covetor, e é exatamente a distinção que a Etapa 3 vai
 * animar. Escrever os dois com subscrito seria mais fácil e ensinaria errado.
 *
 * Campo de texto e não `type="number"`: o resto da interface mostra "0,28" com
 * vírgula, e um input numérico recusa vírgula. A leitura aceita as duas.
 */
function buildVectorFields(): void {
  const host = el('campos-vetor');
  host.replaceChildren(
    ...Array.from({ length: DIM }, (_, index) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'campo campo-vetor';

      const label = document.createElement('span');
      const sup = document.createElement('sup');
      sup.textContent = scene.example.chart.symbols[index] ?? String(index);
      label.append('v', sup, ' =');

      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.spellcheck = false;
      input.dataset['componente'] = String(index);

      input.addEventListener('input', () => {
        const valor = Number(input.value.replace(',', '.').trim());
        if (!Number.isFinite(valor)) return;
        scene.v[index] = valor;
        update();
      });
      // Ao sair do campo, mostrar o que o estado de fato guarda: um valor grande
      // demais foi recortado por |v|_g e o campo precisa contar isso.
      input.addEventListener('blur', syncVectorFields);

      wrapper.append(label, input);
      return wrapper;
    }),
  );
  syncVectorFields();
}

function syncVectorFields(): void {
  const campos = document.querySelectorAll<HTMLInputElement>('#campos-vetor input');
  for (const input of campos) {
    // Nunca reescrever o campo que está sendo digitado — brigaria com o cursor.
    if (input === document.activeElement) continue;
    const index = Number(input.dataset['componente']);
    input.value = ptBR(scene.v[index] ?? 0);
  }
}

/** Campos do segundo vetor, com a mesma mecânica dos de v. */
function buildUFields(): void {
  const host = el('campos-u');
  host.replaceChildren(
    ...Array.from({ length: DIM }, (_, index) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'campo campo-vetor';

      const label = document.createElement('span');
      const sup = document.createElement('sup');
      sup.textContent = scene.example.chart.symbols[index] ?? String(index);
      label.append('u', sup, ' =');

      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.spellcheck = false;
      input.dataset['componente'] = String(index);
      input.addEventListener('input', () => {
        const valor = Number(input.value.replace(',', '.').trim());
        if (!Number.isFinite(valor)) return;
        alvoU()[index] = valor;
        update();
      });
      input.addEventListener('blur', syncUFields);

      wrapper.append(label, input);
      return wrapper;
    }),
  );
  syncUFields();
}

function syncUFields(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('#campos-u input')) {
    if (input === document.activeElement) continue;
    input.value = ptBR(alvoU()[Number(input.dataset['componente'])] ?? 0);
  }
}

function bindEta(): void {
  for (let i = 0; i < DIM; i++) {
    const input = el<HTMLInputElement>(`eta-${i}`);
    input.addEventListener('input', () => {
      const components = Array.from(scene.eta.components);
      components[i] = Number(input.value);
      scene.eta = form(DIM, 1, components);
      el(`eta-${i}-out`).textContent = ptBR(Number(input.value));
      update();
    });
  }
}

function syncEtaControls(): void {
  for (let i = 0; i < DIM; i++) {
    el<HTMLInputElement>(`eta-${i}`).value = String(scene.eta.components[i]);
    el(`eta-${i}-out`).textContent = ptBR(scene.eta.components[i]!);
    const rotulo = el(`rotulo-eta-${i}`);
    const sub = document.createElement('sub');
    sub.textContent = scene.example.chart.symbols[i] ?? String(i);
    rotulo.replaceChildren('η', sub);
  }
}

const ROTULO_NUMERAL: Readonly<Record<Modo, string>> = {
  geodesica: 'comprimento',
  uma: '⟨ω, v⟩',
  duas: '(ω∧η)(u, v)',
  derivada: 'dω(u, v)',
  colchete: '|vão|',
  holonomia: 'ângulo (rad)',
};

/**
 * `u` muda de papel conforme a leitura: segundo vetor no ∧, canto oposto do laço
 * na holonomia. O rótulo do bloco acompanha, senão o número na tela quer dizer
 * uma coisa e o título diz outra.
 */
function rotularBlocoU(): void {
  const bloco = el('campos-u').parentElement;
  const titulo = bloco?.querySelector('.bloco-titulo');
  if (titulo) {
    titulo.textContent = modo === 'holonomia' ? 'Laço (canto oposto)' : 'Segundo vetor u';
  }
}

function aplicarModo(): void {
  rotularBlocoU();
  document.body.classList.toggle('duas-formas', modo === 'duas');
  document.body.classList.toggle('derivada', modo === 'derivada');
  document.body.classList.toggle('colchete', modo === 'colchete');
  document.body.classList.toggle('holonomia', modo === 'holonomia');
  document.body.classList.toggle('geodesica', modo === 'geodesica');
  el<HTMLSelectElement>('modo').value = modo;
  el('numeral-label').textContent = ROTULO_NUMERAL[modo];
}

function bindModo(): void {
  el<HTMLSelectElement>('modo').addEventListener('change', (event) => {
    modo = (event.target as HTMLSelectElement).value as Modo;
    aplicarModo();
    update();
  });

  for (let i = 0; i < DIM; i++) {
    const input = el<HTMLInputElement>(`campo-omega-${i}`);
    input.addEventListener('input', () => {
      campoOmega[i] = input.value;
      update();
    });
  }

  const campoF = el<HTMLInputElement>('campo-f');
  campoF.addEventListener('input', () => {
    funcaoF = campoF.value;
    update();
  });

  const alternar = el<HTMLInputElement>('usar-df');
  alternar.addEventListener('change', () => {
    usarDf = alternar.checked;
    update();
  });

  for (const [prefixo, destino] of [
    ['campo-x', campoX],
    ['campo-y', campoY],
  ] as const) {
    for (let i = 0; i < DIM; i++) {
      const input = el<HTMLInputElement>(`${prefixo}-${i}`);
      input.addEventListener('input', () => {
        destino[i] = input.value;
        update();
      });
    }
  }

  const rangeAlcance = el<HTMLInputElement>('alcance');
  rangeAlcance.addEventListener('input', () => {
    alcance = Number(rangeAlcance.value);
    update();
  });

  const checkDesvio = el<HTMLInputElement>('ver-desvio');
  checkDesvio.addEventListener('change', () => {
    verDesvio = checkDesvio.checked;
    update();
  });

  const tempo = el<HTMLInputElement>('tempo-fluxo');
  tempo.addEventListener('input', () => {
    tempoFluxo = Number(tempo.value);
    update();
  });
}

/**
 * Repõe os padrões do campo para a carta atual e sincroniza os rótulos.
 *
 * Chamada a cada troca de superfície: uma expressão em x e y não sobrevive a uma
 * carta (θ, φ), e deixar o texto anterior só produziria um erro de parse que o
 * aluno não pediu.
 */
/**
 * Repõe os padrões da carta atual.
 *
 * Separado de `syncCampoLabels` de propósito: trocar de superfície *deve*
 * repor os padrões — uma expressão em x,y não sobrevive a uma carta (θ,φ) —, mas
 * abrir uma cena de um link **não** deve, senão o que o autor escreveu seria
 * apagado no caminho.
 */
function resetCampos(): void {
  const padroes = padroesDoCampo(scene.example.chart.names);
  campoOmega[0] = padroes.omega[0];
  campoOmega[1] = padroes.omega[1];
  funcaoF = padroes.f;
  usarDf = false;

  const campos = padroesDosCampos(scene.example.chart.names);
  campoX[0] = campos.x[0];
  campoX[1] = campos.x[1];
  campoY[0] = campos.y[0];
  campoY[1] = campos.y[1];
  tempoFluxo = passoPadrao(scene.example.bounds);
}

/** Aplica os campos que vieram de uma cena, quando ela os traz. */
function aplicarCampos(campos: NonNullable<SceneDoc['campos']>): void {
  campoOmega[0] = campos.omega[0]!;
  campoOmega[1] = campos.omega[1]!;
  funcaoF = campos.f;
  usarDf = campos.usarDf;
  campoX[0] = campos.x[0]!;
  campoX[1] = campos.x[1]!;
  campoY[0] = campos.y[0]!;
  campoY[1] = campos.y[1]!;
  tempoFluxo = campos.passo;
}

function syncCampoLabels(): void {
  el<HTMLInputElement>('tempo-fluxo').value = String(tempoFluxo);
  el<HTMLInputElement>('usar-df').checked = usarDf;

  for (let i = 0; i < DIM; i++) {
    el(`sub-campo-${i}`).textContent = scene.example.chart.symbols[i] ?? String(i);
    el<HTMLInputElement>(`campo-omega-${i}`).value = campoOmega[i]!;
    el<HTMLInputElement>(`campo-x-${i}`).value = campoX[i]!;
    el<HTMLInputElement>(`campo-y-${i}`).value = campoY[i]!;
  }
  el<HTMLInputElement>('campo-f').value = funcaoF;
}

function syncOmegaControls(): void {
  for (let i = 0; i < DIM; i++) {
    const input = el<HTMLInputElement>(`omega-${i}`);
    input.value = String(scene.omega.components[i]);
    el(`omega-${i}-out`).textContent = ptBR(scene.omega.components[i]!);
    const rotulo = el(`rotulo-omega-${i}`);
    const sub = document.createElement('sub');
    sub.textContent = scene.example.chart.symbols[i] ?? String(i);
    rotulo.replaceChildren('ω', sub);
  }
}

function bindOmega(): void {
  for (let i = 0; i < DIM; i++) {
    const input = el<HTMLInputElement>(`omega-${i}`);
    input.addEventListener('input', () => {
      const components = Array.from(scene.omega.components);
      components[i] = Number(input.value);
      scene.omega = form(DIM, 1, components);
      el(`omega-${i}-out`).textContent = ptBR(Number(input.value));
      update();
    });
  }
}

// ------------------------------------------------------- interação no 3D

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tangentPlane = new THREE.Plane();
const hit = new THREE.Vector3();
let drag: 'point' | 'vector' | 'vectorU' | null = null;

function setPointer(event: PointerEvent): void {
  const rect = stage.renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, stage.camera);
}

stage.renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!embeddingMatches()) return;
  setPointer(event);
  if (raycaster.intersectObject(tipHandle, false).length > 0) drag = 'vector';
  else if (uHandle.visible && raycaster.intersectObject(uHandle, false).length > 0) {
    drag = 'vectorU';
  } else if (raycaster.intersectObject(pointHandle, false).length > 0) drag = 'point';
  else return;

  stage.controls.enabled = false;
  tangentPlane.setFromNormalAndCoplanarPoint(frame.normal, frame.point);
  stage.renderer.domElement.setPointerCapture(event.pointerId);
});

stage.renderer.domElement.addEventListener('pointermove', (event) => {
  if (!drag) return;
  setPointer(event);

  if (drag === 'point') {
    const [intersection] = raycaster.intersectObject(stage.sphere, false);
    if (!intersection) return;
    const { x, y, z } = intersection.point;
    const candidate = new Float64Array(DIM);
    sphereChartOf([x, y, z], candidate);
    movePoint(candidate);
  } else {
    // O arraste é resolvido contra o plano tangente, então qualquer dos dois
    // vetores nasce dentro dele por construção — o recorte por |·|_g é o que
    // impede de sair da vizinhança desenhada.
    if (!raycaster.ray.intersectPlane(tangentPlane, hit)) return;
    fromWorld(frame, hit.sub(frame.point), drag === 'vectorU' ? alvoU() : scene.v);
    update();
  }
});

function endDrag(event: PointerEvent): void {
  if (!drag) return;
  drag = null;
  stage.controls.enabled = true;
  stage.renderer.domElement.releasePointerCapture(event.pointerId);
}
stage.renderer.domElement.addEventListener('pointerup', endDrag);
stage.renderer.domElement.addEventListener('pointercancel', endDrag);

// -------------------------------------------------------------------- boot

document.body.classList.toggle('limpo', MODO_LIMPO);
buildSelector();
bindCopiar();
el<HTMLSelectElement>('seletor').value = scene.example.id;
el<HTMLInputElement>('bemol').value = String(bemol);
buildMetricFields();
buildVectorFields();
buildUFields();
bindOmega();
bindEta();
bindModo();
// Cena do endereço manda; sem ela, os padrões da carta.
if (cenaInicial?.campos) aplicarCampos(cenaInicial.campos);
else resetCampos();
syncCampoLabels();
aplicarModo();
el<HTMLInputElement>('bemol').addEventListener('input', (event) => {
  bemol = Number((event.target as HTMLInputElement).value);
  update();
});
syncOmegaControls();
update();
new ResizeObserver(() => update()).observe(el('carta-corpo'));

stage.renderer.setAnimationLoop(() => {
  if (!painelAtivo) return;
  stage.controls.update();
  stage.renderer.render(stage.scene, stage.camera);
});
