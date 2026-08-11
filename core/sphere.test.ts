import { describe, expect, it } from 'vitest';
import { christoffelIndex, normSquared } from './metric';
import {
  SPHERE_CHART,
  sphereBasis,
  sphereChartOf,
  sphereChristoffel,
  sphereCurvature,
  sphereEmbed,
  sphereMetric,
  sphereNormal,
} from './sphere';

const DIM = SPHERE_CHART.dim;

/** Pontos de amostragem longe dos polos, onde (θ, φ) é uma carta boa. */
const AMOSTRAS: ReadonlyArray<readonly [number, number]> = [
  [Math.PI / 2, 0],
  [Math.PI / 3, Math.PI / 4],
  [Math.PI / 6, -Math.PI / 3],
  [(2 * Math.PI) / 3, 1.1],
  [1.0, 5.5],
];

const ponto = (theta: number, phi: number): Float64Array => Float64Array.from([theta, phi]);
const dot = (a: Float64Array, b: Float64Array, ao = 0, bo = 0): number =>
  a[ao]! * b[bo]! + a[ao + 1]! * b[bo + 1]! + a[ao + 2]! * b[bo + 2]!;

describe('métrica da esfera', () => {
  it('tem os componentes fechados R² e R² sin²θ, e é diagonal', () => {
    const R = 1.7;
    const g = new Float64Array(DIM * DIM);
    for (const [theta, phi] of AMOSTRAS) {
      sphereMetric(R)(ponto(theta, phi), g);
      expect(g[0]).toBeCloseTo(R * R, 12);
      expect(g[3]).toBeCloseTo(R * R * Math.sin(theta) ** 2, 12);
      expect(g[1]).toBe(0);
      expect(g[2]).toBe(0);
    }
  });
});

describe('Christoffels da esfera (fórmula fechada, D6)', () => {
  const gamma = new Float64Array(DIM * DIM * DIM);

  it('bate com os valores conhecidos à mão', () => {
    for (const [theta, phi] of AMOSTRAS) {
      sphereChristoffel()(ponto(theta, phi), gamma);
      const s = Math.sin(theta);
      const c = Math.cos(theta);
      expect(gamma[christoffelIndex(DIM, 0, 1, 1)]).toBeCloseTo(-s * c, 12);
      expect(gamma[christoffelIndex(DIM, 1, 0, 1)]).toBeCloseTo(c / s, 12);
      expect(gamma[christoffelIndex(DIM, 1, 1, 0)]).toBeCloseTo(c / s, 12);
    }
  });

  it('é simétrico nos dois índices de baixo (conexão sem torção)', () => {
    for (const [theta, phi] of AMOSTRAS) {
      sphereChristoffel()(ponto(theta, phi), gamma);
      for (let a = 0; a < DIM; a++) {
        for (let b = 0; b < DIM; b++) {
          for (let c = 0; c < DIM; c++) {
            expect(gamma[christoffelIndex(DIM, a, b, c)]).toBe(
              gamma[christoffelIndex(DIM, a, c, b)],
            );
          }
        }
      }
    }
  });

  it('zera os componentes que a fórmula fechada não preenche', () => {
    sphereChristoffel()(ponto(1.2, 0.3), gamma);
    expect(gamma[christoffelIndex(DIM, 0, 0, 0)]).toBe(0);
    expect(gamma[christoffelIndex(DIM, 0, 0, 1)]).toBe(0);
    expect(gamma[christoffelIndex(DIM, 1, 1, 1)]).toBe(0);
  });

  it('independe do raio', () => {
    const a = new Float64Array(DIM * DIM * DIM);
    const b = new Float64Array(DIM * DIM * DIM);
    sphereChristoffel()(ponto(1.2, 0.3), a);
    sphereChristoffel()(ponto(1.2, 0.3), b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('mergulho em ℝ³ e a base tangente', () => {
  const R = 2.3;

  it('coloca o ponto na esfera de raio R', () => {
    const p = new Float64Array(3);
    for (const [theta, phi] of AMOSTRAS) {
      sphereEmbed(R, ponto(theta, phi), p);
      expect(Math.hypot(p[0]!, p[1]!, p[2]!)).toBeCloseTo(R, 12);
    }
  });

  it('a base empurrada para ℝ³ reproduz a métrica — |e_i · e_j| = g_ij', () => {
    // Este é o teste que amarra o desenho à geometria: se o render usa e_θ e e_φ
    // para posicionar o vetor em ℝ³, então o comprimento que o aluno vê na tela
    // é o comprimento métrico. Se este teste quebrar, a cena mente.
    const e = new Float64Array(6);
    const g = new Float64Array(DIM * DIM);
    for (const [theta, phi] of AMOSTRAS) {
      const x = ponto(theta, phi);
      sphereBasis(R, x, e);
      sphereMetric(R)(x, g);
      expect(dot(e, e, 0, 0)).toBeCloseTo(g[0]!, 12);
      expect(dot(e, e, 3, 3)).toBeCloseTo(g[3]!, 12);
      expect(dot(e, e, 0, 3)).toBeCloseTo(g[1]!, 12);
    }
  });

  it('a normal é unitária e ortogonal ao plano tangente', () => {
    const n = new Float64Array(3);
    const e = new Float64Array(6);
    for (const [theta, phi] of AMOSTRAS) {
      const x = ponto(theta, phi);
      sphereNormal(x, n);
      sphereBasis(R, x, e);
      expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 12);
      expect(dot(n, e, 0, 0)).toBeCloseTo(0, 12);
      expect(dot(n, e, 0, 3)).toBeCloseTo(0, 12);
    }
  });

  it('sphereChartOf inverte sphereEmbed', () => {
    const p = new Float64Array(3);
    const volta = new Float64Array(DIM);
    for (const [theta, phi] of AMOSTRAS) {
      sphereEmbed(R, ponto(theta, phi), p);
      sphereChartOf(Array.from(p), volta);
      expect(volta[0]).toBeCloseTo(theta, 10);
      // φ volta em (-π, π]; comparar pelo ponto no círculo evita o salto de ramo.
      expect(Math.cos(volta[1]!)).toBeCloseTo(Math.cos(phi), 10);
      expect(Math.sin(volta[1]!)).toBeCloseTo(Math.sin(phi), 10);
    }
  });
});

describe('curvatura', () => {
  it('é constante 1/R² — o padrão-ouro que a Etapa 2 vai ter de reproduzir', () => {
    expect(sphereCurvature(1)).toBeCloseTo(1, 12);
    expect(sphereCurvature(2)).toBeCloseTo(0.25, 12);
  });
});

describe('norma métrica de um vetor tangente', () => {
  it('difere da norma euclidiana dos componentes fora do equador', () => {
    // O compromisso #2 do projeto: a métrica não é euclidiana, e isso tem de ser
    // visível já aqui. Em θ = π/6, um passo em φ é mais curto do que parece.
    const R = 1;
    const g = new Float64Array(DIM * DIM);
    sphereMetric(R)(ponto(Math.PI / 6, 0), g);
    const v = Float64Array.from([0, 1]);
    expect(normSquared(g, v, DIM)).toBeCloseTo(Math.sin(Math.PI / 6) ** 2, 12);
    expect(normSquared(g, v, DIM)).not.toBeCloseTo(1, 3);
  });
});
