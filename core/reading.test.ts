import { describe, expect, it } from 'vitest';
import { read } from './reading';

describe('leitura do numeral (D11)', () => {
  it('nunca colapsa a fração num inteiro', () => {
    const r = read(3.7);
    expect(r.text).toBe('3.70');
    expect(r.whole).toBe(3);
    expect(r.fraction).toBeCloseTo(0.7, 12);
  });

  it('mostra casa decimal mesmo num valor inteiro', () => {
    expect(read(4).text).toBe('4.00');
    expect(read(0).text).toBe('0.00');
  });

  it('trunca em direção a zero nos negativos, não para baixo', () => {
    // -2.3 atravessou 2 folhas no sentido contrário, não 3.
    const r = read(-2.3);
    expect(r.whole).toBe(-2);
    expect(r.fraction).toBeCloseTo(-0.3, 12);
    expect(r.text).toBe('-2.30');
  });

  it('whole + fraction reconstrói o valor', () => {
    for (const v of [0, 0.5, -0.5, 3.7, -2.3, 12.999, -0.001]) {
      const r = read(v);
      expect(r.whole + r.fraction).toBeCloseTo(v, 12);
    }
  });

  it('não devolve "-0.00"', () => {
    expect(read(0).text).toBe('0.00');
    expect(read(-0).text).toBe('0.00');
  });

  it('degrada sem quebrar em valores não finitos', () => {
    expect(read(Number.NaN).text).toBe('—');
    expect(read(Number.POSITIVE_INFINITY).text).toBe('—');
  });
});
