import { describe, expect, it } from 'vitest';
import { componentCount, evaluate, form, increasingIndices } from './forms';

describe('contagem e ordem dos componentes', () => {
  it('conta C(dim, grau)', () => {
    expect(componentCount(2, 0)).toBe(1);
    expect(componentCount(2, 1)).toBe(2);
    expect(componentCount(2, 2)).toBe(1); // 2-form numa superfície é top form
    expect(componentCount(2, 3)).toBe(0);
    expect(componentCount(3, 1)).toBe(3);
    expect(componentCount(3, 2)).toBe(3);
    expect(componentCount(3, 3)).toBe(1);
  });

  it('ordena os multi-índices lexicograficamente', () => {
    expect(increasingIndices(2, 1)).toEqual([[0], [1]]);
    expect(increasingIndices(2, 2)).toEqual([[0, 1]]);
    expect(increasingIndices(3, 2)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it('recusa uma contagem de componentes incompatível com o grau', () => {
    expect(() => form(2, 2, [1, 2])).toThrow(/1 componente/);
  });
});

describe('⟨ω, v⟩ — a contração da Etapa 1', () => {
  // O critério de verificação da Etapa 1 no PLAN.md: o valor exibido tem de ser
  // ω_θ v^θ + ω_φ v^φ calculado independentemente.
  const casos: ReadonlyArray<readonly [number, number, number, number]> = [
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [2, -3, 0.5, 1.25],
    [-0.75, 4.5, -2, 0.125],
    [0, 0, 3, 7],
  ];

  it('vale ω_i v^i componente a componente', () => {
    for (const [wt, wp, vt, vp] of casos) {
      const omega = form(2, 1, [wt, wp]);
      const v = Float64Array.from([vt, vp]);
      expect(evaluate(omega, [v])).toBe(wt * vt + wp * vp);
    }
  });

  it('é linear no vetor', () => {
    const omega = form(2, 1, [2, -3]);
    const u = Float64Array.from([1, 2]);
    const v = Float64Array.from([-4, 0.5]);
    const soma = Float64Array.from([u[0]! + v[0]!, u[1]! + v[1]!]);
    expect(evaluate(omega, [soma])).toBeCloseTo(evaluate(omega, [u]) + evaluate(omega, [v]), 12);
  });
});

describe('ω(u, v) — a 2-form da Etapa 5, já pelo mesmo laço (D12)', () => {
  it('é antissimétrica: trocar os vetores inverte o sinal', () => {
    const omega = form(2, 2, [3.5]);
    const u = Float64Array.from([1, 2]);
    const v = Float64Array.from([-3, 0.5]);
    expect(evaluate(omega, [u, v])).toBeCloseTo(-evaluate(omega, [v, u]), 12);
  });

  it('anula em vetores paralelos', () => {
    const omega = form(2, 2, [3.5]);
    const u = Float64Array.from([1, 2]);
    const paralelo = Float64Array.from([2, 4]);
    expect(evaluate(omega, [u, paralelo])).toBeCloseTo(0, 12);
  });

  it('numa superfície 2D é densidade × área orientada', () => {
    // Top form: um único componente ω₀₁, e o valor é ele vezes o determinante
    // do paralelogramo. É a leitura de "contar células" da Etapa 5.
    const omega = form(2, 2, [2]);
    const u = Float64Array.from([3, 0]);
    const v = Float64Array.from([0, 4]);
    expect(evaluate(omega, [u, v])).toBe(2 * 12);
  });

  it('funciona em dimensão 3 sem código novo', () => {
    const omega = form(3, 2, [1, 0, 0]); // ω = dx⁰ ∧ dx¹
    const u = Float64Array.from([1, 0, 0]);
    const v = Float64Array.from([0, 1, 0]);
    const w = Float64Array.from([0, 0, 1]);
    expect(evaluate(omega, [u, v])).toBe(1);
    expect(evaluate(omega, [u, w])).toBe(0);
  });

  it('é bilinear', () => {
    const omega = form(3, 2, [1, -2, 0.5]);
    const u = Float64Array.from([1, 2, 3]);
    const a = Float64Array.from([0, 1, -1]);
    const b = Float64Array.from([2, -1, 0]);
    const soma = Float64Array.from([a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!]);
    expect(evaluate(omega, [u, soma])).toBeCloseTo(
      evaluate(omega, [u, a]) + evaluate(omega, [u, b]),
      12,
    );
  });
});

describe('grau 0', () => {
  it('avalia sem vetores', () => {
    expect(evaluate(form(2, 0, [7]), [])).toBe(7);
  });

  it('recusa um número errado de vetores', () => {
    expect(() => evaluate(form(2, 1, [1, 2]), [])).toThrow(/1 vetor/);
  });
});
