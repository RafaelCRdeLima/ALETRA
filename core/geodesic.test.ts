/**
 * Os dois últimos testes de D8, que estavam em aberto desde a Etapa 1:
 * geodésica numérica contra a analítica nos casos padrão-ouro, e conservação de
 * |v|_g ao longo do caminho.
 *
 * O teste de grande círculo não compara ponto a ponto com uma fórmula: compara
 * contra a **propriedade que define** um grande círculo — o caminho mergulhado
 * fica num plano pelo centro da esfera. É mais forte que casar coordenadas,
 * porque não depende de parametrização.
 */
import { describe, expect, it } from 'vitest';
import { christoffelFromMetric } from './christoffel-fd';
import {
  EUCLIDEAN_EXAMPLE,
  HYPERBOLIC_EXAMPLE,
  SCHWARZSCHILD_EXAMPLE,
  SPHERE_EXAMPLE,
  type MetricExample,
} from './examples';
import { geodesicDeviation, traceGeodesic } from './geodesic';
import { compileMetric } from './metric-expr';
import { sphereEmbed } from './sphere';

const DIM = 2;
const motor = (e: MetricExample) => {
  const metric = compileMetric({ chart: e.chart, components: e.components });
  return { metric, christoffel: christoffelFromMetric(metric, DIM) };
};

describe('esfera: geodésicas são grandes círculos', () => {
  const { metric, christoffel } = motor(SPHERE_EXAMPLE);

  it('o caminho mergulhado fica num plano pelo centro', () => {
    for (const [t0, f0, vt, vf] of [
      [1.2, 0.3, 0.8, 0.6],
      [0.9, -0.5, -0.4, 1.1],
      [1.9, 1.0, 0.5, -0.7],
    ] as const) {
      const g = traceGeodesic(
        metric,
        christoffel,
        Float64Array.from([t0, f0]),
        Float64Array.from([vt, vf]),
        DIM,
        { passos: 200, dLambda: 0.01 },
      );

      // Normal do plano: P × dP/dλ, dos dois primeiros pontos do caminho.
      const p0 = new Float64Array(3);
      const p1 = new Float64Array(3);
      sphereEmbed(1, g.caminho[0]!, p0);
      sphereEmbed(1, g.caminho[1]!, p1);
      const n = [
        p0[1]! * p1[2]! - p0[2]! * p1[1]!,
        p0[2]! * p1[0]! - p0[0]! * p1[2]!,
        p0[0]! * p1[1]! - p0[1]! * p1[0]!,
      ];
      const norma = Math.hypot(n[0]!, n[1]!, n[2]!);

      const p = new Float64Array(3);
      for (const x of g.caminho) {
        sphereEmbed(1, x, p);
        const fora = Math.abs(n[0]! * p[0]! + n[1]! * p[1]! + n[2]! * p[2]!) / norma;
        expect(fora).toBeLessThan(1e-6);
      }
    }
  });

  it('o equador é geodésica: θ não se mexe', () => {
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([Math.PI / 2, 0]),
      Float64Array.from([0, 1]),
      DIM,
      { passos: 150, dLambda: 0.01 },
    );
    for (const x of g.caminho) expect(x[0]).toBeCloseTo(Math.PI / 2, 9);
  });

  it('um meridiano é geodésica: φ não se mexe', () => {
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([1.0, 0.7]),
      Float64Array.from([1, 0]),
      DIM,
      { passos: 100, dLambda: 0.01 },
    );
    for (const x of g.caminho) expect(x[1]).toBeCloseTo(0.7, 9);
  });

  it('o comprimento de arco confere com o ângulo central percorrido', () => {
    // Na esfera unitária, comprimento de arco = ângulo entre os pontos.
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([Math.PI / 2, 0]),
      Float64Array.from([0, 1]),
      DIM,
      { passos: 100, dLambda: 0.01 },
    );
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    sphereEmbed(1, g.caminho[0]!, a);
    sphereEmbed(1, g.caminho[g.caminho.length - 1]!, b);
    const angulo = Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));
    expect(g.comprimento).toBeCloseTo(angulo, 6);
  });
});

describe('hiperbólico: geodésicas são semicírculos e verticais', () => {
  const { metric, christoffel } = motor(HYPERBOLIC_EXAMPLE);

  it('a reta vertical é geodésica', () => {
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([0.4, 1]),
      Float64Array.from([0, 1]),
      DIM,
      { passos: 120, dLambda: 0.005 },
    );
    for (const x of g.caminho) expect(x[0]).toBeCloseTo(0.4, 9);
  });

  it('um lançamento oblíquo fica num semicírculo centrado em y=0', () => {
    const [x0, y0, vx, vy] = [0.2, 1.1, 0.9, 0.4];
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([x0, y0]),
      Float64Array.from([vx, vy]),
      DIM,
      { passos: 150, dLambda: 0.005 },
    );
    // (x-a)² + y² = R², com a vindo de (x-a)·vx + y·vy = 0.
    const a = x0 + (y0 * vy) / vx;
    const R2 = (x0 - a) ** 2 + y0 ** 2;
    for (const p of g.caminho) {
      expect((p[0]! - a) ** 2 + p[1]! ** 2).toBeCloseTo(R2, 6);
    }
  });
});

describe('euclidiano: geodésicas são retas', () => {
  it('o caminho não sai da reta inicial', () => {
    const { metric, christoffel } = motor(EUCLIDEAN_EXAMPLE);
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([-1, -0.5]),
      Float64Array.from([0.8, 0.6]),
      DIM,
      { passos: 100, dLambda: 0.02 },
    );
    for (const p of g.caminho) {
      // Colinearidade com a direção inicial.
      expect((p[0]! + 1) * 0.6 - (p[1]! + 0.5) * 0.8).toBeCloseTo(0, 10);
    }
  });
});

describe('conservação de |v|_g — o outro teste em aberto de D8', () => {
  it('vale em todos os casos padrão-ouro', () => {
    for (const exemplo of [
      SPHERE_EXAMPLE,
      EUCLIDEAN_EXAMPLE,
      HYPERBOLIC_EXAMPLE,
      SCHWARZSCHILD_EXAMPLE,
    ]) {
      const { metric, christoffel } = motor(exemplo);
      const g = traceGeodesic(
        metric,
        christoffel,
        Float64Array.from(exemplo.initialPoint),
        Float64Array.from(exemplo.initialVector),
        DIM,
        { passos: 200, dLambda: 0.005, limites: exemplo.bounds },
      );
      expect(g.desvioDeNorma, `|v|_g em ${exemplo.label}`).toBeLessThan(1e-6);
    }
  });
});

describe('parar é conteúdo (D7)', () => {
  const { metric, christoffel } = motor(SCHWARZSCHILD_EXAMPLE);

  it('uma geodésica dirigida ao horizonte para, e diz por quê', () => {
    const g = traceGeodesic(
      metric,
      christoffel,
      Float64Array.from([4, 0]),
      Float64Array.from([-1, 0]),
      DIM,
      { passos: 4000, dLambda: 0.01, limites: SCHWARZSCHILD_EXAMPLE.bounds },
    );
    expect(g.motivo).toBe('metrica-degenerada');
    // Parou perto do horizonte, não em qualquer lugar.
    const fim = g.caminho[g.caminho.length - 1]!;
    expect(fim[0]).toBeGreaterThan(2);
    expect(fim[0]).toBeLessThan(2.2);
  });

  it('sair da carta é outro motivo, e não se confunde com degenerar', () => {
    const { metric: m, christoffel: c } = motor(EUCLIDEAN_EXAMPLE);
    const g = traceGeodesic(m, c, Float64Array.from([0, 0]), Float64Array.from([1, 0]), DIM, {
      passos: 1000,
      dLambda: 0.02,
      limites: EUCLIDEAN_EXAMPLE.bounds,
    });
    expect(g.motivo).toBe('fora-da-carta');
  });

  it('sem limites e em superfície boa, a geodésica completa os passos', () => {
    const { metric: m, christoffel: c } = motor(SPHERE_EXAMPLE);
    const g = traceGeodesic(m, c, Float64Array.from([1.2, 0]), Float64Array.from([0, 1]), DIM, {
      passos: 50,
      dLambda: 0.01,
    });
    expect(g.motivo).toBe('completa');
    expect(g.caminho).toHaveLength(51);
  });
});

describe('desvio geodésico — a curvatura como efeito sobre trajetórias', () => {
  it('geodésicas vizinhas se aproximam na esfera e se afastam no hiperbólico', () => {
    const separacaoFinal = (exemplo: MetricExample, offset: number[]): number[] => {
      const { metric, christoffel } = motor(exemplo);
      const d = geodesicDeviation(
        metric,
        christoffel,
        Float64Array.from(exemplo.initialPoint),
        Float64Array.from(exemplo.initialVector),
        Float64Array.from(offset),
        DIM,
        { passos: 200, dLambda: 0.008, limites: exemplo.bounds },
      );
      return d.separacoes;
    };

    // Na esfera (K>0) as vizinhas convergem; no hiperbólico (K<0) divergem.
    const esfera = separacaoFinal(SPHERE_EXAMPLE, [0.02, 0]);
    const hiper = separacaoFinal(HYPERBOLIC_EXAMPLE, [0.02, 0]);

    expect(esfera[esfera.length - 1]!).toBeLessThan(esfera[0]!);
    expect(hiper[hiper.length - 1]!).toBeGreaterThan(hiper[0]!);
  });

  it('no plano euclidiano a separação não muda', () => {
    const { metric, christoffel } = motor(EUCLIDEAN_EXAMPLE);
    const d = geodesicDeviation(
      metric,
      christoffel,
      Float64Array.from([-1, -1]),
      Float64Array.from([0.7, 0.5]),
      Float64Array.from([0.05, 0]),
      DIM,
      { passos: 100, dLambda: 0.02 },
    );
    expect(d.separacoes[d.separacoes.length - 1]).toBeCloseTo(d.separacoes[0]!, 9);
  });
});
