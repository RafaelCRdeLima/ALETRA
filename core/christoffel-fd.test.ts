/**
 * Os testes de D8 para a Etapa 2: a diferença finita tem de reproduzir a forma
 * fechada, e a curvatura tem de sair constante onde deveria ser constante.
 *
 * O segundo é o teste forte. Christoffel errado num ponto isolado passa
 * despercebido; qualquer bug na cadeia de derivadas aparece como K variando no
 * espaço numa superfície de curvatura constante.
 */
import { describe, expect, it } from 'vitest';
import { christoffelFromMetric } from './christoffel-fd';
import { gaussianCurvature } from './curvature';
import {
  HYPERBOLIC_EXAMPLE,
  SCHWARZSCHILD_EXAMPLE,
  SPHERE_EXAMPLE,
  type MetricExample,
} from './examples';
import { compileMetric } from './metric-expr';
import { christoffelIndex } from './metric';
import { sphereChristoffel } from './sphere';

const DIM = 2;
const metricOf = (example: MetricExample) =>
  compileMetric({ chart: example.chart, components: example.components });
const christoffelOf = (example: MetricExample) =>
  christoffelFromMetric(metricOf(example), DIM);

describe('Christoffel por diferença finita vs. forma fechada', () => {
  it('reproduz os Christoffels da esfera dentro da tolerância de D8', () => {
    const fd = christoffelOf(SPHERE_EXAMPLE);
    const closed = sphereChristoffel();
    const a = new Float64Array(DIM ** 3);
    const b = new Float64Array(DIM ** 3);

    for (const theta of [0.4, 0.9, Math.PI / 2, 2.1, 2.7]) {
      for (const phi of [0, 1.3, -2.2]) {
        const x = Float64Array.from([theta, phi]);
        fd(x, a);
        closed(x, b);
        for (let i = 0; i < a.length; i++) {
          expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-5 * Math.max(1, Math.abs(b[i]!)));
        }
      }
    }
  });

  it('reproduz os Christoffels de Schwarzschild (M = 1)', () => {
    // Γ^r_rr = -M/(r²(1-2M/r)), Γ^r_φφ = -(r-2M), Γ^φ_rφ = 1/r
    const fd = christoffelOf(SCHWARZSCHILD_EXAMPLE);
    const got = new Float64Array(DIM ** 3);
    const M = 1;

    for (const r of [3, 5, 8, 11]) {
      fd(Float64Array.from([r, 0]), got);
      expect(got[christoffelIndex(DIM, 0, 0, 0)]).toBeCloseTo(-M / (r * r * (1 - (2 * M) / r)), 6);
      expect(got[christoffelIndex(DIM, 0, 1, 1)]).toBeCloseTo(-(r - 2 * M), 6);
      expect(got[christoffelIndex(DIM, 1, 0, 1)]).toBeCloseTo(1 / r, 6);
      expect(got[christoffelIndex(DIM, 1, 1, 0)]).toBeCloseTo(1 / r, 6);
    }
  });

  it('é simétrico nos índices de baixo em todos os casos padrão-ouro', () => {
    for (const example of [SPHERE_EXAMPLE, HYPERBOLIC_EXAMPLE, SCHWARZSCHILD_EXAMPLE]) {
      const fd = christoffelOf(example);
      const got = new Float64Array(DIM ** 3);
      const x = Float64Array.from([
        (example.bounds.min[0]! + example.bounds.max[0]!) / 2,
        (example.bounds.min[1]! + example.bounds.max[1]!) / 2,
      ]);
      fd(x, got);
      for (let a = 0; a < DIM; a++) {
        for (let b = 0; b < DIM; b++) {
          for (let c = 0; c < DIM; c++) {
            expect(got[christoffelIndex(DIM, a, b, c)]).toBeCloseTo(
              got[christoffelIndex(DIM, a, c, b)]!,
              10,
            );
          }
        }
      }
    }
  });
});

describe('curvatura gaussiana sobre os Christoffels de FD (o teste forte de D8)', () => {
  it('dá K = 1 constante na esfera inteira', () => {
    const metric = metricOf(SPHERE_EXAMPLE);
    const christoffel = christoffelFromMetric(metric, DIM);
    for (const theta of [0.3, 0.8, Math.PI / 2, 2.0, 2.8]) {
      for (const phi of [-2, 0, 1.7]) {
        const k = gaussianCurvature(metric, christoffel, Float64Array.from([theta, phi]));
        expect(k).toBeCloseTo(1, 4);
      }
    }
  });

  it('dá K = -1 constante no plano hiperbólico', () => {
    const metric = metricOf(HYPERBOLIC_EXAMPLE);
    const christoffel = christoffelFromMetric(metric, DIM);
    for (const x of [-1.5, 0, 1.2]) {
      for (const y of [0.3, 0.8, 1.5, 2.7]) {
        const k = gaussianCurvature(metric, christoffel, Float64Array.from([x, y]));
        expect(k).toBeCloseTo(-1, 4);
      }
    }
  });

  it('dá K = -M/r³ em Schwarzschild — não constante, mas com forma fechada', () => {
    const metric = metricOf(SCHWARZSCHILD_EXAMPLE);
    const christoffel = christoffelFromMetric(metric, DIM);
    for (const r of [2.5, 4, 7, 10]) {
      const x = Float64Array.from([r, 0]);
      const k = gaussianCurvature(metric, christoffel, x);
      const exact = SCHWARZSCHILD_EXAMPLE.closedCurvature(x);
      expect(Math.abs(k - exact)).toBeLessThan(1e-5 * Math.max(1e-3, Math.abs(exact)));
    }
  });

  it('não depende de φ na esfera — a métrica não depende, K não pode depender', () => {
    const metric = metricOf(SPHERE_EXAMPLE);
    const christoffel = christoffelFromMetric(metric, DIM);
    const at = (phi: number): number =>
      gaussianCurvature(metric, christoffel, Float64Array.from([1.1, phi]));
    expect(at(0)).toBeCloseTo(at(2.5), 8);
  });
});

describe('regressão da Etapa 1', () => {
  it('a esfera por FD e a esfera por fórmula fechada concordam onde a cena desenha', () => {
    // Se este teste afrouxar, a Etapa 2 perdeu fidelidade visual em relação à
    // Etapa 1, e o conserto é o motor — não a tolerância.
    const fd = christoffelOf(SPHERE_EXAMPLE);
    const closed = sphereChristoffel();
    const a = new Float64Array(DIM ** 3);
    const b = new Float64Array(DIM ** 3);
    const x = Float64Array.from(SPHERE_EXAMPLE.initialPoint);
    fd(x, a);
    closed(x, b);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, 7);
  });
});
