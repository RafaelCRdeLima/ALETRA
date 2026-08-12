import * as THREE from 'three';
import { iluminado } from './materials';

/**
 * Curvas da carta desenhadas sobre a superfície em ℝ³.
 *
 * É a peça que faltava para as leituras das Etapas 7, 8 e 9 existirem no painel
 * de mergulho: o quadrilátero de fluxos, o laço da holonomia e a geodésica são
 * todos poligonais em coordenadas, e todos viram a mesma coisa aqui — uma
 * sequência de pontos empurrada pelo mergulho.
 *
 * ## Por que levantar da superfície
 *
 * Uma curva desenhada exatamente sobre a esfera briga com ela no z-buffer e
 * aparece costurada, sumindo e voltando conforme o ângulo. `levantar` a afasta
 * alguns milésimos do raio: longe o bastante para o teste de profundidade
 * decidir, perto o bastante para continuar lendo como "em cima da superfície".
 *
 * ## Por que subdividir na carta
 *
 * O tubo interpola em ℝ³. Entre dois pontos de controle distantes, a corda passa
 * por *dentro* da superfície — um laço com quatro cantos aparecia como quatro
 * lascas soltas, porque o resto estava enterrado na esfera. Subdividir antes de
 * mergulhar resolve na origem: os pontos intermediários são calculados na carta,
 * onde as arestas do laço são retas de verdade, e cada um vai parar na superfície.
 * Adensar o tubo depois não adiantaria: a spline já estaria cortando por dentro.
 *
 * ## Por que tubo e não linha
 *
 * `LineBasicMaterial` ignora `linewidth` na maioria das plataformas — a curva
 * sairia com um pixel de espessura, invisível ao lado da pilha e das setas. Um
 * tubo de poucos segmentos radiais custa pouco e é grosso de verdade.
 */
export interface CurvaOpcoes {
  readonly raioDoTubo: number;
  readonly color: THREE.ColorRepresentation;
  readonly opacity?: number;
  /** Fração do raio a somar, para a curva não brigar com a superfície. */
  readonly levantar?: number;
  readonly emissiveScale?: number;
  /**
   * Pontos intermediários inseridos entre cada par consecutivo, na carta.
   * Caminhos já densos (uma geodésica integrada) não precisam; poligonais de
   * poucos vértices (um laço retangular) precisam muito.
   */
  readonly subdividir?: number;
}

/** Mapeia um ponto da carta para ℝ³. */
export type Mergulho = (x: Float64Array, out: Float64Array) => void;

export function buildCurve(
  pontos: readonly Float64Array[],
  mergulho: Mergulho,
  opts: CurvaOpcoes,
): THREE.Object3D | null {
  if (pontos.length < 2) return null;

  const levantar = 1 + (opts.levantar ?? 0.004);
  const bruto = new Float64Array(3);
  const emR3: THREE.Vector3[] = [];

  const densos = adensar(pontos, opts.subdividir ?? 0);
  for (const p of densos) {
    mergulho(p, bruto);
    if (!Number.isFinite(bruto[0]!) || !Number.isFinite(bruto[1]!) || !Number.isFinite(bruto[2]!)) {
      continue;
    }
    const v = new THREE.Vector3(bruto[0]!, bruto[1]!, bruto[2]!).multiplyScalar(levantar);
    // Pontos repetidos quebram a CatmullRom (tangente indefinida); num laço
    // fechado ou numa geodésica parada eles aparecem com facilidade.
    if (emR3.length === 0 || v.distanceToSquared(emR3[emR3.length - 1]!) > 1e-12) {
      emR3.push(v);
    }
  }
  if (emR3.length < 2) return null;

  const curva = new THREE.CatmullRomCurve3(emR3, false, 'catmullrom', 0.05);
  const segmentos = Math.min(400, Math.max(16, emR3.length * 2));
  const geometria = new THREE.TubeGeometry(curva, segmentos, opts.raioDoTubo, 6, false);

  return new THREE.Mesh(
    geometria,
    iluminado(opts.color, opts.opacity ?? 1, opts.emissiveScale ?? 0.2),
  );
}

/** Insere `quantos` pontos entre cada par consecutivo, interpolando na carta. */
function adensar(pontos: readonly Float64Array[], quantos: number): Float64Array[] {
  if (quantos <= 0) return [...pontos];
  const saida: Float64Array[] = [];
  for (let i = 0; i + 1 < pontos.length; i++) {
    const a = pontos[i]!;
    const b = pontos[i + 1]!;
    for (let k = 0; k <= quantos; k++) {
      const t = k / (quantos + 1);
      const meio = new Float64Array(a.length);
      for (let d = 0; d < a.length; d++) meio[d] = a[d]! + t * (b[d]! - a[d]!);
      saida.push(meio);
    }
  }
  saida.push(pontos[pontos.length - 1]!);
  return saida;
}

/** Um segmento reto em ℝ³ entre dois pontos da carta — o vão do colchete. */
export function buildChartSegment(
  de: Float64Array,
  para: Float64Array,
  mergulho: Mergulho,
  opts: CurvaOpcoes,
): THREE.Object3D | null {
  return buildCurve([de, para], mergulho, opts);
}
