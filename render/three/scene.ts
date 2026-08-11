import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const PALETTE = {
  /** O laranja da marca. */
  brand: 0xe4380d,
  background: 0x14100f,
  surface: 0x2f2b29,
  tangent: 0x8fb8c8,
  vector: 0xf4efe9,
  fraction: 0xffc24b,
  handle: 0xffffff,
} as const;

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly sphere: THREE.Mesh;
}

export function createStage(container: HTMLElement, R: number): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(R * 2.6, R * 1.9, R * 2.6);

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

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 64),
    new THREE.MeshStandardMaterial({
      color: PALETTE.surface,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
    }),
  );
  scene.add(sphere);

  // Malha de paralelos/meridianos: dá referência de superfície sem competir com
  // a pilha, que é a protagonista da cena.
  //
  // A rotação não é cosmética. SphereGeometry gera os polos no eixo Y; a carta
  // (θ, φ) de core/sphere.ts põe θ=0 no eixo Z. Sem girar, a malha desenharia
  // linhas que *parecem* as linhas de coordenada e não são — e o aluno leria a
  // grade errada. Girar π/2 em X leva +Y para +Z e alinha as duas convenções.
  const grid = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 1.001, 24, 16)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09 }),
  );
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const resize = (): void => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(container);

  return { scene, camera, renderer, controls, sphere };
}
