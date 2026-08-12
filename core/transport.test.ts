/**
 * O teste que D8 chamou de sinérgico: a holonomia num laço da esfera é a área
 * que ele cerca (Gauss-Bonnet com K=1). Se a cena mostra o número certo, o
 * integrador está correto; se o integrador está correto, a cena ensina a coisa
 * certa. É o mesmo enunciado nos dois papéis.
 *
 * O caso euclidiano é o controle: curvatura zero, holonomia zero, o vetor volta
 * idêntico. Sem ele, um transporte que simplesmente não fizesse nada passaria
 * pelo teste da esfera... e é para isso que existe também o hiperbólico, onde a
 * holonomia tem de vir com o **sinal trocado**.
 */
import { describe, expect, it } from 'vitest';
import { christoffelFromMetric } from './christoffel-fd';
import {
  EUCLIDEAN_EXAMPLE,
  HYPERBOLIC_EXAMPLE,
  SPHERE_EXAMPLE,
  type MetricExample,
} from './examples';
import { compileMetric } from './metric-expr';
import { enclosedArea, holonomy, rectangleLoop, transportAlongSegment } from './transport';
import { normSquared } from './metric';
import { sphereChristoffel } from './sphere';

const DIM = 2;
const motor = (e: MetricExample) => {
  const metric = compileMetric({ chart: e.chart, components: e.components });
  return { metric, christoffel: christoffelFromMetric(metric, DIM) };
};

describe('Gauss-Bonnet na esfera — holonomia = área cercada', () => {
  const { metric, christoffel } = motor(SPHERE_EXAMPLE);

  const casos: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.8, 0.0, 1.5, 0.7],
    [1.0, -0.3, 2.0, 0.6],
    [0.5, 0.2, 0.9, 0.5],
    [1.2, 1.0, 2.2, 2.0],
  ];

  it('bate com a área em quatro laços diferentes', () => {
    for (const [t0, f0, t1, f1] of casos) {
      const canto = Float64Array.from([t0, f0]);
      const oposto = Float64Array.from([t1, f1]);
      const h = holonomy(
        metric,
        christoffel,
        rectangleLoop(canto, oposto),
        Float64Array.from([1, 0]),
        DIM,
        60,
      );
      const area = enclosedArea(metric, canto, oposto, DIM);
      // Área fechada do retângulo esférico: (cos θ₀ - cos θ₁)(φ₁ - φ₀).
      const exata = (Math.cos(t0) - Math.cos(t1)) * (f1 - f0);
      expect(area).toBeCloseTo(exata, 3);
      expect(Math.abs(h.angulo)).toBeCloseTo(area, 2);
    }
  });

  it('a Christoffel fechada dá a mesma holonomia que a de diferença finita', () => {
    const canto = Float64Array.from([1.0, 0]);
    const oposto = Float64Array.from([1.8, 0.6]);
    const laco = rectangleLoop(canto, oposto);
    const V = Float64Array.from([1, 0]);

    const porFD = holonomy(metric, christoffel, laco, V, DIM, 60).angulo;
    const porFechada = holonomy(metric, sphereChristoffel(), laco, V, DIM, 60).angulo;
    expect(porFD).toBeCloseTo(porFechada, 5);
  });
});

describe('o controle euclidiano — curvatura zero, holonomia zero', () => {
  it('o vetor volta idêntico', () => {
    const { metric, christoffel } = motor(EUCLIDEAN_EXAMPLE);
    const h = holonomy(
      metric,
      christoffel,
      rectangleLoop(Float64Array.from([-1, -0.5]), Float64Array.from([1.5, 1.2])),
      Float64Array.from([0.8, -0.4]),
      DIM,
      40,
    );
    expect(Math.abs(h.angulo)).toBeLessThan(1e-6);
    expect(h.final[0]).toBeCloseTo(0.8, 8);
    expect(h.final[1]).toBeCloseTo(-0.4, 8);
  });
});

describe('o hiperbólico — mesma conta, sinal trocado', () => {
  it('holonomia negativa, e do tamanho da área', () => {
    const { metric, christoffel } = motor(HYPERBOLIC_EXAMPLE);
    const canto = Float64Array.from([-0.4, 0.7]);
    const oposto = Float64Array.from([0.5, 1.6]);
    const h = holonomy(
      metric,
      christoffel,
      rectangleLoop(canto, oposto),
      Float64Array.from([1, 0]),
      DIM,
      60,
    );
    const area = enclosedArea(metric, canto, oposto, DIM);
    // K = -1 ⟹ holonomia = **-área**. O sinal é o conteúdo desta etapa: a
    // esfera e o hiperbólico giram o vetor para lados opostos, e é só por isso
    // que "o ângulo mede a curvatura" tem informação além do módulo.
    expect(h.angulo).toBeCloseTo(-area, 2);
    const naEsfera = holonomy(
      motor(SPHERE_EXAMPLE).metric,
      motor(SPHERE_EXAMPLE).christoffel,
      rectangleLoop(Float64Array.from([1.0, 0]), Float64Array.from([1.6, 0.6])),
      Float64Array.from([1, 0]),
      DIM,
      60,
    ).angulo;
    expect(Math.sign(h.angulo)).toBe(-Math.sign(naEsfera));
  });
});

describe('invariantes do transporte', () => {
  it('preserva |V|_g — transportar não estica nem encolhe', () => {
    for (const exemplo of [SPHERE_EXAMPLE, HYPERBOLIC_EXAMPLE, EUCLIDEAN_EXAMPLE]) {
      const { metric, christoffel } = motor(exemplo);
      const canto = Float64Array.from(exemplo.initialPoint);
      const oposto = Float64Array.from([canto[0]! + 0.4, canto[1]! + 0.5]);
      const h = holonomy(
        metric,
        christoffel,
        rectangleLoop(canto, oposto),
        Float64Array.from(exemplo.initialVector),
        DIM,
        50,
      );
      expect(h.normaFinal).toBeCloseTo(h.normaInicial, 6);
    }
  });

  it('percorrer o laço ao contrário desfaz o giro', () => {
    const { metric, christoffel } = motor(SPHERE_EXAMPLE);
    const laco = rectangleLoop(Float64Array.from([1.0, 0]), Float64Array.from([1.7, 0.5]));
    const V = Float64Array.from([1, 0]);

    const ida = holonomy(metric, christoffel, laco, V, DIM, 60).angulo;
    const volta = holonomy(metric, christoffel, [...laco].reverse(), V, DIM, 60).angulo;
    expect(ida).toBeCloseTo(-volta, 4);
  });

  it('um laço degenerado não gira nada', () => {
    const { metric, christoffel } = motor(SPHERE_EXAMPLE);
    const p = Float64Array.from([1.1, 0.3]);
    const h = holonomy(metric, christoffel, rectangleLoop(p, p), Float64Array.from([1, 0]), DIM);
    expect(Math.abs(h.angulo)).toBeLessThan(1e-9);
  });

  it('transportar por um trecho e voltar por ele devolve o vetor', () => {
    const { christoffel } = motor(SPHERE_EXAMPLE);
    const a = Float64Array.from([1.0, 0.2]);
    const b = Float64Array.from([1.6, 0.9]);
    const V = Float64Array.from([0.3, 0.7]);
    const ida = transportAlongSegment(christoffel, a, b, V, DIM, 40);
    const volta = transportAlongSegment(christoffel, b, a, ida, DIM, 40);
    expect(volta[0]).toBeCloseTo(V[0]!, 7);
    expect(volta[1]).toBeCloseTo(V[1]!, 7);
  });
});

describe('a área cercada', () => {
  it('no plano euclidiano é largura × altura', () => {
    const { metric } = motor(EUCLIDEAN_EXAMPLE);
    const area = enclosedArea(
      metric,
      Float64Array.from([-1, -0.5]),
      Float64Array.from([1.5, 1.2]),
      DIM,
    );
    expect(area).toBeCloseTo(2.5 * 1.7, 6);
  });

  it('e a norma métrica confere com a definição', () => {
    const { metric } = motor(SPHERE_EXAMPLE);
    const g = new Float64Array(DIM * DIM);
    metric(Float64Array.from([Math.PI / 2, 0]), g);
    expect(normSquared(g, Float64Array.from([1, 1]), DIM)).toBeCloseTo(2, 9);
  });
});
