/**
 * ∧ contra as propriedades que o definem. O critério da Etapa 5 no PLAN.md diz
 * que a avaliação genérica de k-forms já está verde desde a Etapa 1 e que o que
 * falta testar aqui é o ∧ em si — é isso que este arquivo faz.
 */
import { describe, expect, it } from 'vitest';
import { evaluate, form } from './forms';
import { cellArea, wedge } from './wedge';

const um = (dim: number, c: readonly number[]) => form(dim, 1, c);

describe('propriedades que definem o ∧', () => {
  it('é antissimétrico: ω∧η = -η∧ω', () => {
    const a = um(2, [3, -1.5]);
    const b = um(2, [0.4, 2.2]);
    const ab = wedge(a, b);
    const ba = wedge(b, a);
    for (let i = 0; i < ab.components.length; i++) {
      expect(ab.components[i]).toBeCloseTo(-ba.components[i]!, 12);
    }
  });

  it('anula consigo mesmo: ω∧ω = 0', () => {
    for (const dim of [2, 3]) {
      const a = um(dim, dim === 2 ? [1.7, -0.3] : [1.7, -0.3, 2.1]);
      for (const c of wedge(a, a).components) expect(c).toBeCloseTo(0, 12);
    }
  });

  it('anula em 1-forms proporcionais — elas não geram área', () => {
    const a = um(2, [2, 5]);
    const b = um(2, [-6, -15]); // -3a
    expect(wedge(a, b).components[0]).toBeCloseTo(0, 12);
  });

  it('é bilinear', () => {
    const a = um(2, [1.3, 0.7]);
    const b1 = um(2, [0.5, -2]);
    const b2 = um(2, [3, 1.1]);
    const soma = um(2, [b1.components[0]! + b2.components[0]!, b1.components[1]! + b2.components[1]!]);

    expect(wedge(a, soma).components[0]).toBeCloseTo(
      wedge(a, b1).components[0]! + wedge(a, b2).components[0]!,
      12,
    );

    const escalado = um(2, [2.5 * a.components[0]!, 2.5 * a.components[1]!]);
    expect(wedge(escalado, b1).components[0]).toBeCloseTo(2.5 * wedge(a, b1).components[0]!, 12);
  });

  it('dá o grau e a contagem de componentes certos', () => {
    expect(wedge(um(2, [1, 0]), um(2, [0, 1])).degree).toBe(2);
    expect(wedge(um(2, [1, 0]), um(2, [0, 1])).components.length).toBe(1);
    expect(wedge(um(3, [1, 0, 0]), um(3, [0, 1, 0])).components.length).toBe(3);
  });
});

describe('valores conhecidos à mão', () => {
  it('dx ∧ dy = 1 na base canônica', () => {
    expect(wedge(um(2, [1, 0]), um(2, [0, 1])).components[0]).toBe(1);
    expect(wedge(um(2, [0, 1]), um(2, [1, 0])).components[0]).toBe(-1);
  });

  it('em dim 3 preenche [01, 02, 12] na ordem lexicográfica', () => {
    const r = wedge(um(3, [1, 0, 0]), um(3, [0, 1, 0]));
    expect(Array.from(r.components)).toEqual([1, 0, 0]);

    const s = wedge(um(3, [0, 1, 0]), um(3, [0, 0, 1]));
    expect(Array.from(s.components)).toEqual([0, 0, 1]);
  });
});

describe('a leitura: contar células', () => {
  it('(ω∧η)(u,v) é o número de células cercadas pelo paralelogramo', () => {
    // Com ω = dx e η = dy, a célula unitária é o quadrado 1×1, então o valor é
    // simplesmente a área orientada do paralelogramo.
    const sigma = wedge(um(2, [1, 0]), um(2, [0, 1]));
    const u = Float64Array.from([3, 0]);
    const v = Float64Array.from([0, 2]);
    expect(evaluate(sigma, [u, v])).toBe(6);
    expect(evaluate(sigma, [v, u])).toBe(-6); // trocar a ordem inverte a orientação
  });

  it('acompanha a densidade: ω duas vezes maior, o dobro de células', () => {
    const simples = wedge(um(2, [1, 0]), um(2, [0, 1]));
    const denso = wedge(um(2, [2, 0]), um(2, [0, 1]));
    const u = Float64Array.from([1, 0]);
    const v = Float64Array.from([0, 1]);
    expect(evaluate(denso, [u, v])).toBe(2 * evaluate(simples, [u, v])!);
  });

  it('a célula unitária tem área 1/|σ| na carta', () => {
    expect(cellArea(2)).toBeCloseTo(0.5, 12);
    expect(cellArea(-4)).toBeCloseTo(0.25, 12);
    expect(cellArea(0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('recusas', () => {
  it('recusa graus que nenhuma etapa pede', () => {
    const doisForma = form(2, 2, [1]);
    expect(() => wedge(doisForma, um(2, [1, 0]))).toThrow(/combina duas 1-forms/);
  });

  it('recusa dimensões diferentes', () => {
    expect(() => wedge(um(2, [1, 0]), um(3, [1, 0, 0]))).toThrow(/dimensões diferentes/);
  });
});
