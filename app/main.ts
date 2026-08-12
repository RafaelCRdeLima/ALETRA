import * as THREE from 'three';
import { christoffelFromMetric } from '../core/christoffel-fd';
import { degeneracyMask, probeMetric, type MetricProbe } from '../core/degenerate';
import { EXAMPLES, exampleById, type MetricExample } from '../core/examples';
import { evaluate, form, type Form } from '../core/forms';
import { flatForm } from '../core/musical';
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
  omega: Form;
  parseError: string | null;
  probe: MetricProbe | null;
}

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

let scene: Scene = buildScene(exampleById(params.get('exemplo') ?? ''));

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
    omega: form(DIM, 1, [...example.initialOmega]),
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
stage.scene.add(pointHandle, tipHandle);

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
  for (const object of [tangentGroup, stackGroup, vectorGroup, pointHandle, tipHandle]) {
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

  disposeChildren(bemolGroup);
  if (opa.bemol > 0.01) {
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
    }),
  );

  pointHandle.position.copy(frame.point);
  tipHandle.position.copy(frame.point).add(toWorld(frame, scene.v));
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
function clampVectorMetric(): void {
  scene.metric(scene.x, gScratch);
  const lengthSq = normSquared(gScratch, scene.v, DIM);
  if (!Number.isFinite(lengthSq) || lengthSq <= 0) return;

  const length = Math.sqrt(lengthSq);
  const max = scene.example.maxVector;
  if (length > max) {
    const factor = max / length;
    for (let i = 0; i < DIM; i++) scene.v[i] *= factor;
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

  const folhas = Math.abs(reading.whole);
  const resto = document.createElement('span');
  resto.className = 'frac';

  if (folhas === 0) {
    resto.textContent = ptBR(Math.abs(reading.fraction));
    el('numeral-gloss').replaceChildren(resto, ' de uma folha');
    return;
  }
  resto.textContent = `+ ${ptBR(Math.abs(reading.fraction))}`;
  el('numeral-gloss').replaceChildren(
    `${folhas} folha${folhas === 1 ? '' : 's'} `,
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
  clampVectorMetric();
  const comMergulho = embeddingMatches();
  if (comMergulho) frame = sphereFrame(R, scene.x);
  document.body.classList.toggle('sem-mergulho', !comMergulho);

  const value = evaluate(scene.omega, [scene.v]);
  const vBemol = flatForm(scene.metric, scene.x, scene.v, DIM);
  const opa = opacidades();

  // No modo limpo a carta só aparece quando não há mergulho. Desenhar num painel
  // escondido custaria uma reconstrução de SVG por arraste, à toa.
  if (!MODO_LIMPO || !comMergulho) {
    chartPanel.render({
      bounds: scene.example.bounds,
      names: scene.example.chart.symbols,
      stacks: [
        { components: scene.omega.components, classe: 'folha', opacidade: opa.omega },
        { components: finitos(vBemol.components), classe: 'folha-bemol', opacidade: opa.bemol },
      ],
      point: scene.x,
      vector: scene.v,
      mask: scene.mask,
      maskResolution: MASK_RESOLUTION,
      value,
      whole: read(value).whole,
    });
  }

  render3D(value, comMergulho, vBemol);
  paintNumeral(value);
  paintBemol(vBemol);
  syncVectorFields();

  const erro = el<HTMLParagraphElement>('erro-metrica');
  erro.hidden = scene.parseError === null;
  erro.textContent = scene.parseError ?? '';

  const aviso = el<HTMLParagraphElement>('aviso-singularidade');
  aviso.hidden = scene.probe === null;
  aviso.textContent = scene.probe?.message ?? '';

  el('nota-exemplo').textContent = scene.example.note;
}

// ---------------------------------------------------------------- controles

function buildSelector(): void {
  const select = el<HTMLSelectElement>('seletor');
  select.replaceChildren(
    ...EXAMPLES.map((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.label;
      return option;
    }),
  );
  select.addEventListener('change', () => {
    scene = buildScene(exampleById(select.value));
    buildMetricFields();
    buildVectorFields();
    syncOmegaControls();
    update();
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
let drag: 'point' | 'vector' | null = null;

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
  else if (raycaster.intersectObject(pointHandle, false).length > 0) drag = 'point';
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
    if (!raycaster.ray.intersectPlane(tangentPlane, hit)) return;
    fromWorld(frame, hit.sub(frame.point), scene.v);
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
el<HTMLSelectElement>('seletor').value = scene.example.id;
buildMetricFields();
buildVectorFields();
bindOmega();
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
