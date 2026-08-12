/**
 * A derivada exterior contra formas com resposta conhecida à mão, e o critério
 * central da Etapa 6: d(df) = 0 para funções arbitrárias, nos casos padrão-ouro.
 *
 * "Zero" aqui é zero de diferença finita: o resíduo é ruído de arredondamento, e
 * o teste cobra que ele seja desprezível *perto da escala de dω* — cobrar zero
 * exato seria cobrar do ponto flutuante o que ele não dá, e afrouxar a tolerância
 * até passar seria não testar nada.
 */
import { describe, expect, it } from 'vitest';
import { differential0, differential1, differentialSquared, magnitude } from './exterior';
import { evaluate } from './forms';

const DIM = 2;
const P = Float64Array.from([0.7, -1.3]);

describe('df — o diferencial de uma função', () => {
  it('dá o gradiente componente a componente', () => {
    // f = x² + 3xy  ⟹  df = (2x + 3y) dx + (3x) dy
    const f = (x: Float64Array): number => x[0]! ** 2 + 3 * x[0]! * x[1]!;
    const df = differential0(f, P, DIM);
    expect(df.components[0]).toBeCloseTo(2 * P[0]! + 3 * P[1]!, 6);
    expect(df.components[1]).toBeCloseTo(3 * P[0]!, 6);
  });

  it('anula numa função constante', () => {
    expect(magnitude(differential0(() => 4.2, P, DIM))).toBeLessThan(1e-9);
  });

  it('é uma 1-form de verdade — entra em `evaluate` como qualquer outra', () => {
    const f = (x: Float64Array): number => Math.sin(x[0]!) * x[1]!;
    const df = differential0(f, P, DIM);
    expect(df.degree).toBe(1);
    // df(v) é a derivada direcional de f ao longo de v.
    const v = Float64Array.from([1, 0]);
    expect(evaluate(df, [v])).toBeCloseTo(Math.cos(P[0]!) * P[1]!, 6);
  });
});

describe('dω — a circulação em torno da célula', () => {
  it('ω = -y dx + x dy tem dω = 2 dx∧dy', () => {
    const omega = (x: Float64Array, out: Float64Array): void => {
      out[0] = -x[1]!;
      out[1] = x[0]!;
    };
    expect(differential1(omega, P, DIM).components[0]).toBeCloseTo(2, 6);
  });

  it('ω de componentes constantes não circula', () => {
    const omega = (_x: Float64Array, out: Float64Array): void => {
      out[0] = 3;
      out[1] = -1.5;
    };
    expect(magnitude(differential1(omega, P, DIM))).toBeLessThan(1e-8);
  });

  it('acompanha um caso com resposta fechada: ω = x²y dx  ⟹  dω = -x² dx∧dy', () => {
    const omega = (x: Float64Array, out: Float64Array): void => {
      out[0] = x[0]! ** 2 * x[1]!;
      out[1] = 0;
    };
    // (dω)₀₁ = ∂₀ω₁ - ∂₁ω₀ = 0 - x² = -x²
    expect(differential1(omega, P, DIM).components[0]).toBeCloseTo(-(P[0]! ** 2), 5);
  });

  it('é linear', () => {
    const a = (x: Float64Array, out: Float64Array): void => {
      out[0] = x[1]! ** 2;
      out[1] = 0;
    };
    const b = (x: Float64Array, out: Float64Array): void => {
      out[0] = 0;
      out[1] = Math.sin(x[0]!);
    };
    const soma = (x: Float64Array, out: Float64Array): void => {
      const ta = new Float64Array(DIM);
      const tb = new Float64Array(DIM);
      a(x, ta);
      b(x, tb);
      out[0] = ta[0]! + tb[0]!;
      out[1] = ta[1]! + tb[1]!;
    };
    expect(differential1(soma, P, DIM).components[0]).toBeCloseTo(
      differential1(a, P, DIM).components[0]! + differential1(b, P, DIM).components[0]!,
      5,
    );
  });
});

describe('d² = 0 — o critério da Etapa 6', () => {
  const funcoes: ReadonlyArray<readonly [string, (x: Float64Array) => number]> = [
    ['x·y', (x) => x[0]! * x[1]!],
    ['x² - y²', (x) => x[0]! ** 2 - x[1]! ** 2],
    ['sin(x)·cos(y)', (x) => Math.sin(x[0]!) * Math.cos(x[1]!)],
    ['exp(x/2)·y³', (x) => Math.exp(x[0]! / 2) * x[1]! ** 3],
    ['1/(1 + x² + y²)', (x) => 1 / (1 + x[0]! ** 2 + x[1]! ** 2)],
  ];

  const pontos = [
    Float64Array.from([0.7, -1.3]),
    Float64Array.from([-0.4, 0.9]),
    Float64Array.from([1.6, 2.1]),
  ];

  it('colapsa para toda função e todo ponto testado', () => {
    for (const [nome, f] of funcoes) {
      for (const x of pontos) {
        const resto = magnitude(differentialSquared(f, x, DIM));
        expect(resto, `d(df) em ${nome}`).toBeLessThan(1e-4);
      }
    }
  });

  it('e o resíduo é desprezível perto do dω de uma forma que *não* é exata', () => {
    // A comparação é o que dá sentido ao "zero": uma 1-form com circulação de
    // verdade dá dω da ordem de 1, e d(df) fica ordens de grandeza abaixo.
    const rotacional = (x: Float64Array, out: Float64Array): void => {
      out[0] = -x[1]!;
      out[1] = x[0]!;
    };
    const naoNulo = magnitude(differential1(rotacional, P, DIM));
    const nulo = magnitude(differentialSquared((x) => x[0]! * x[1]!, P, DIM));

    expect(naoNulo).toBeGreaterThan(1);
    expect(nulo / naoNulo).toBeLessThan(1e-4);
  });
});
