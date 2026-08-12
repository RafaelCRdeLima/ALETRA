/**
 * ♯ e ♭ contra os casos padrão-ouro (D8) — incluindo o euclidiano, onde os dois
 * têm de ser a identidade numérica exata. Esse caso não é um detalhe: é a tese
 * da Etapa 3. Se ♭ mexesse em alguma coisa com g = δ, a afirmação "a distinção
 * só existe porque a métrica não é euclidiana" seria falsa.
 */
import { describe, expect, it } from 'vitest';
import {
  EUCLIDEAN_EXAMPLE,
  HYPERBOLIC_EXAMPLE,
  SCHWARZSCHILD_EXAMPLE,
  SPHERE_EXAMPLE,
  type MetricExample,
} from './examples';
import { evaluate } from './forms';
import { invert } from './linalg';
import { compileMetric } from './metric-expr';
import { normSquared } from './metric';
import { flat, flatForm, sharp, sharpVector } from './musical';

const DIM = 2;
const metricOf = (e: MetricExample) => compileMetric({ chart: e.chart, components: e.components });
const TODOS = [SPHERE_EXAMPLE, EUCLIDEAN_EXAMPLE, HYPERBOLIC_EXAMPLE, SCHWARZSCHILD_EXAMPLE];

describe('o caso euclidiano — a tese da Etapa 3', () => {
  const metric = metricOf(EUCLIDEAN_EXAMPLE);
  const g = new Float64Array(DIM * DIM);
  metric(Float64Array.from([0.7, -1.3]), g);

  it('♭ é a identidade numérica', () => {
    const v = Float64Array.from([1.7, -0.4]);
    const out = flat(g, v, DIM, new Float64Array(DIM));
    expect(out[0]).toBe(v[0]);
    expect(out[1]).toBe(v[1]);
  });

  it('♯ é a identidade numérica', () => {
    const gInv = new Float64Array(DIM * DIM);
    invert(g, DIM, gInv);
    const omega = Float64Array.from([-2.2, 0.9]);
    const out = sharp(gInv, omega, DIM, new Float64Array(DIM));
    expect(out[0]).toBeCloseTo(omega[0]!, 14);
    expect(out[1]).toBeCloseTo(omega[1]!, 14);
  });
});

describe('a esfera — onde ♭ deixa de ser inócuo', () => {
  it('v♭ = (v^θ, sin²θ · v^φ), que é o fator que o euclidiano não tem', () => {
    const metric = metricOf(SPHERE_EXAMPLE);
    const g = new Float64Array(DIM * DIM);
    for (const theta of [0.4, 1.15, 2.3]) {
      metric(Float64Array.from([theta, 0.6]), g);
      const v = Float64Array.from([0.3, 0.8]);
      const out = flat(g, v, DIM, new Float64Array(DIM));
      expect(out[0]).toBeCloseTo(0.3, 14);
      expect(out[1]).toBeCloseTo(Math.sin(theta) ** 2 * 0.8, 14);
    }
  });

  it('e os componentes de v♭ diferem visivelmente dos de v', () => {
    const metric = metricOf(SPHERE_EXAMPLE);
    const g = new Float64Array(DIM * DIM);
    metric(Float64Array.from([Math.PI / 6, 0]), g);
    const v = Float64Array.from([0.3, 0.8]);
    const out = flat(g, v, DIM, new Float64Array(DIM));
    expect(Math.abs(out[1]! - v[1]!)).toBeGreaterThan(0.5);
  });
});

describe('invariantes em todos os casos padrão-ouro', () => {
  it('♯ desfaz ♭', () => {
    for (const example of TODOS) {
      const metric = metricOf(example);
      const x = Float64Array.from(example.initialPoint);
      const v = Float64Array.from(example.initialVector);

      const g = new Float64Array(DIM * DIM);
      metric(x, g);
      const baixo = flat(g, v, DIM, new Float64Array(DIM));
      const volta = sharpVector(metric, x, baixo, DIM, new Float64Array(DIM));

      for (let i = 0; i < DIM; i++) {
        expect(volta[i]).toBeCloseTo(v[i]!, 10);
      }
    }
  });

  it('v♭(v) = |v|²_g — a contração de v com o próprio ♭ é a norma ao quadrado', () => {
    for (const example of TODOS) {
      const metric = metricOf(example);
      const x = Float64Array.from(example.initialPoint);
      const v = Float64Array.from(example.initialVector);

      const g = new Float64Array(DIM * DIM);
      metric(x, g);
      const vBemol = flatForm(metric, x, v, DIM);

      expect(evaluate(vBemol, [v])).toBeCloseTo(normSquared(g, v, DIM), 10);
    }
  });

  it('♭ é linear', () => {
    const metric = metricOf(SPHERE_EXAMPLE);
    const g = new Float64Array(DIM * DIM);
    metric(Float64Array.from([1.0, 0.2]), g);

    const a = Float64Array.from([0.4, -0.9]);
    const b = Float64Array.from([1.1, 0.25]);
    const soma = Float64Array.from([a[0]! + b[0]!, a[1]! + b[1]!]);

    const fa = flat(g, a, DIM, new Float64Array(DIM));
    const fb = flat(g, b, DIM, new Float64Array(DIM));
    const fs = flat(g, soma, DIM, new Float64Array(DIM));

    for (let i = 0; i < DIM; i++) expect(fs[i]).toBeCloseTo(fa[i]! + fb[i]!, 12);
  });

  it('v♭ entra pela mesma porta que ω — é uma 1-form de verdade', () => {
    const metric = metricOf(HYPERBOLIC_EXAMPLE);
    const x = Float64Array.from([0, 1.4]);
    const v = Float64Array.from([0.5, -0.2]);
    const vBemol = flatForm(metric, x, v, DIM);

    expect(vBemol.degree).toBe(1);
    expect(vBemol.dim).toBe(DIM);
    // g = δ/y² em y = 1,4  ⟹  v♭ = v / 1,96
    expect(vBemol.components[0]).toBeCloseTo(0.5 / 1.96, 12);
    expect(vBemol.components[1]).toBeCloseTo(-0.2 / 1.96, 12);
  });
});

describe('curvatura zero no plano euclidiano', () => {
  it('o exemplo declara K = 0', () => {
    expect(EUCLIDEAN_EXAMPLE.closedCurvature(Float64Array.from([0, 0]))).toBe(0);
  });
});
