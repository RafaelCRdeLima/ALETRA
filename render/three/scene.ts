import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const PALETTE = {
  /** O laranja da marca. */
  brand: 0xe4380d,
  background: 0x14100f,
  surface: 0x2f2b29,
  tangent: 0x8fb8c8,
  /** η e o segundo vetor: azul, para o cruzamento com o laranja de ω ficar nítido. */
  eta: 0x6fb3c9,
  vector: 0xf4efe9,
  fraction: 0xffc24b,
  handle: 0xffffff,
} as const;

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  /** A superfície desenhada; a geometria é trocada quando o exemplo muda. */
  readonly surface: THREE.Mesh;
  /** As linhas de coordenada da carta sobre ela. */
  readonly grid: THREE.LineSegments;
}

export function createStage(container: HTMLElement, R: number): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  /*
   * O "para cima" do mundo é Z, e não o Y que o Three assume.
   *
   * Z é onde estão o polo da esfera, o eixo do cilindro, o eixo do cone e o eixo
   * do toro — as quatro cartas concordam nisso. Com o Y padrão, a câmera olhava
   * o cone quase pela boca, deitado sobre o próprio eixo, e a superfície mais
   * fácil de reconhecer do conjunto virava uma mancha. Uma linha aqui endireita
   * as quatro de uma vez, sem nenhuma orientação por superfície.
   */
  camera.up.set(0, 0, 1);
  camera.position.set(R * 2.6, R * 2.6, R * 1.9);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = R * 1.6;
  controls.maxDistance = R * 8;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9c8, 0.5);
  rim.position.set(-5, -2, -4);
  scene.add(rim);

  /*
   * A superfície nasce vazia e recebe geometria conforme o exemplo.
   *
   * Antes era um `SphereGeometry` fixo, com a malha de referência vinda de um
   * `WireframeGeometry` da própria primitiva — que precisou de uma rotação
   * corretiva porque o Three gera os polos em Y e a carta (θ,φ) põe θ=0 em Z.
   * Aquela grade *parecia* as linhas de coordenada e não era. Com a malha
   * amostrada da carta, as linhas são as de coordenada por construção, em
   * qualquer superfície, e a rotação corretiva deixou de existir.
   */
  const surface = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial({
      color: PALETTE.surface,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  scene.add(surface);

  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }),
  );
  scene.add(grid);

  const resize = (): void => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(container);

  return { scene, camera, renderer, controls, surface, grid };
}
