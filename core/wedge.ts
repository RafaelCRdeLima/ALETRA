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

/**
 * As arestas da célula unitária do retículo de ω e η — a base dual de (ω, η).
 *
 * São os vetores a e b com ω(a)=1, η(a)=0, ω(b)=0, η(b)=1: exatamente o
 * paralelogramo que uma folha de ω e uma de η recortam. É o que o desenho
 * precisa para pintar as células como áreas em vez de deixá-las como vãos
 * entre linhas.
 *
 * **A forma da célula não pertence à 2-form.** Numa superfície ela é
 * top-degree — só densidade e orientação, sem direção preferida. Este retículo
 * é da *fatoração* ω∧η escolhida; girar ω e η mantendo σ dá células de outro
 * formato e a mesma contagem, e ver isso acontecer é conteúdo, não defeito.
 *
 * Devolve null quando ω e η são paralelos: aí σ = 0, não há célula finita, e
 * não há o que ladrilhar.
 */
/**
 * Célula de uma 2-form dada só pela densidade, sem fatoração à mão.
 *
 * A Etapa 6 precisa disto: dω sai como um número σ, e não vem acompanhada de um
 * par de 1-forms que sugira um formato. Como a 2-form não tem grade preferida
 * (a forma nunca foi dela — ver `cellEdges`), qualquer paralelogramo de área
 * 1/|σ| serve, e o quadrado alinhado aos eixos é a escolha que menos inventa.
 */
export function cellEdgesFromDensity(
  sigma: number,
): { a: [number, number]; b: [number, number] } | null {
  if (!Number.isFinite(sigma) || Math.abs(sigma) < 1e-12) return null;
  const lado = Math.sqrt(1 / Math.abs(sigma));
  return { a: [lado, 0], b: [0, sigma < 0 ? -lado : lado] };
}

export function cellEdges(
  omega: Form,
  eta: Form,
): { a: [number, number]; b: [number, number] } | null {
  if (omega.dim !== 2 || eta.dim !== 2) return null;

  const [w0, w1] = [omega.components[0]!, omega.components[1]!];
  const [e0, e1] = [eta.components[0]!, eta.components[1]!];
  const sigma = w0 * e1 - w1 * e0;
  if (!Number.isFinite(sigma) || Math.abs(sigma) < 1e-12) return null;

  return {
    a: [e1 / sigma, -e0 / sigma],
    b: [-w1 / sigma, w0 / sigma],
  };
}
