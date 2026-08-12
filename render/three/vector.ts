import * as THREE from 'three';
import { read } from '../../core/reading';
import { toWorld, type TangentFrame } from './frame';
import { cone, segment } from './primitives';

/**
 * A seta de v, cortada onde a última folha inteira foi atravessada (D11).
 *
 * O trecho até esse corte é a parte inteira da contração; o rabicho colorido do
 * corte até a ponta é a fração. A ideia é que "3.70" no painel e o rabicho na
 * tela sejam a mesma leitura, e não dois fatos que o aluno precisa conciliar.
 */
export interface VectorOptions {
  readonly shaftRadius: number;
  readonly headLength: number;
  readonly headRadius: number;
  readonly colorWhole: THREE.ColorRepresentation;
  readonly colorFraction: THREE.ColorRepresentation;
  /** Usada pela morfose da Etapa 3: a seta desbota enquanto v♭ aparece. */
  readonly opacity?: number;
}

export function buildVector(
  frame: TangentFrame,
  v: Float64Array,
  value: number,
  opts: VectorOptions,
): THREE.Group {
  const group = new THREE.Group();

  const world = toWorld(frame, v);
  const length = world.length();
  if (length < 1e-6) return group;

  const direction = world.clone().divideScalar(length);
  const shaftLength = Math.max(0, length - opts.headLength);
  const { whole, fraction } = read(value);

  // Onde a última folha inteira é cruzada, como fração do comprimento da seta.
  const crossed =
    Number.isFinite(value) && Math.abs(value) > 1e-9
      ? Math.min(1, Math.max(0, whole / value))
      : 1;
  const cut = Math.min(crossed * length, shaftLength);

  // A fração vive entre o último cruzamento e a ponta — e a ponta inclui a
  // cabeça da seta. Sem isto, toda fração menor que a cabeça sumia da tela e o
  // numeral dizia "+ 0,30" sem nada correspondente no desenho, que é exatamente
  // a reconciliação que D11 existe para evitar.
  const hasFraction = Number.isFinite(value) && Math.abs(fraction) > 1e-6;

  const opacity = opts.opacity ?? 1;
  const transparent = opacity < 1;

  const wholeMaterial = new THREE.MeshStandardMaterial({
    color: opts.colorWhole,
    roughness: 0.35,
    metalness: 0.0,
    transparent,
    opacity,
  });
  const fractionMaterial = new THREE.MeshStandardMaterial({
    color: opts.colorFraction,
    roughness: 0.3,
    metalness: 0.0,
    emissive: new THREE.Color(opts.colorFraction).multiplyScalar(0.35),
    transparent,
    opacity,
  });

  const base = frame.point;
  const cutPoint = base.clone().addScaledVector(direction, cut);
  const shaftEnd = base.clone().addScaledVector(direction, shaftLength);
  const tip = base.clone().addScaledVector(direction, length);

  const inteiro = segment(base, cutPoint, opts.shaftRadius, wholeMaterial);
  if (inteiro) group.add(inteiro);

  // O rabicho da fração é um pouco mais grosso — a diferença tem de ser visível
  // antes de o aluno olhar para o numeral.
  const fracao = segment(cutPoint, shaftEnd, opts.shaftRadius * 1.45, fractionMaterial);
  if (fracao) group.add(fracao);

  group.add(
    cone(
      tip,
      direction,
      opts.headLength,
      opts.headRadius,
      hasFraction ? fractionMaterial : wholeMaterial,
    ),
  );

  return group;
}
