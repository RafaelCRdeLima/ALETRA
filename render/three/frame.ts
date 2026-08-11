import * as THREE from 'three';
import { sphereBasis, sphereEmbed, sphereNormal } from '../../core/sphere';

/**
 * O plano tangente num ponto, já empurrado para ℝ³.
 *
 * `basis` é a base *coordenada* (e_θ, e_φ) — não ortonormal, e é justamente por
 * isso que ela carrega a métrica: |e_φ| encolhe perto dos polos, então um mesmo
 * v^φ desenha uma seta mais curta lá. `u`/`w` são uma base ortonormal auxiliar,
 * usada só para coisas de tela (UV do véu, disco tangente), nunca para geometria.
 */
export interface TangentFrame {
  readonly point: THREE.Vector3;
  readonly basis: readonly THREE.Vector3[];
  readonly normal: THREE.Vector3;
  readonly u: THREE.Vector3;
  readonly w: THREE.Vector3;
}

export function sphereFrame(R: number, x: Float64Array): TangentFrame {
  const p = new Float64Array(3);
  const e = new Float64Array(6);
  const n = new Float64Array(3);
  sphereEmbed(R, x, p);
  sphereBasis(R, x, e);
  sphereNormal(x, n);

  const point = new THREE.Vector3(p[0]!, p[1]!, p[2]!);
  const e0 = new THREE.Vector3(e[0]!, e[1]!, e[2]!);
  const e1 = new THREE.Vector3(e[3]!, e[4]!, e[5]!);
  const normal = new THREE.Vector3(n[0]!, n[1]!, n[2]!).normalize();

  const u = e0.clone().normalize();
  const w = new THREE.Vector3().crossVectors(normal, u).normalize();

  return { point, basis: [e0, e1], normal, u, w };
}

/** Componentes na base coordenada → deslocamento em ℝ³. Laço sobre índices (D12). */
export function toWorld(
  frame: TangentFrame,
  components: Float64Array,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  out.set(0, 0, 0);
  for (let i = 0; i < frame.basis.length; i++) {
    out.addScaledVector(frame.basis[i]!, components[i]!);
  }
  return out;
}

/**
 * Deslocamento em ℝ³ → componentes na base coordenada.
 *
 * Resolve o sistema de Gram G c = b, com G_ij = e_i·e_j. Na esfera G é diagonal
 * e isto seria uma divisão; o sistema geral está aqui porque a Etapa 2 traz
 * cartas em que a base coordenada não é ortogonal, e aí a divisão mentiria.
 */
export function fromWorld(
  frame: TangentFrame,
  world: THREE.Vector3,
  out: Float64Array,
): Float64Array {
  const dim = frame.basis.length;
  const m = new Float64Array(dim * (dim + 1)); // [G | b], row-major

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      m[i * (dim + 1) + j] = frame.basis[i]!.dot(frame.basis[j]!);
    }
    m[i * (dim + 1) + dim] = world.dot(frame.basis[i]!);
  }
  solveInPlace(m, dim, out);
  return out;
}

/** Eliminação de Gauss com pivotamento parcial sobre a matriz aumentada [A | b]. */
function solveInPlace(m: Float64Array, dim: number, out: Float64Array): void {
  const stride = dim + 1;
  for (let col = 0; col < dim; col++) {
    let pivot = col;
    for (let row = col + 1; row < dim; row++) {
      if (Math.abs(m[row * stride + col]!) > Math.abs(m[pivot * stride + col]!)) pivot = row;
    }
    if (Math.abs(m[pivot * stride + col]!) < 1e-12) {
      out.fill(0);
      return; // base degenerada — o chamador já trata isso como "não arraste aqui"
    }
    if (pivot !== col) {
      for (let k = col; k < stride; k++) {
        const tmp = m[col * stride + k]!;
        m[col * stride + k] = m[pivot * stride + k]!;
        m[pivot * stride + k] = tmp;
      }
    }
    const diag = m[col * stride + col]!;
    for (let row = col + 1; row < dim; row++) {
      const factor = m[row * stride + col]! / diag;
      if (factor === 0) continue;
      for (let k = col; k < stride; k++) m[row * stride + k] -= factor * m[col * stride + k]!;
    }
  }
  for (let row = dim - 1; row >= 0; row--) {
    let sum = m[row * stride + dim]!;
    for (let k = row + 1; k < dim; k++) sum -= m[row * stride + k]! * out[k]!;
    out[row] = sum / m[row * stride + row]!;
  }
}
