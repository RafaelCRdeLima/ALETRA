import * as THREE from 'three';
import { embeddingNormal, type Embedding } from '../../core/embedding';
import type { ChartBounds } from '../../core/degenerate';

/**
 * A malha de uma superfície, amostrada da própria carta.
 *
 * Antes havia um `SphereGeometry` fixo na cena. Com cilindro, cone e toro, o
 * caminho barato seria empilhar um `if` por superfície e a geometria pronta
 * correspondente — e aí o desenho passaria a depender de o Three ter a primitiva
 * certa, o que já falha no cone truncado e falharia em qualquer superfície que o
 * aluno digitasse depois.
 *
 * Amostrar o mergulho resolve os três de uma vez e não pede nada de novo para o
 * quarto: se `point(u,v)` existe, a malha existe. As normais vêm do mesmo lugar
 * que o resto do desenho, então a iluminação concorda com o plano tangente.
 */
export function buildSurface(
  embedding: Embedding,
  bounds: ChartBounds,
  divisoes = 96,
): THREE.BufferGeometry {
  const nu = divisoes;
  const nv = Math.max(16, Math.round(divisoes / 2));

  const posicoes = new Float32Array((nu + 1) * (nv + 1) * 3);
  const normais = new Float32Array((nu + 1) * (nv + 1) * 3);
  const indices: number[] = [];

  const x = new Float64Array(2);
  const p = new Float64Array(3);
  const n = new Float64Array(3);

  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      x[0] = bounds.min[0]! + ((bounds.max[0]! - bounds.min[0]!) * i) / nu;
      x[1] = bounds.min[1]! + ((bounds.max[1]! - bounds.min[1]!) * j) / nv;
      embedding.point(x, p);
      embeddingNormal(embedding, x, n);

      const base = (i * (nv + 1) + j) * 3;
      for (let k = 0; k < 3; k++) {
        posicoes[base + k] = Number.isFinite(p[k]!) ? p[k]! : 0;
        normais[base + k] = Number.isFinite(n[k]!) ? n[k]! : 0;
      }
    }
  }

  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometria.setAttribute('normal', new THREE.BufferAttribute(normais, 3));
  geometria.setIndex(indices);
  return geometria;
}

/**
 * As linhas de coordenada da carta, desenhadas sobre a superfície.
 *
 * Substituem o `WireframeGeometry` da esfera, que era uma grade da *primitiva* e
 * não da carta — e por isso precisou de uma rotação corretiva para não mentir
 * sobre onde ficavam θ e φ. Amostrando a carta, as linhas são as linhas de
 * coordenada por construção, em qualquer superfície.
 */
export function buildChartGrid(
  embedding: Embedding,
  bounds: ChartBounds,
  linhas = 12,
  amostras = 64,
): THREE.BufferGeometry {
  const pontos: number[] = [];
  const x = new Float64Array(2);
  const p = new Float64Array(3);

  const traco = (fixo: 0 | 1, valor: number): void => {
    let anterior: [number, number, number] | null = null;
    for (let k = 0; k <= amostras; k++) {
      const t = k / amostras;
      const outro = fixo === 0 ? 1 : 0;
      x[fixo] = valor;
      x[outro] = bounds.min[outro]! + (bounds.max[outro]! - bounds.min[outro]!) * t;
      embedding.point(x, p);
      const atual: [number, number, number] = [p[0]!, p[1]!, p[2]!];
      if (anterior && atual.every(Number.isFinite)) pontos.push(...anterior, ...atual);
      anterior = atual;
    }
  };

  for (let i = 0; i <= linhas; i++) {
    const t = i / linhas;
    traco(0, bounds.min[0]! + (bounds.max[0]! - bounds.min[0]!) * t);
    traco(1, bounds.min[1]! + (bounds.max[1]! - bounds.min[1]!) * t);
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(pontos, 3));
  return geometria;
}
