/**
 * Produto exterior de duas 1-forms.
 *
 *   (ω ∧ η)_ij = ω_i η_j - ω_j η_i
 *
 * O desenho que isto autoriza é o motivo de a etapa existir: as folhas de ω e as
 * de η se cruzam e ladrilham o plano em células, e **cada célula vale 1**. Onde
 * a pilha de uma 1-form se lê contando linhas atravessadas, a 2-form se lê
 * contando células cercadas. É a mesma leitura uma dimensão acima.
 *
 * Numa superfície (dim 2) o resultado é top-degree: um componente só, sem
 * direção, só densidade e orientação — ver D12. Em dim 3 são três componentes e
 * o desenho é outro; a álgebra aqui já cobre os dois, o desenho não.
 *
 * A avaliação de uma 2-form sobre dois vetores não mora aqui: é `evaluate` de
 * `forms.ts`, que trata qualquer grau com o mesmo laço e está verde desde a
 * Etapa 1. Esta etapa não precisou de código de avaliação novo, que era
 * exatamente a aposta de D12.
 */
import { form, increasingIndices, type Form } from './forms';

/** ω ∧ η, com ω e η 1-forms da mesma carta. */
export function wedge(a: Form, b: Form): Form {
  if (a.degree !== 1 || b.degree !== 1) {
    throw new Error(
      `wedge combina duas 1-forms; recebi grau ${a.degree} e ${b.degree}. ` +
        `Graus maiores existem, mas nenhuma etapa do projeto os pede.`,
    );
  }
  if (a.dim !== b.dim) {
    throw new Error(`ω e η vivem em dimensões diferentes (${a.dim} e ${b.dim})`);
  }

  const pares = increasingIndices(a.dim, 2);
  const componentes = pares.map(([i, j]) => {
    const ai = a.components[i!]!;
    const aj = a.components[j!]!;
    const bi = b.components[i!]!;
    const bj = b.components[j!]!;
    return ai * bj - aj * bi;
  });

  return form(a.dim, 2, componentes);
}

/**
 * A área de uma célula unitária, em coordenadas, para uma 2-form top-degree.
 *
 * Numa superfície a 2-form tem um componente σ, e a célula de conteúdo 1 tem
 * área |1/σ| na carta. É o que o desenho precisa saber para ladrilhar; o sinal
 * de σ é a orientação e vai por fora.
 */
export function cellArea(sigma: number): number {
  return Math.abs(sigma) < 1e-12 ? Number.POSITIVE_INFINITY : 1 / Math.abs(sigma);
}
