/**
 * O colchete de Lie, e o quadrilátero de fluxos que não fecha.
 *
 *   [X, Y]^i = X^j ∂_j Y^i - Y^j ∂_j X^i
 *
 * A leitura da etapa é a segunda função daqui, não a primeira. Seguir X e depois
 * Y não leva ao mesmo lugar que seguir Y e depois X, e o vão entre as duas
 * chegadas **é** o colchete — a menos de t², que é o que o teste de escala
 * verifica. A fórmula acima é a conta; o quadrilátero aberto é o fato.
 *
 * Campos coordenados comutam, e por isso o quadrilátero deles fecha. É o
 * controle experimental desta etapa, do mesmo jeito que o plano euclidiano é o
 * da Etapa 3.
 */
import { flow, type VectorField } from './flow';

export const DEFAULT_H_LIE = 1e-5;

/** [X, Y] no ponto, por diferença central das derivadas direcionais. */
export function lieBracket(
  X: VectorField,
  Y: VectorField,
  x: Float64Array,
  dim: number,
  h = DEFAULT_H_LIE,
): Float64Array {
  const xVal = new Float64Array(dim);
  const yVal = new Float64Array(dim);
  X(x, xVal);
  Y(x, yVal);

  /** dY[j * dim + i] = ∂_j Y^i, e o mesmo para dX. */
  const dY = new Float64Array(dim * dim);
  const dX = new Float64Array(dim * dim);
  const mais = new Float64Array(dim);
  const menos = new Float64Array(dim);
  const probe = Float64Array.from(x);

  for (let j = 0; j < dim; j++) {
    const passo = h * Math.max(1, Math.abs(x[j]!));
    probe[j] = x[j]! + passo;
    Y(probe, mais);
    X(probe, menos);
    for (let i = 0; i < dim; i++) {
      dY[j * dim + i] = mais[i]!;
      dX[j * dim + i] = menos[i]!;
    }
    probe[j] = x[j]! - passo;
    Y(probe, mais);
    X(probe, menos);
    for (let i = 0; i < dim; i++) {
      dY[j * dim + i] = (dY[j * dim + i]! - mais[i]!) / (2 * passo);
      dX[j * dim + i] = (dX[j * dim + i]! - menos[i]!) / (2 * passo);
    }
    probe[j] = x[j]!;
  }

  const out = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    let soma = 0;
    for (let j = 0; j < dim; j++) {
      soma += xVal[j]! * dY[j * dim + i]! - yVal[j]! * dX[j * dim + i]!;
    }
    out[i] = soma;
  }
  return out;
}

export interface Quadrilatero {
  /** Seguir X e depois Y. */
  readonly xEntaoY: Float64Array;
  /** Seguir Y e depois X. */
  readonly yEntaoX: Float64Array;
  /** O vão entre as duas chegadas: xEntaoY - yEntaoX ≈ t²·[X, Y]. */
  readonly vao: Float64Array;
  /** Os quatro trechos, para desenhar o caminho e não só as pontas. */
  readonly caminhoXY: readonly Float64Array[];
  readonly caminhoYX: readonly Float64Array[];
}

/**
 * O quadrilátero de fluxos, com o vão medido.
 *
 * A ordem importa e o sinal também: `xEntaoY - yEntaoX` é o que tende a
 * `t²·[X,Y]`, e trocar os dois inverteria o colchete junto.
 */
export function flowQuadrilateral(
  X: VectorField,
  Y: VectorField,
  p: Float64Array,
  t: number,
  steps: number,
  dim: number,
): Quadrilatero {
  const aposX = flow(X, p, t, steps, dim);
  const xEntaoY = flow(Y, aposX, t, steps, dim);

  const aposY = flow(Y, p, t, steps, dim);
  const yEntaoX = flow(X, aposY, t, steps, dim);

  const vao = new Float64Array(dim);
  for (let i = 0; i < dim; i++) vao[i] = xEntaoY[i]! - yEntaoX[i]!;

  return {
    xEntaoY,
    yEntaoX,
    vao,
    caminhoXY: [p, aposX, xEntaoY],
    caminhoYX: [p, aposY, yEntaoX],
  };
}
