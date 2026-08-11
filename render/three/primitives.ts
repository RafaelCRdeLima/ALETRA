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
 * Libera geometrias **e materiais** de um grupo descartável — a cena é
 * reconstruída a cada arraste.
 *
 * Materiais importam mesmo quando o heap não cresce: os desta cena são todos
 * iguais, então compartilham um programa WebGL só e o coletor de lixo dá conta
 * do resto. O que quebra essa sorte é material variando por objeto — cores por
 * célula na Etapa 5, por exemplo —, e aí cada um vira um programa próprio que
 * nada libera. Descartar aqui custa três linhas e remove a armadilha antes dela
 * existir.
 */
export function disposeChildren(group: THREE.Object3D): void {
  for (const child of group.children) {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const material = (child as THREE.Mesh).material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
    disposeChildren(child);
  }
  group.clear();
}
