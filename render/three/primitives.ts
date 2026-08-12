import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Um cilindro do ponto `a` ao ponto `b`. */
export function segment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh | null {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  if (length < 1e-9) return null;

  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12, 1), material);
  mesh.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
  mesh.position.copy(a).addScaledVector(direction, 0.5);
  return mesh;
}

/** Um cone com a ponta em `tip`, apontando para `direction` (unitário). */
export function cone(
  tip: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 16), material);
  mesh.quaternion.setFromUnitVectors(UP, direction);
  mesh.position.copy(tip).addScaledVector(direction, -length / 2);
  return mesh;
}

/**
 * Uma seta sólida criada uma vez e reapontada a cada quadro.
 *
 * `ArrowHelper` desenha a haste como `Line`, e `linewidth` é ignorado na maioria
 * das plataformas — a seta sai com um fio de um pixel, invisível ao lado das
 * setas de cilindro do resto da cena. Aqui a haste é um cilindro de verdade.
 *
 * Criar e descartar geometria sessenta vezes por segundo é o erro que a auditoria
 * já pegou uma vez; por isso `apontar` só mexe em transformações — posição,
 * rotação e escala —, nunca em geometria ou material.
 */
export interface SetaMovel {
  readonly objeto: THREE.Object3D;
  apontar(origem: THREE.Vector3, direcao: THREE.Vector3, comprimento: number): void;
}

export function criarSetaMovel(
  material: THREE.Material,
  raioDaHaste: number,
  comprimentoDaCabeca: number,
  raioDaCabeca: number,
): SetaMovel {
  const grupo = new THREE.Group();

  // Geometrias de comprimento 1 ao longo de +Y, com a base na origem: assim
  // escalar em Y estica só o comprimento, sem deformar a espessura.
  const haste = new THREE.Mesh(
    new THREE.CylinderGeometry(raioDaHaste, raioDaHaste, 1, 12, 1).translate(0, 0.5, 0),
    material,
  );
  const cabeca = new THREE.Mesh(
    new THREE.ConeGeometry(raioDaCabeca, comprimentoDaCabeca, 16).translate(
      0,
      comprimentoDaCabeca / 2,
      0,
    ),
    material,
  );
  grupo.add(haste, cabeca);

  return {
    objeto: grupo,
    apontar(origem, direcao, comprimento) {
      if (comprimento < 1e-6) {
        grupo.visible = false;
        return;
      }
      const corpo = Math.max(1e-4, comprimento - comprimentoDaCabeca);
      grupo.position.copy(origem);
      grupo.quaternion.setFromUnitVectors(UP, direcao);
      haste.scale.set(1, corpo, 1);
      cabeca.position.set(0, corpo, 0);
    },
  };
}

/**
 * Libera as geometrias de um grupo descartável — a cena é reconstruída a cada
 * arraste, e geometria é o que de fato nasce e morre junto com ela.
 *
 * **Materiais não são descartados aqui, e isso é decisão medida.** A auditoria
 * anterior mandou descartá-los "por higiene"; a auditoria seguinte mediu o preço:
 * 264 ms por evento de arraste contra 96 ms sem. `dispose()` devolve o programa
 * WebGL ao cache, e recriar um material equivalente no quadro seguinte recompila
 * o shader.
 *
 * A saída foi parar de criar: `materials.ts` guarda um material por aparência,
 * vivo pelo resto da sessão. Não há o que descartar, então não há nem vazamento
 * nem recompilação. Ver o comentário lá para o raciocínio inteiro.
 */
export function disposeChildren(group: THREE.Object3D): void {
  for (const child of group.children) {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
    disposeChildren(child);
  }
  group.clear();
}
