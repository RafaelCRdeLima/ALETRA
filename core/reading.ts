/**
 * A leitura de um valor de contração como número **e** como contagem (D11).
 *
 * A regra de D11 é que o numeral nunca arredonda em silêncio: "3.70", nunca
 * "≈4" nem "3". A parte inteira é quantas folhas o vetor atravessou por
 * completo; a fração é o quanto avançou dentro da folha seguinte. O render usa
 * `fraction` para destacar o pedaço final do vetor, de modo que o desenho e o
 * numeral sejam a mesma leitura em dois formatos.
 *
 * O cálculo mora em core/ porque é puro e vale a pena testar; a cor e a
 * espessura do destaque são problema de render/.
 */
export interface Reading {
  /** O valor cru da contração. */
  readonly value: number;
  /** Folhas atravessadas por completo, com sinal (truncado em direção a zero). */
  readonly whole: number;
  /** Avanço dentro da folha seguinte, em [0, 1) com o sinal de `value`. */
  readonly fraction: number;
  /** O numeral como vai para a tela — sempre com casa decimal. */
  readonly text: string;
}

export function read(value: number, decimals = 2): Reading {
  if (!Number.isFinite(value)) {
    return { value, whole: 0, fraction: 0, text: '—' };
  }
  const safe = value === 0 ? 0 : value;
  const whole = Math.trunc(safe);
  return {
    value: safe,
    whole,
    fraction: safe - whole,
    text: safe.toFixed(decimals),
  };
}
