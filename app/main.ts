import * as THREE from 'three';
import { evaluate, form, type Form } from '../core/forms';
import { read } from '../core/reading';
import { sphereChartOf } from '../core/sphere';
import { fromWorld, sphereFrame, toWorld, type TangentFrame } from '../render/three/frame';
import { disposeChildren } from '../render/three/primitives';
import { createStage, PALETTE } from '../render/three/scene';
import { buildStack } from '../render/three/stack';
import { buildVector } from '../render/three/vector';
import { veilTexture } from '../render/three/veil';

const R = 1;
/** Raio do disco tangente, em unidades de mundo. A Etapa 1 é local por escopo. */
const DISC_RADIUS = 0.5;
const MAX_VECTOR = 0.42;
/** Afasta o arraste dos polos, onde (θ, φ) degenera. O tratamento de D7 é da Etapa 2. */
const THETA_EPS = 0.12;

interface State {
  readonly x: Float64Array;
  readonly v: Float64Array;
  omega: Form;
}

// ω precisa ser grande o bastante para caberem várias folhas no disco: a leitura
// da Etapa 1 é *contar*, e não há o que contar com meia folha na tela.
const state: State = {
  x: Float64Array.from([1.15, 0.55]),
  v: Float64Array.from([0.28, 0.5]),
  omega: form(2, 1, [6, 2.5]),
};

const container = document.getElementById('stage');
if (!container) throw new Error('#stage não encontrado');
const stage = createStage(container, R);
const veil = veilTexture();

const tangentGroup = new THREE.Group();
const stackGroup = new THREE.Group();
const vectorGroup = new THREE.Group();
stage.scene.add(tangentGroup, stackGroup, vectorGroup);

const pointHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 24, 16),
  new THREE.MeshStandardMaterial({ color: PALETTE.handle, roughness: 0.3 }),
);
// Deliberadamente neutro, e não amarelo: amarelo é a cor da fração (D11), e uma
// alça de arraste com a mesma cor faria o aluno ler a bolinha como parte da conta.
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

let frame: TangentFrame = sphereFrame(R, state.x);

function rebuild(): void {
  frame = sphereFrame(R, state.x);
  clampVector();

  const value = evaluate(state.omega, [state.v]);

  disposeChildren(tangentGroup);
  tangentGroup.add(tangentDisc(frame), ...basisArrows(frame));

  disposeChildren(stackGroup);
  stackGroup.add(
    buildStack(state.omega, frame, veil, {
      radius: DISC_RADIUS,
      maxSheets: 14,
      thickness: 0.13,
      color: PALETTE.brand,
      opacity: 0.92,
    }),
  );

  disposeChildren(vectorGroup);
  vectorGroup.add(
    buildVector(frame, state.v, value, {
      shaftRadius: 0.016,
      headLength: 0.08,
      headRadius: 0.04,
      colorWhole: PALETTE.vector,
      colorFraction: PALETTE.fraction,
    }),
  );

  pointHandle.position.copy(frame.point);
  tipHandle.position.copy(frame.point).add(toWorld(frame, state.v));

  paintNumeral(value);
}

/** Mantém a ponta da seta dentro do disco onde a pilha está desenhada. */
function clampVector(): void {
  const length = toWorld(frame, state.v).length();
  if (length > MAX_VECTOR) {
    const scale = MAX_VECTOR / length;
    for (let i = 0; i < state.v.length; i++) state.v[i] *= scale;
  }
}

function tangentDisc(f: TangentFrame): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(DISC_RADIUS, 64);
  const mesh = new THREE.Mesh(
    geometry,
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

/** e_θ e e_φ desenhados finos: a base local que o PLAN.md pede visível na Etapa 1. */
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

const numeralValue = document.getElementById('numeral-value');
const numeralGloss = document.getElementById('numeral-gloss');

const ptBR = (n: number): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function paintNumeral(value: number): void {
  const reading = read(value);
  if (numeralValue) numeralValue.textContent = Number.isFinite(value) ? ptBR(reading.value) : '—';
  if (!numeralGloss) return;

  const folhas = Math.abs(reading.whole);
  const resto = Math.abs(reading.fraction);
  if (folhas === 0) {
    numeralGloss.innerHTML = `<span class="frac">${ptBR(resto)}</span> de uma folha`;
    return;
  }
  numeralGloss.innerHTML =
    `<span class="whole">${folhas} folha${folhas === 1 ? '' : 's'}</span> ` +
    `<span class="frac">+ ${ptBR(resto)}</span>`;
}

// ---------------------------------------------------------------- interação

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tangentPlane = new THREE.Plane();
const hit = new THREE.Vector3();
type DragMode = 'point' | 'vector' | null;
let drag: DragMode = null;

function setPointer(event: PointerEvent): void {
  const rect = stage.renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, stage.camera);
}

stage.renderer.domElement.addEventListener('pointerdown', (event) => {
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
    sphereChartOf([x, y, z], state.x);
    state.x[0] = Math.min(Math.PI - THETA_EPS, Math.max(THETA_EPS, state.x[0]!));
  } else {
    if (!raycaster.ray.intersectPlane(tangentPlane, hit)) return;
    fromWorld(frame, hit.sub(frame.point), state.v);
  }
  rebuild();
});

function endDrag(event: PointerEvent): void {
  if (!drag) return;
  drag = null;
  stage.controls.enabled = true;
  stage.renderer.domElement.releasePointerCapture(event.pointerId);
}
stage.renderer.domElement.addEventListener('pointerup', endDrag);
stage.renderer.domElement.addEventListener('pointercancel', endDrag);

function bindSlider(id: string, outId: string, index: number): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const output = document.getElementById(outId);
  if (!input) return;
  const apply = (): void => {
    const components = Array.from(state.omega.components);
    components[index] = Number(input.value);
    state.omega = form(state.omega.dim, state.omega.degree, components);
    if (output) output.textContent = ptBR(Number(input.value));
    rebuild();
  };
  input.addEventListener('input', apply);
  apply();
}
bindSlider('omega-theta', 'omega-theta-out', 0);
bindSlider('omega-phi', 'omega-phi-out', 1);

rebuild();

stage.renderer.setAnimationLoop(() => {
  stage.controls.update();
  stage.renderer.render(stage.scene, stage.camera);
});
