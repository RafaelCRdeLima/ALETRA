/**
 * O colchete de Lie e o quadrilátero que não fecha.
 *
 * O critério do PLAN.md tem duas metades: o colchete contra forma fechada
 * conhecida (campos coordenados comutam), e o vão do quadrilátero escalando
 * corretamente com o passo de fluxo. A segunda é a que dá sentido à primeira —
 * é ela que diz que o desenho está mostrando o colchete, e não um erro numérico
 * qualquer.
 */
import { describe, expect, it } from 'vitest';
import { flow, flowPath, rk4Step, type VectorField } from './flow';
import { flowQuadrilateral, lieBracket } from './lie';

const DIM = 2;
const P = Float64Array.from([0.7, -1.3]);

/** ∂_x e ∂_y — campos coordenados, que comutam. */
const dx: VectorField = (_x, out) => {
  out[0] = 1;
  out[1] = 0;
};
const dy: VectorField = (_x, out) => {
  out[0] = 0;
  out[1] = 1;
};
/** Y = x ∂_y  ⟹  [∂_x, Y] = ∂_y */
const xDy: VectorField = (x, out) => {
  out[0] = 0;
  out[1] = x[0]!;
};
/** Rotação: -y ∂_x + x ∂_y */
const rot: VectorField = (x, out) => {
  out[0] = -x[1]!;
  out[1] = x[0]!;
};

describe('RK4', () => {
  it('reproduz um fluxo com forma fechada: ẋ = x dá exponencial', () => {
    const crescer: VectorField = (x, out) => {
      out[0] = x[0]!;
      out[1] = 0;
    };
    // 7 casas, não 8: com 40 passos o erro global de RK4 fica na ordem de 1e-8,
    // e apertar além disso seria cobrar do método o que a ordem dele não promete.
    // Quem verifica a ordem é o teste de convergência abaixo.
    const fim = flow(crescer, Float64Array.from([1, 0]), 1, 40, DIM);
    expect(fim[0]).toBeCloseTo(Math.E, 7);
  });

  it('converge na quarta ordem: dobrar os passos divide o erro por ~16', () => {
    const crescer: VectorField = (x, out) => {
      out[0] = x[0]!;
      out[1] = 0;
    };
    const erro = (steps: number): number =>
      Math.abs(flow(crescer, Float64Array.from([1, 0]), 1, steps, DIM)[0]! - Math.E);

    const razao = erro(10) / erro(20);
    expect(razao).toBeGreaterThan(12);
    expect(razao).toBeLessThan(20);
  });

  it('a rotação preserva o raio', () => {
    const inicio = Float64Array.from([1.4, 0]);
    const fim = flow(rot, inicio, Math.PI / 3, 60, DIM);
    expect(Math.hypot(fim[0]!, fim[1]!)).toBeCloseTo(1.4, 9);
    // Um terço de π de rotação leva (1.4, 0) para 1.4·(cos60°, sin60°).
    expect(fim[0]).toBeCloseTo(1.4 * Math.cos(Math.PI / 3), 7);
    expect(fim[1]).toBeCloseTo(1.4 * Math.sin(Math.PI / 3), 7);
  });

  it('anda para trás quando o tempo é negativo', () => {
    const ida = flow(rot, P, 0.4, 30, DIM);
    const volta = flow(rot, ida, -0.4, 30, DIM);
    expect(volta[0]).toBeCloseTo(P[0]!, 9);
    expect(volta[1]).toBeCloseTo(P[1]!, 9);
  });

  it('um passo isolado é a quarta ordem que promete', () => {
    // Erro local ~ dt⁵: reduzir dt pela metade tem de reduzir o erro ~32×.
    const exato = (dt: number): number => Math.exp(dt);
    const crescer: VectorField = (x, out) => {
      out[0] = x[0]!;
      out[1] = 0;
    };
    const erroCom = (dt: number): number => {
      const out = new Float64Array(DIM);
      rk4Step(crescer, Float64Array.from([1, 0]), dt, DIM, out);
      return Math.abs(out[0]! - exato(dt));
    };
    expect(erroCom(0.1) / erroCom(0.05)).toBeGreaterThan(20);
  });

  it('o caminho tem um ponto a mais que os passos', () => {
    expect(flowPath(rot, P, 0.5, 8, DIM)).toHaveLength(9);
  });
});

describe('[X, Y] contra forma fechada', () => {
  it('campos coordenados comutam', () => {
    const b = lieBracket(dx, dy, P, DIM);
    expect(Math.hypot(b[0]!, b[1]!)).toBeLessThan(1e-8);
  });

  it('[∂_x, x∂_y] = ∂_y', () => {
    const b = lieBracket(dx, xDy, P, DIM);
    expect(b[0]).toBeCloseTo(0, 6);
    expect(b[1]).toBeCloseTo(1, 6);
  });

  it('é antissimétrico', () => {
    const ab = lieBracket(dx, xDy, P, DIM);
    const ba = lieBracket(xDy, dx, P, DIM);
    expect(ab[0]).toBeCloseTo(-ba[0]!, 8);
    expect(ab[1]).toBeCloseTo(-ba[1]!, 8);
  });

  it('anula consigo mesmo', () => {
    const b = lieBracket(rot, rot, P, DIM);
    expect(Math.hypot(b[0]!, b[1]!)).toBeLessThan(1e-7);
  });

  it('[∂_x, rot] = ∂_y', () => {
    // rot = -y ∂_x + x ∂_y ⟹ [∂_x, rot] = ∂_x(-y) ∂_x + ∂_x(x) ∂_y = ∂_y
    const b = lieBracket(dx, rot, P, DIM);
    expect(b[0]).toBeCloseTo(0, 6);
    expect(b[1]).toBeCloseTo(1, 6);
  });
});

describe('o quadrilátero de fluxos', () => {
  it('fecha para campos que comutam', () => {
    const q = flowQuadrilateral(dx, dy, P, 0.3, 24, DIM);
    expect(Math.hypot(q.vao[0]!, q.vao[1]!)).toBeLessThan(1e-10);
  });

  it('não fecha para campos que não comutam', () => {
    const q = flowQuadrilateral(dx, xDy, P, 0.3, 24, DIM);
    expect(Math.hypot(q.vao[0]!, q.vao[1]!)).toBeGreaterThan(0.05);
  });

  it('o vão é t²·[X,Y] — a afirmação que o desenho faz', () => {
    const t = 0.15;
    const q = flowQuadrilateral(dx, xDy, P, t, 40, DIM);
    const b = lieBracket(dx, xDy, P, DIM);
    for (let i = 0; i < DIM; i++) {
      expect(q.vao[i]).toBeCloseTo(t * t * b[i]!, 5);
    }
  });

  it('e escala com t² ao encolher o passo — o critério visual, medido', () => {
    // Metade do tempo, um quarto do vão. Se escalasse com t, o desenho estaria
    // mostrando erro de integração em vez de geometria.
    const vaoCom = (t: number): number => {
      const q = flowQuadrilateral(dx, rot, P, t, 60, DIM);
      return Math.hypot(q.vao[0]!, q.vao[1]!);
    };
    const razao = vaoCom(0.2) / vaoCom(0.1);
    expect(razao).toBeGreaterThan(3.5);
    expect(razao).toBeLessThan(4.5);
  });

  it('trocar a ordem inverte o vão', () => {
    const a = flowQuadrilateral(dx, xDy, P, 0.2, 30, DIM);
    const b = flowQuadrilateral(xDy, dx, P, 0.2, 30, DIM);
    expect(a.vao[1]).toBeCloseTo(-b.vao[1]!, 8);
  });
});
