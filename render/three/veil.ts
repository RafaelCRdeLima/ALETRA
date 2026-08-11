import * as THREE from 'three';

/**
 * O véu: gradiente radial opaco no centro, transparente na borda.
 *
 * É a generalização em 3D do que a marca faz em 2D — no `aletra-alfa-marca.svg`
 * as folhas da pilha afinam e o traço central engrossa, concentrando a leitura
 * onde a contração acontece. Aqui a mesma ideia vira um alphaMap centrado no
 * ponto base: a folha aparece perto de p e some longe dele, em vez de virar um
 * plano infinito que oclui a superfície (D10).
 */
export function veilTexture(size = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível para gerar o véu');

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0.0, '#ffffff');
  gradient.addColorStop(0.45, '#dddddd');
  gradient.addColorStop(0.75, '#4a4a4a');
  gradient.addColorStop(1.0, '#000000');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
