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
import { cellEdges, wedge } from '../core/wedge';
import { ParseError } from '../core/expr';
import { normSquared, type ChristoffelFn, type MetricFn } from '../core/metric';
import { compileMetric, componentIndices } from '../core/metric-expr';
import { read } from '../core/reading';
import { sphereChartOf } from '../core/sphere';
import { createChartPanel } from '../render/svg/chart-panel';
import { fromWorld, sphereFrame, toWorld, type TangentFrame } from '../render/three/frame';
import { disposeChildren } from '../render/three/primitives';
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
let modo: 'uma' | 'duas' = params.get('modo') === '2' ? 'duas' : 'uma';

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

function render3D(value: number, active: boolean, vBemol: Form): void {
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
      scene.example.embedding === 'sphere'
        ? 'A métrica foi editada: o mergulho desenhado aqui é o da esfera original e já não ' +
          'corresponde ao que está escrito. O painel de carta continua correto.'
        : `Esta métrica não tem um mergulho em ℝ³ definido neste estágio — ${scene.example.label} ` +
          'vive só na carta. O painel ao lado continua sendo a geometria inteira.';
    return;
  }

  disposeChildren(tangentGroup);
  tangentGroup.add(tangentDisc(frame), ...basisArrows(frame));

  const opa = opacidades();

  disposeChildren(stackGroup);
  stackGroup.add(
    buildStack(scene.omega, frame, veil, {
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
  const duasFormas = modo === 'duas';
  disposeChildren(bemolGroup);
  if (duasFormas) {
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
      showFraction: !duasFormas,
    }),
  );
  if (duasFormas) {
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
  uHandle.visible = duasFormas;
  if (duasFormas) uHandle.position.copy(frame.point).add(toWorld(frame, scene.u));
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

function tangentDisc(f: TangentFrame): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(DISC_RADIUS, 64),
    new THREE.MeshBasicMaterial({
      color: PALETTE.tangent,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.normal);
  mesh.position.copy(f.point);
  mesh.renderOrder = 1;
  return mesh;
}

function basisArrows(f: TangentFrame): THREE.Object3D[] {
  return f.basis.map((e) => {
    const helper = new THREE.ArrowHelper(
      e.clone().normalize(),
      f.point,
      Math.min(e.length(), DISC_RADIUS * 0.8),
      PALETTE.tangent,
      0.06,
      0.03,
    );
    helper.renderOrder = 2;
    return helper;
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
    scene.u.set([a, b]);
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
function paintNumeral(value: number): void {
  const reading = read(value);
  el('numeral-value').textContent = Number.isFinite(value) ? ptBR(reading.value) : '—';

  // A unidade muda com o modo, mas a disciplina de D11 não: o inteiro é o que
  // foi atravessado ou cercado por completo, e a fração nunca some.
  const [singular, plural] = modo === 'duas' ? ['célula', 'células'] : ['folha', 'folhas'];
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
  const sigma = wedge(scene.omega, scene.eta);
  const value = duasFormas
    ? evaluate(sigma, [scene.u, scene.v])
    : evaluate(scene.omega, [scene.v]);
  const vBemol = flatForm(scene.metric, scene.x, scene.v, DIM);
  const opa = opacidades();

  // No modo 2-form a segunda camada é η, e o cruzamento das duas pilhas é o
  // ladrilho. No modo 1-form ela é v♭, que é a leitura da Etapa 3.
  const camadas = [
    { components: scene.omega.components, classe: 'folha', opacidade: opa.omega },
    duasFormas
      ? { components: scene.eta.components, classe: 'folha-eta', opacidade: 0.92 }
      : { components: finitos(vBemol.components), classe: 'folha-bemol', opacidade: opa.bemol },
  ];

  // No modo limpo a carta só aparece quando não há mergulho. Desenhar num painel
  // escondido custaria uma reconstrução de SVG por arraste, à toa.
  if (!MODO_LIMPO || !comMergulho) {
    chartPanel.render({
      bounds: scene.example.bounds,
      names: scene.example.chart.symbols,
      stacks: camadas,
      cell: duasFormas
        ? { u: scene.u, v: scene.v, lattice: cellEdges(scene.omega, scene.eta) }
        : null,
      vectorU: duasFormas ? scene.u : null,
      point: scene.x,
      vector: scene.v,
      mask: scene.mask,
      maskResolution: MASK_RESOLUTION,
      cut: duasFormas ? null : { value, whole: read(value).whole },
    });
  }

  render3D(value, comMergulho, vBemol);
  paintNumeral(value);
  paintBemol(vBemol);
  syncVectorFields();
  syncUFields();

  const erro = el<HTMLParagraphElement>('erro-metrica');
  erro.hidden = scene.parseError === null;
  erro.textContent = scene.parseError ?? '';

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
    modo,
    bemol,
    metrica: scene.components,
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
        scene.u[index] = valor;
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
    input.value = ptBR(scene.u[Number(input.dataset['componente'])] ?? 0);
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

function aplicarModo(): void {
  document.body.classList.toggle('duas-formas', modo === 'duas');
  const botao = el<HTMLButtonElement>('modo');
  botao.textContent = modo === 'duas' ? '⟨ ver 1-form' : '∧ ver 2-form';
  botao.setAttribute('aria-pressed', String(modo === 'duas'));
  el('numeral-label').textContent = modo === 'duas' ? '(ω∧η)(u, v)' : '⟨ω, v⟩';
}

function bindModo(): void {
  el<HTMLButtonElement>('modo').addEventListener('click', () => {
    modo = modo === 'duas' ? 'uma' : 'duas';
    aplicarModo();
    update();
  });
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
    fromWorld(frame, hit.sub(frame.point), drag === 'vectorU' ? scene.u : scene.v);
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
