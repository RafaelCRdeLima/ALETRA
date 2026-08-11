import * as THREE from 'three';
import { evaluate, type Form } from '../../core/forms';
import { fromWorld, toWorld, type TangentFrame } from './frame';

/**
 * A pilha de uma 1-form desenhada no plano tangente.
 *
 * Cada folha é o conjunto de nível ⟨ω, ·⟩ = k para k inteiro, recortado no disco
 * de raio `radius` em torno de p e levantado um pouco ao longo da normal da
 * superfície, para que a seta *atravesse* folhas em vez de rasar por elas. O
 * desvanecimento vem do véu (D10), não de plano infinito.
 *
 * Isto é o desenho do grau 1 **numa superfície**. Duas restrições, ambas
 * verificadas na entrada em vez de assumidas:
 *
 * - grau 1: o ladrilho de células da 2-form (Etapa 5) é outra geometria, e ganha
 *   o seu próprio construtor quando chegar a hora;
 * - dimensão 2: numa carta 2D os níveis de ω são retas, e o núcleo de ω é uma
 *   direção só. Em dimensão 3 eles viram planos e o núcleo é bidimensional — o
 *   desenho é outro, não uma generalização deste.
 *
 * Ver D12 para os dois pontos.
 */
export interface StackOptions {
  readonly radius: number;
  readonly maxSheets: number;
  readonly thickness: number;
  readonly color: THREE.ColorRepresentation;
  readonly opacity: number;
}

export function buildStack(
  omega: Form,
  frame: TangentFrame,
  veil: THREE.Texture,
  opts: StackOptions,
): THREE.Group {
  const group = new THREE.Group();
  if (omega.degree !== 1) {
    throw new Error(
      `buildStack desenha a pilha de uma 1-form; grau ${omega.degree} tem outro ` +
        `desenho (a 2-form vira ladrilho de células — Etapa 5, ver D12)`,
    );
  }

  const dim = frame.basis.length;
  if (dim !== 2) {
    throw new Error(
      `buildStack desenha níveis de 1-form numa superfície (dim 2), onde eles são ` +
        `retas. Em dimensão ${dim} os níveis são hiperplanos e o núcleo de ω não é ` +
        `uma direção só — é outro desenho, não este generalizado (D12).`,
    );
  }

  const c = omega.components;
  const normSq = c.reduce((acc, value) => acc + value * value, 0);
  if (normSq < 1e-12) return group; // ω = 0: nenhuma folha, e o número é 0

  // Solução particular do nível k, e a direção do núcleo de ω (onde ω não varia).
  const level = new Float64Array(dim);
  const kernel = Float64Array.from([-c[1]!, c[0]!]);

  const kMax = sheetRange(omega, frame, opts.radius, opts.maxSheets);
  const kernelWorld = toWorld(frame, kernel);
  const half = new THREE.Vector3();

  const sheets: Array<{ k: number; mesh: THREE.Mesh }> = [];
  for (let k = -kMax; k <= kMax; k++) {
    for (let i = 0; i < dim; i++) level[i] = (k * c[i]!) / normSq;
    const anchor = toWorld(frame, level);

    // Interseção da reta anchor + t·kernelWorld com o disco de raio `radius`.
    const a = kernelWorld.dot(kernelWorld);
    const b = 2 * anchor.dot(kernelWorld);
    const cc = anchor.dot(anchor) - opts.radius * opts.radius;
    const disc = b * b - 4 * a * cc;
    if (a < 1e-12 || disc <= 0) continue; // esta folha não cruza o disco

    const root = Math.sqrt(disc);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);

    const p1 = anchor.clone().addScaledVector(kernelWorld, t1).add(frame.point);
    const p2 = anchor.clone().addScaledVector(kernelWorld, t2).add(frame.point);

    // Folhas perto de p um pouco mais altas — o mesmo afunilamento da marca.
    const taper = 1 - 0.35 * (Math.abs(k) / (kMax + 1));
    half.copy(frame.normal).multiplyScalar((opts.thickness * taper) / 2);

    const material = new THREE.MeshBasicMaterial({
      color: opts.color,
      transparent: true,
      opacity: opts.opacity,
      alphaMap: veil,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    sheets.push({ k, mesh: new THREE.Mesh(ribbon(p1, p2, half, frame, opts.radius), material) });
  }

  // D10: ordenar por distância ao longo da normal comum das folhas. Desenhar as
  // de fora primeiro deixa a folha k=0 — a que passa por p — legível por cima.
  sheets.sort((x, y) => Math.abs(y.k) - Math.abs(x.k));
  sheets.forEach(({ mesh }, i) => {
    mesh.renderOrder = 10 + i;
    group.add(mesh);
  });
  return group;
}

/** Quantos níveis inteiros cabem no disco, medindo ω na borda dele. */
function sheetRange(omega: Form, frame: TangentFrame, radius: number, cap: number): number {
  const probe = new Float64Array(frame.basis.length);
  const edge = new THREE.Vector3();
  let peak = 0;
  const SAMPLES = 64;
  for (let i = 0; i < SAMPLES; i++) {
    const angle = (i / SAMPLES) * Math.PI * 2;
    edge
      .copy(frame.u)
      .multiplyScalar(Math.cos(angle) * radius)
      .addScaledVector(frame.w, Math.sin(angle) * radius);
    fromWorld(frame, edge, probe);
    peak = Math.max(peak, Math.abs(evaluate(omega, [probe])));
  }
  return Math.max(0, Math.min(cap, Math.ceil(peak)));
}

/** Uma fita de p1 a p2, com altura 2·|half| ao longo da normal, e UV para o véu. */
function ribbon(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  half: THREE.Vector3,
  frame: TangentFrame,
  radius: number,
): THREE.BufferGeometry {
  const corners = [
    p1.clone().add(half),
    p1.clone().sub(half),
    p2.clone().add(half),
    p2.clone().sub(half),
  ];

  const positions = new Float32Array(12);
  const uvs = new Float32Array(8);
  const local = new THREE.Vector3();
  corners.forEach((corner, i) => {
    positions[i * 3 + 0] = corner.x;
    positions[i * 3 + 1] = corner.y;
    positions[i * 3 + 2] = corner.z;
    local.subVectors(corner, frame.point);
    uvs[i * 2 + 0] = 0.5 + (0.5 * local.dot(frame.u)) / radius;
    uvs[i * 2 + 1] = 0.5 + (0.5 * local.dot(frame.w)) / radius;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}
