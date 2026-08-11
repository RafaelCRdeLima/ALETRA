/**
 * Uma carta de coordenadas: a dimensão, os nomes e como eles aparecem na tela.
 *
 * `names` é o que o parser aceita — ASCII, digitável sem teclado especial. Um
 * aluno tem de conseguir escrever `sin(theta)^2` sem caçar um θ. `symbols` é o
 * que a interface mostra, porque `g_phiphi` num rótulo é ilegível e `g_φφ` não.
 * Separar os dois evita a escolha entre uma gramática hostil e uma tela feia.
 *
 * `dim` é sempre lido daqui, nunca escrito como literal no resto do código (D12).
 * O escopo do projeto limita `dim` a 2 ou 3.
 */
export interface Chart {
  readonly dim: number;
  readonly names: readonly string[];
  readonly symbols: readonly string[];
}

const GREEK: Readonly<Record<string, string>> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  rho: 'ρ',
  sigma: 'σ',
  phi: 'φ',
  psi: 'ψ',
  chi: 'χ',
  omega: 'ω',
};

export function chart(names: readonly string[], symbols?: readonly string[]): Chart {
  return {
    dim: names.length,
    names: [...names],
    symbols: symbols ? [...symbols] : names.map((name) => GREEK[name] ?? name),
  };
}

/** Aloca um vetor de componentes zerado para esta carta. */
export function zeros(chart: Chart): Float64Array {
  return new Float64Array(chart.dim);
}
