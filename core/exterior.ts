/**
 * A derivada exterior, por diferença central.
 *
 *   (df)_i    = ∂_i f
 *   (dω)_ij   = ∂_i ω_j - ∂_j ω_i
 *
 * A construção é a de Bachman: (dω)(u, v) é a circulação de ω em torno da célula
 * infinitesimal gerada por u e v. O que o desenho conta como células é essa
 * circulação — quantas voltas a one-form dá em torno de cada pedacinho.
 *
 * ## Por que uma 0-form entra nesta etapa
 *
 * Numa superfície, d(dω) para uma 1-form é zero por falta de espaço: dω já é
 * top-degree e não existem 3-forms. Demonstrar d² = 0 assim não demonstraria
 * nada — o zero viria da dimensão, não da geometria.
 *
 * A afirmação com conteúdo começa uma casa antes: f é uma função, df é uma
 * 1-form, e d(df) = 0 é uma 2-form que *poderia* ser diferente de zero e não é.
 * O motivo é que a circulação de df em torno de qualquer laço fechado é a
 * variação de f ao voltar ao ponto de partida, que é zero porque f tem um valor
 * só em cada ponto. É esse zero que o produto tem de desenhar.
 *
 * ## Sobre o passo
 *
 * Mesmo raciocínio de D5: h entre 1e-5 e 1e-6, relativo à escala da coordenada.
 * Em d(df) as diferenças finitas se encadeiam, e o resíduo que sobra é ruído de
 * arredondamento, não geometria — daí os testes cobrarem "pequeno perto de dω",
 * e não "exatamente zero", que seria cobrar do ponto flutuante o que ele não dá.
 */
import { form, increasingIndices, type Form } from './forms';

export const DEFAULT_H_EXTERIOR = 1e-5;

/** Uma 0-form: um número em cada ponto. */
export type ScalarField = (x: Float64Array) => number;

/** Uma 1-form como campo: componentes em cada ponto. */
export type FormField = (x: Float64Array, out: Float64Array) => void;

const passo = (x: Float64Array, i: number, h: number): number =>
  h * Math.max(1, Math.abs(x[i]!));

/** df — o diferencial de uma função, que é uma 1-form. */
export function differential0(
  f: ScalarField,
  x: Float64Array,
  dim: number,
  h = DEFAULT_H_EXTERIOR,
): Form {
  const componentes = new Array<number>(dim);
  const probe = Float64Array.from(x);

  for (let i = 0; i < dim; i++) {
    const passoI = passo(x, i, h);
    probe[i] = x[i]! + passoI;
    const mais = f(probe);
    probe[i] = x[i]! - passoI;
    const menos = f(probe);
    probe[i] = x[i]!;
    componentes[i] = (mais - menos) / (2 * passoI);
  }
  return form(dim, 1, componentes);
}

/** dω — a derivada exterior de uma 1-form, que é uma 2-form. */
export function differential1(
  omega: FormField,
  x: Float64Array,
  dim: number,
  h = DEFAULT_H_EXTERIOR,
): Form {
  /** derivadas[i * dim + j] = ∂_i ω_j */
  const derivadas = new Float64Array(dim * dim);
  const mais = new Float64Array(dim);
  const menos = new Float64Array(dim);
  const probe = Float64Array.from(x);

  for (let i = 0; i < dim; i++) {
    const passoI = passo(x, i, h);
    probe[i] = x[i]! + passoI;
    omega(probe, mais);
    probe[i] = x[i]! - passoI;
    omega(probe, menos);
    probe[i] = x[i]!;
    for (let j = 0; j < dim; j++) {
      derivadas[i * dim + j] = (mais[j]! - menos[j]!) / (2 * passoI);
    }
  }

  const componentes = increasingIndices(dim, 2).map(
    ([i, j]) => derivadas[i! * dim + j!]! - derivadas[j! * dim + i!]!,
  );
  return form(dim, 2, componentes);
}

/**
 * d aplicado duas vezes: d(df), que a matemática obriga a ser zero.
 *
 * Existe como função própria — em vez de o chamador compor as duas — porque o
 * encadeamento das diferenças finitas precisa de um passo externo maior que o
 * interno, pelo mesmo motivo que a curvatura precisa (o ruído do nível de dentro
 * é dividido pelo passo de fora). Deixar essa escolha para o chamador seria
 * convidar a um resíduo que parece geometria e é aritmética.
 */
export function differentialSquared(
  f: ScalarField,
  x: Float64Array,
  dim: number,
  hInterno = DEFAULT_H_EXTERIOR,
  hExterno = 1e-3,
): Form {
  const campoDf: FormField = (ponto, out) => {
    const df = differential0(f, ponto, dim, hInterno);
    out.set(df.components);
  };
  return differential1(campoDf, x, dim, hExterno);
}

/** Maior componente em módulo — a régua para dizer se uma forma "colapsou". */
export function magnitude(f: Form): number {
  let maior = 0;
  for (const c of f.components) maior = Math.max(maior, Math.abs(c));
  return maior;
}
