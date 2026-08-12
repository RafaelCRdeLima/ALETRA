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
