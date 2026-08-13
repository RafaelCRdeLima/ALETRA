/**
 * Os campos de Killing, contra geradores de simetria conhecidos.
 *
 * O teste que importa aqui não é "o zero aparece": é o par. Para cada campo que
 * tem de dar zero há um vizinho que tem de dar diferente de zero, porque uma
 * conta que devolvesse zero sempre passaria por metade destes casos sem nunca
 * ter olhado para a métrica.
 */
import { describe, expect, it } from 'vitest';
import { christoffelFromMetric } from './christoffel-fd';
import {
  CYLINDER_EXAMPLE,
  EUCLIDEAN_EXAMPLE,
  SCHWARZSCHILD_EXAMPLE,
  SPHERE_EXAMPLE,
  TORUS_EXAMPLE,
  type MetricExample,
} from './examples';
import { traceGeodesic } from './geodesic';
import {
  flowJacobian,
  killingCharge,
  killingDefect,
  lieDerivativeMetric,
  pushForward,
  worstKillingDefect,
} from './killing';
import { flow } from './flow';
import { normSquared } from './metric';
import { compileFormField, compileMetric } from './metric-expr';

const DIM = 2;

const motor = (e: MetricExample) => {
  const metric = compileMetric({ chart: e.chart, components: e.components });
  return { metric, christoffel: christoffelFromMetric(metric, DIM) };
};
const campo = (e: MetricExample, comps: readonly string[]) =>
  compileFormField(e.chart, comps);

const defeito = (e: MetricExample, comps: readonly string[], x: readonly number[]): number =>
  killingDefect(motor(e).metric, campo(e, comps), Float64Array.from(x), DIM);

describe('os geradores de rotação da esfera são de Killing', () => {
  // Em (θ, φ): ∂_φ gira em torno de z; os outros dois eixos dão campos com as
  // duas componentes não constantes, que é o que torna o teste não trivial.
  const GERADORES: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['em torno de z', ['0', '1']],
    ['em torno de x', ['-sin(phi)', '-cos(theta)/sin(theta)*cos(phi)']],
    ['em torno de y', ['cos(phi)', '-cos(theta)/sin(theta)*sin(phi)']],
  ];

  it('os três dão defeito zero, longe dos polos', () => {
    for (const [nome, comps] of GERADORES) {
      for (const x of [
        [1.0, 0.4],
        [1.6, -1.2],
        [2.1, 2.4],
      ]) {
        expect(defeito(SPHERE_EXAMPLE, comps, x), `${nome} em (${x[0]}, ${x[1]})`).toBeLessThan(
          1e-5,
        );
      }
    }
  });

  it('e ∂_θ não é — o vizinho que impede o teste acima de ser vazio', () => {
    // Defeito exato: 2·|cotg θ|.
    for (const theta of [0.6, 1.0, 2.3]) {
      expect(defeito(SPHERE_EXAMPLE, ['1', '0'], [theta, 0.7])).toBeCloseTo(
        2 * Math.abs(Math.cos(theta) / Math.sin(theta)),
        5,
      );
    }
  });

  it('mas ∂_θ tem defeito zero **no equador**, e isso não o torna de Killing', () => {
    /*
     * A distinção que o painel precisa carregar. Em θ = π/2 mexer em θ não muda
     * sen²θ em primeira ordem, então o defeito pontual zera — e ∂_θ continua não
     * sendo uma simetria da esfera. Um número zero na tela quer dizer "de
     * Killing aqui", não "campo de Killing".
     */
    expect(defeito(SPHERE_EXAMPLE, ['1', '0'], [Math.PI / 2, 0.7])).toBeLessThan(1e-6);

    const { metric } = motor(SPHERE_EXAMPLE);
    const limites = { min: [0.35, -Math.PI], max: [Math.PI - 0.35, Math.PI] };
    expect(worstKillingDefect(metric, campo(SPHERE_EXAMPLE, ['1', '0']), limites, DIM)).toBeGreaterThan(1);
    expect(worstKillingDefect(metric, campo(SPHERE_EXAMPLE, ['0', '1']), limites, DIM)).toBeLessThan(1e-5);
  });
});

describe('a varredura da carta pula onde a carta acabou', () => {
  it('os polos da esfera não contaminam o pior defeito', () => {
    /*
     * Os limites da esfera incluem θ = 0 e θ = π de propósito (é ali que D7 tem
     * o que dizer), e lá g_φφ = 0 e a inversa explode. Sem pular esses pontos, o
     * pior defeito de ∂_θ saía 1,6·10¹⁶ na tela — um número sobre a carta ter
     * acabado, e não sobre a simetria existir. O valor honesto, medido só onde a
     * métrica serve, é da ordem de alguns.
     */
    const { metric } = motor(SPHERE_EXAMPLE);
    const pior = worstKillingDefect(
      metric,
      campo(SPHERE_EXAMPLE, ['1', '0']),
      SPHERE_EXAMPLE.bounds,
      DIM,
    );
    expect(Number.isFinite(pior)).toBe(true);
    expect(pior).toBeGreaterThan(1);
    expect(pior).toBeLessThan(100);
  });

  it('e ∂_φ continua dando zero na carta inteira, polos incluídos', () => {
    const { metric } = motor(SPHERE_EXAMPLE);
    expect(
      worstKillingDefect(metric, campo(SPHERE_EXAMPLE, ['0', '1']), SPHERE_EXAMPLE.bounds, DIM),
    ).toBeLessThan(1e-5);
  });
});

describe('o plano euclidiano, onde as simetrias são as que todo mundo conhece', () => {
  const em = (comps: readonly string[]) => defeito(EUCLIDEAN_EXAMPLE, comps, [0.8, -0.5]);

  it('translações e rotação: de Killing', () => {
    expect(em(['1', '0'])).toBeLessThan(1e-6);
    expect(em(['0', '1'])).toBeLessThan(1e-6);
    expect(em(['-y', 'x'])).toBeLessThan(1e-6);
  });

  it('a dilatação não é, e o defeito dela tem valor fechado', () => {
    // ξ = (x, y) ⟹ ℒ_ξ g = 2δ, e ‖2δ‖ = 2√2 num plano.
    expect(em(['x', 'y'])).toBeCloseTo(2 * Math.SQRT2, 6);
  });
});

describe('as simetrias das outras superfícies do catálogo', () => {
  it('Schwarzschild: ∂_φ é de Killing, ∂_r não', () => {
    expect(defeito(SCHWARZSCHILD_EXAMPLE, ['0', '1'], [6, 0.3])).toBeLessThan(1e-6);
    expect(defeito(SCHWARZSCHILD_EXAMPLE, ['1', '0'], [6, 0.3])).toBeGreaterThan(0.1);
  });

  it('cilindro: as duas direções coordenadas, porque g é constante', () => {
    expect(defeito(CYLINDER_EXAMPLE, ['1', '0'], [0.6, 0.2])).toBeLessThan(1e-6);
    expect(defeito(CYLINDER_EXAMPLE, ['0', '1'], [0.6, 0.2])).toBeLessThan(1e-6);
  });

  it('toro: dar a volta no buraco é simetria, atravessar o tubo não', () => {
    expect(defeito(TORUS_EXAMPLE, ['1', '0'], [0.6, 0.5])).toBeLessThan(1e-6);
    expect(defeito(TORUS_EXAMPLE, ['0', '1'], [0.6, 0.5])).toBeGreaterThan(0.1);
  });
});

describe('a Lie derivada da métrica, componente a componente', () => {
  it('bate com a forma fechada em ∂_θ na esfera', () => {
    // ℒ_{∂_θ} g = ∂_θ diag(1, sen²θ) = diag(0, sen 2θ).
    const { metric } = motor(SPHERE_EXAMPLE);
    const L = new Float64Array(DIM * DIM);
    for (const theta of [0.7, 1.9]) {
      lieDerivativeMetric(metric, campo(SPHERE_EXAMPLE, ['1', '0']), Float64Array.from([theta, 0.4]), DIM, L);
      expect(L[0]).toBeCloseTo(0, 6);
      expect(L[1]).toBeCloseTo(0, 6);
      expect(L[2]).toBeCloseTo(0, 6);
      expect(L[3]).toBeCloseTo(Math.sin(2 * theta), 5);
    }
  });
});

describe('o fluxo de um campo de Killing preserva comprimento', () => {
  /*
   * A versão **finita** da condição, e é ela que o painel desenha: leve o ponto
   * e o vetor pelo fluxo e compare os comprimentos nas duas pontas. ℒ_ξ g = 0 é
   * a taxa; isto é o resultado depois de andar.
   */
  const PASSOS = 60;

  const comprimentos = (
    e: MetricExample,
    comps: readonly string[],
    x0: number[],
    v0: number[],
    t: number,
  ): { antes: number; depois: number } => {
    const { metric } = motor(e);
    const xi = campo(e, comps);
    const p = Float64Array.from(x0);
    const v = Float64Array.from(v0);
    const g = new Float64Array(DIM * DIM);

    metric(p, g);
    const antes = Math.sqrt(normSquared(g, v, DIM));

    const J = new Float64Array(DIM * DIM);
    flowJacobian(xi, p, t, PASSOS, DIM, J);
    const empurrado = new Float64Array(DIM);
    pushForward(J, v, DIM, empurrado);

    metric(flow(xi, p, t, PASSOS, DIM), g);
    return { antes, depois: Math.sqrt(normSquared(g, empurrado, DIM)) };
  };

  it('na esfera, ao longo de ∂_φ, o comprimento sobrevive à viagem', () => {
    const r = comprimentos(SPHERE_EXAMPLE, ['0', '1'], [1.15, 0.55], [0.28, 0.5], 1.4);
    expect(r.antes).toBeGreaterThan(0.1);
    expect(r.depois).toBeCloseTo(r.antes, 4);
  });

  it('e ao longo de ∂_θ, não', () => {
    const r = comprimentos(SPHERE_EXAMPLE, ['1', '0'], [1.15, 0.55], [0.28, 0.5], 0.6);
    expect(Math.abs(r.depois - r.antes)).toBeGreaterThan(0.02);
  });
});

describe('a carga conservada — onde a geometria vira física', () => {
  const cargaAoLongoDaGeodesica = (
    e: MetricExample,
    comps: readonly string[],
    x0: number[],
    v0: number[],
  ): number[] => {
    const { metric, christoffel } = motor(e);
    const xi = campo(e, comps);
    const geo = traceGeodesic(metric, christoffel, Float64Array.from(x0), Float64Array.from(v0), DIM, {
      passos: 400,
      dLambda: 0.01,
      limites: e.bounds,
    });
    return geo.caminho.map((p, i) => killingCharge(metric, xi, p, geo.velocidades[i]!, DIM));
  };

  const variacao = (v: number[]): number => Math.max(...v) - Math.min(...v);

  it('na esfera, ⟨∂_φ, u⟩ é constante ao longo da geodésica — a relação de Clairaut', () => {
    const cargas = cargaAoLongoDaGeodesica(SPHERE_EXAMPLE, ['0', '1'], [1.15, 0.55], [0.28, 0.5]);
    expect(cargas.length).toBeGreaterThan(100);
    expect(Math.abs(cargas[0]!)).toBeGreaterThan(0.1); // não é constante por ser zero
    expect(variacao(cargas)).toBeLessThan(1e-4);
  });

  it('e com um campo que não é de Killing ela varia — senão o teste acima não diria nada', () => {
    const cargas = cargaAoLongoDaGeodesica(SPHERE_EXAMPLE, ['1', '0'], [1.15, 0.55], [0.28, 0.5]);
    expect(variacao(cargas)).toBeGreaterThan(0.05);
  });

  it('em Schwarzschild, ⟨∂_φ, u⟩ é o momento angular L = r²·dφ/dλ', () => {
    const { metric } = motor(SCHWARZSCHILD_EXAMPLE);
    const xi = campo(SCHWARZSCHILD_EXAMPLE, ['0', '1']);
    const x = Float64Array.from([6, 0.3]);
    const u = Float64Array.from([1.1, 0.25]);
    // g_φφ u^φ = r² u^φ = 36 · 0,25.
    expect(killingCharge(metric, xi, x, u, DIM)).toBeCloseTo(36 * 0.25, 9);

    const cargas = cargaAoLongoDaGeodesica(SCHWARZSCHILD_EXAMPLE, ['0', '1'], [6, 0.3], [1.1, 0.25]);
    expect(variacao(cargas)).toBeLessThan(1e-3);
  });
});
