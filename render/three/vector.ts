import * as THREE from 'three';
import { read } from '../../core/reading';
import { toWorld, type TangentFrame } from './frame';
import { iluminado } from './materials';
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
  /**
   * Falso no modo 2-form: lá o número conta células cercadas por dois vetores e
   * não é propriedade de v sozinho, então marcar um corte no meio dele sugeriria
   * uma leitura que não existe.
   */
  readonly showFraction?: boolean;
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
    (opts.showFraction ?? true) && Number.isFinite(value) && Math.abs(value) > 1e-9
      ? Math.min(1, Math.max(0, whole / value))
      : 1;
  const cut = Math.min(crossed * length, shaftLength);

  // A fração vive entre o último cruzamento e a ponta — e a ponta inclui a
  // cabeça da seta. Sem isto, toda fração menor que a cabeça sumia da tela e o
  // numeral dizia "+ 0,30" sem nada correspondente no desenho, que é exatamente
  // a reconciliação que D11 existe para evitar.
  const hasFraction =
    (opts.showFraction ?? true) && Number.isFinite(value) && Math.abs(fraction) > 1e-6;

  // Materiais compartilhados: ver materials.ts. Criar um por seta a cada quadro
  // recompilava shader e triplicava o custo do arraste.
  const opacity = opts.opacity ?? 1;
  const wholeMaterial = iluminado(opts.colorWhole, opacity);
  const fractionMaterial = iluminado(opts.colorFraction, opacity, 0.35);

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
