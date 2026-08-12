import * as THREE from 'three';

/**
 * Materiais compartilhados e de vida longa.
 *
 * ## Por que existe
 *
 * A cena 3D é reconstruída a cada movimento do mouse, e por sete etapas os
 * construtores criavam materiais novos junto com a geometria. Isso não custava
 * nada visível enquanto os materiais eram só coletados pelo lixo — até a
 * auditoria mandar descartá-los explicitamente, "por higiene".
 *
 * Aí custou caro. `material.dispose()` devolve o programa WebGL ao cache do
 * Three, que o libera quando ninguém mais o referencia; criar um material
 * equivalente no quadro seguinte **recompila o shader**. Medido: 264 ms por
 * evento de arraste com dispose, contra 96 ms sem. Uma correção de higiene
 * comprou um problema de desempenho três vezes maior que o problema que
 * resolvia.
 *
 * A saída não é escolher entre vazar e recompilar: é parar de criar. Um material
 * por aparência, criado uma vez e reaproveitado para sempre. Não há o que
 * descartar, então não há vazamento nem recompilação — e `disposeChildren` volta
 * a cuidar só de geometria, que é o que de fato nasce e morre a cada quadro.
 *
 * A opacidade é mutada à vontade: ela é uniforme de shader e não entra na chave
 * de cache de programa do Three, então mexer nela não recompila nada. A cor
 * entra na chave só quando muda a *estrutura* do material, o que não é o caso
 * aqui — mesmo assim o cache é por cor, que é o eixo em que as aparências deste
 * produto de fato variam.
 */

type Chave = string;

const basicos = new Map<Chave, THREE.MeshBasicMaterial>();
const padroes = new Map<Chave, THREE.MeshStandardMaterial>();

/** Material sem iluminação — pilhas, disco tangente: coisas que são leitura, não objeto. */
export function basico(
  color: THREE.ColorRepresentation,
  opacity: number,
  extras: { readonly alphaMap?: THREE.Texture; readonly depthWrite?: boolean } = {},
): THREE.MeshBasicMaterial {
  const chave = `${String(color)}|${extras.alphaMap ? 'veu' : 'liso'}|${extras.depthWrite ?? true}`;
  let material = basicos.get(chave);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: extras.depthWrite ?? true,
      ...(extras.alphaMap ? { alphaMap: extras.alphaMap } : {}),
    });
    basicos.set(chave, material);
  }
  material.opacity = opacity;
  return material;
}

/** Material iluminado — setas e alças, que são objetos na cena. */
export function iluminado(
  color: THREE.ColorRepresentation,
  opacity: number,
  emissiveScale = 0,
): THREE.MeshStandardMaterial {
  const chave = `${String(color)}|${emissiveScale}`;
  let material = padroes.get(chave);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.33,
      metalness: 0,
      transparent: true,
      emissive: new THREE.Color(color).multiplyScalar(emissiveScale),
    });
    padroes.set(chave, material);
  }
  material.opacity = opacity;
  return material;
}
