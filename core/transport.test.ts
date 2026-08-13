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
  CONE_EXAMPLE,
  CYLINDER_EXAMPLE,
  EUCLIDEAN_EXAMPLE,
  HYPERBOLIC_EXAMPLE,
  SPHERE_EXAMPLE,
  TORUS_EXAMPLE,
  type MetricExample,
} from './examples';
import { gaussianCurvature } from './curvature';
import { compileMetric } from './metric-expr';
import {
  enclosedArea,
  holonomy,
  rectangleLoop,
  sampleTransport,
  transportAlongSegment,
} from './transport';
import { christoffelIndex, normSquared } from './metric';
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

/**
 * ∫∫ K dA sobre o retângulo da carta, por soma de Riemann no ponto médio.
 *
 * O teste da esfera compara holonomia com **área** porque lá K = 1 e as duas
 * coisas coincidem. Num toro K varia dentro do próprio laço — muda de sinal, até
 * — e comparar com a área não diria nada. Gauss-Bonnet de verdade é contra a
 * integral da curvatura, e é essa a versão que este arquivo passa a checar.
 */
const integralDeK = (
  metric: ReturnType<typeof compileMetric>,
  christoffel: ReturnType<typeof christoffelFromMetric>,
  canto: Float64Array,
  oposto: Float64Array,
  n = 48,
): number => {
  const g = new Float64Array(DIM * DIM);
  const x = new Float64Array(DIM);
  const du = (oposto[0]! - canto[0]!) / n;
  const dv = (oposto[1]! - canto[1]!) / n;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x[0] = canto[0]! + (i + 0.5) * du;
      x[1] = canto[1]! + (j + 0.5) * dv;
      metric(x, g);
      const det = g[0]! * g[3]! - g[1]! * g[2]!;
      soma += gaussianCurvature(metric, christoffel, x) * Math.sqrt(Math.abs(det));
    }
  }
  return soma * du * dv;
};

const giroEm = (e: MetricExample, canto: Float64Array, oposto: Float64Array): number => {
  const { metric, christoffel } = motor(e);
  return holonomy(
    metric,
    christoffel,
    rectangleLoop(canto, oposto),
    Float64Array.from([1, 0]),
    DIM,
    60,
  ).angulo;
};

describe('curvo no espaço, plano por dentro — o vetor volta idêntico', () => {
  /*
   * O controle euclidiano abaixo é fraco: lá *todos* os Christoffel são nulos,
   * então o transporte não tem como errar. No cilindro e no cone a métrica não é
   * trivial — o cone tem Γ^r_φφ = −0,36·r e Γ^φ_rφ = 1/r, ambos não nulos —, e o
   * vetor genuinamente gira ao percorrer cada lado. O que tem de dar zero é a
   * soma ao redor do laço fechado. É o par de superfícies que separa "entortar
   * no espaço" de "ter curvatura", e o transporte é quem decide.
   */
  it('o cilindro fecha em zero', () => {
    const giro = giroEm(
      CYLINDER_EXAMPLE,
      Float64Array.from([-0.5, -0.5]),
      Float64Array.from([0.6, 0.8]),
    );
    expect(Math.abs(giro)).toBeLessThan(1e-6);
  });

  it('o cone também, com Christoffel não nulos ao longo do caminho', () => {
    const { christoffel } = motor(CONE_EXAMPLE);
    const G = new Float64Array(DIM * DIM * DIM);
    christoffel(Float64Array.from([1.2, 0.1]), G);
    // Γ^r_φφ = −0,36·r. Se fosse zero, o teste do giro não estaria testando nada.
    expect(Math.abs(G[christoffelIndex(DIM, 0, 1, 1)]!)).toBeGreaterThan(0.1);

    const giro = giroEm(CONE_EXAMPLE, Float64Array.from([0.8, -0.3]), Float64Array.from([1.6, 0.5]));
    expect(Math.abs(giro)).toBeLessThan(1e-5);
  });
});

describe('o toro — Gauss-Bonnet com K variável dentro do laço', () => {
  const { metric, christoffel } = motor(TORUS_EXAMPLE);
  // Por fora do tubo (v ≈ 0) K > 0; por dentro (v ≈ π) K < 0.
  const foraCanto = Float64Array.from([0.2, -0.35]);
  const foraOposto = Float64Array.from([0.9, 0.35]);
  const dentroCanto = Float64Array.from([0.2, 2.6]);
  const dentroOposto = Float64Array.from([0.9, 3.1]);

  it('o giro é a integral da curvatura, e não a área', () => {
    for (const [canto, oposto] of [
      [foraCanto, foraOposto],
      [dentroCanto, dentroOposto],
    ] as const) {
      const giro = giroEm(TORUS_EXAMPLE, canto, oposto);
      expect(Math.abs(giro)).toBeCloseTo(Math.abs(integralDeK(metric, christoffel, canto, oposto)), 2);
    }
  });

  it('e troca de sinal entre a parte de fora e a de dentro', () => {
    // A promessa da nota do exemplo: arraste o ponto pelo tubo e veja o sinal
    // virar. Com a mesma orientação de laço, os dois giros têm de ser opostos.
    const fora = giroEm(TORUS_EXAMPLE, foraCanto, foraOposto);
    const dentro = giroEm(TORUS_EXAMPLE, dentroCanto, dentroOposto);
    expect(Math.abs(fora)).toBeGreaterThan(0.05);
    expect(Math.abs(dentro)).toBeGreaterThan(0.05);
    expect(Math.sign(fora)).toBe(-Math.sign(dentro));
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

describe('o transporte amostrado — o que a animação consome', () => {
  const { metric, christoffel } = motor(SPHERE_EXAMPLE);
  const laco = rectangleLoop(Float64Array.from([1.0, 0.2]), Float64Array.from([1.8, 1.2]));
  const V0 = Float64Array.from([1, 0]);

  it('acaba no mesmo vetor que o transporte direto', () => {
    const amostras = sampleTransport(christoffel, laco, V0, DIM, 24);
    const direto = holonomy(metric, christoffel, laco, V0, DIM, 60).final;
    const fim = amostras.vetores[amostras.vetores.length - 1]!;
    expect(fim[0]).toBeCloseTo(direto[0]!, 3);
    expect(fim[1]).toBeCloseTo(direto[1]!, 3);
  });

  it('cada amostra tem um ponto e um vetor', () => {
    const a = sampleTransport(christoffel, laco, V0, DIM, 10);
    expect(a.pontos).toHaveLength(a.vetores.length);
    expect(a.pontos).toHaveLength(1 + 10 * (laco.length - 1));
  });

  it('|V|_g é preservado ao longo de toda a animação, não só no fim', () => {
    // Se a norma oscilasse no meio, a seta deslizando encolheria e cresceria na
    // tela, ensinando que transporte paralelo mexe no comprimento. Não mexe.
    const a = sampleTransport(christoffel, laco, V0, DIM, 20);
    const g = new Float64Array(DIM * DIM);
    metric(a.pontos[0]!, g);
    const inicial = Math.sqrt(normSquared(g, a.vetores[0]!, DIM));

    for (let i = 0; i < a.pontos.length; i++) {
      metric(a.pontos[i]!, g);
      const norma = Math.sqrt(normSquared(g, a.vetores[i]!, DIM));
      expect(norma).toBeCloseTo(inicial, 4);
    }
  });

  it('o primeiro ponto é o começo do laço e o último é o fim', () => {
    const a = sampleTransport(christoffel, laco, V0, DIM, 8);
    expect(Array.from(a.pontos[0]!)).toEqual(Array.from(laco[0]!));
    const ultimo = a.pontos[a.pontos.length - 1]!;
    expect(ultimo[0]).toBeCloseTo(laco[laco.length - 1]![0]!, 12);
    expect(ultimo[1]).toBeCloseTo(laco[laco.length - 1]![1]!, 12);
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
