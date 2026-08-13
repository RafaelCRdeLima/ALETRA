/**
 * O teste que amarra as duas descrições de cada superfície.
 *
 * A métrica é digitada e o mergulho é código; as duas dizem a mesma coisa, e se
 * discordarem o painel de carta e o painel de ℝ³ mostram geometrias diferentes
 * — em silêncio, cada um internamente coerente. É o pior modo de falha possível
 * para este produto, e o único jeito de fechá-lo é comparar as duas.
 */
import { describe, expect, it } from 'vitest';
import { christoffelFromMetric } from './christoffel-fd';
import { gaussianCurvature } from './curvature';
import {
  embeddingBasis,
  embeddingById,
  embeddingNormal,
  inducedMetric,
  insideDomain,
} from './embedding';
import { EXAMPLES, SCHWARZSCHILD_EXAMPLE, type MetricExample } from './examples';
import { compileMetric } from './metric-expr';

const DIM = 2;

/**
 * Pontos internos da carta, longe das bordas onde a carta degenera — e dentro
 * do domínio do mergulho, que em Schwarzschild é menor que a carta.
 */
const amostrasDe = (e: MetricExample): Float64Array[] => {
  const embedding = embeddingById(e.embedding);
  const b = embedding?.domain?.(e.bounds) ?? e.bounds;
  const pontos: Float64Array[] = [];
  for (const a of [0.25, 0.5, 0.75]) {
    for (const c of [0.3, 0.65]) {
      pontos.push(
        Float64Array.from([
          b.min[0]! + a * (b.max[0]! - b.min[0]!),
          b.min[1]! + c * (b.max[1]! - b.min[1]!),
        ]),
      );
    }
  }
  return pontos;
};

const comMergulho = EXAMPLES.filter((e) => e.embedding !== null);

describe('a métrica digitada é a métrica induzida pelo mergulho', () => {
  it('bate componente a componente em toda superfície mergulhada', () => {
    expect(comMergulho.length).toBeGreaterThan(1);

    for (const exemplo of comMergulho) {
      const embedding = embeddingById(exemplo.embedding)!;
      const metric = compileMetric({ chart: exemplo.chart, components: exemplo.components });
      const digitada = new Float64Array(DIM * DIM);
      const induzida = new Float64Array(DIM * DIM);

      for (const x of amostrasDe(exemplo)) {
        metric(x, digitada);
        inducedMetric(embedding, x, induzida);
        for (let i = 0; i < DIM * DIM; i++) {
          const escala = Math.max(1, Math.abs(digitada[i]!));
          expect(
            Math.abs(induzida[i]! - digitada[i]!) / escala,
            `${exemplo.label}, g[${i}] em (${x[0]!.toFixed(2)}, ${x[1]!.toFixed(2)})`,
          ).toBeLessThan(1e-5);
        }
      }
    }
  });
});

describe('a volta da superfície para a carta', () => {
  it('chartOf desfaz point em toda superfície', () => {
    for (const exemplo of comMergulho) {
      const embedding = embeddingById(exemplo.embedding)!;
      const p = new Float64Array(3);
      const volta = new Float64Array(DIM);

      for (const x of amostrasDe(exemplo)) {
        embedding.point(x, p);
        embedding.chartOf(Array.from(p), volta);
        expect(volta[0], `${exemplo.label} coord 0`).toBeCloseTo(x[0]!, 8);
        // Ângulos voltam em (-π, π]; comparar pelo ponto no círculo evita o salto.
        expect(Math.cos(volta[1]!)).toBeCloseTo(Math.cos(x[1]!), 8);
        expect(Math.sin(volta[1]!)).toBeCloseTo(Math.sin(x[1]!), 8);
      }
    }
  });

  it('e cai dentro dos limites da carta — é disso que o arraste depende', () => {
    /*
     * `movePoint` recorta ao retângulo depois de chamar `chartOf`. Se a volta
     * caísse fora, o recorte grudaria o ponto na borda e o arraste travaria sem
     * dizer por quê. A fita de Möbius é a primeira superfície onde isso podia
     * dar errado de verdade: v se recupera projetando, e um sinal trocado ali
     * jogaria o ponto para o outro lado da fita.
     */
    for (const exemplo of comMergulho) {
      const embedding = embeddingById(exemplo.embedding)!;
      const p = new Float64Array(3);
      const volta = new Float64Array(DIM);

      for (const x of amostrasDe(exemplo)) {
        embedding.point(x, p);
        embedding.chartOf(Array.from(p), volta);
        for (let i = 0; i < DIM; i++) {
          expect(volta[i], `${exemplo.label} coord ${i}`).toBeGreaterThanOrEqual(
            exemplo.bounds.min[i]! - 1e-9,
          );
          expect(volta[i]).toBeLessThanOrEqual(exemplo.bounds.max[i]! + 1e-9);
        }
      }
    }
  });
});

describe('a fita de Möbius', () => {
  const fita = embeddingById('moebius')!;
  const em = (u: number, v: number): Float64Array => Float64Array.from([u, v]);

  it('fecha com meia-torção: (π, v) é o mesmo ponto que (−π, −v)', () => {
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    for (const v of [-0.6, -0.2, 0.3, 0.7]) {
      fita.point(em(Math.PI, v), a);
      fita.point(em(-Math.PI, -v), b);
      for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k]!, 10);
    }
  });

  it('e a normal chega invertida — é isto que a torna não-orientável', () => {
    /*
     * Um cilindro cola (π, v) com (−π, v) e a normal chega igual. A fita cola
     * com v trocado de sinal, e daí sai e_v(−π,−v) = −e_v(π,v), logo a normal
     * chega ao contrário: dar uma volta devolve o "para cima" apontando para
     * baixo. É o teste que distingue uma fita de Möbius de uma tira torcida
     * qualquer, e a única afirmação deste arquivo que a métrica não sabe fazer.
     */
    const n1 = new Float64Array(3);
    const n2 = new Float64Array(3);
    for (const v of [-0.5, 0.4]) {
      embeddingNormal(fita, em(Math.PI, v), n1);
      embeddingNormal(fita, em(-Math.PI, -v), n2);
      for (let k = 0; k < 3; k++) expect(n1[k]).toBeCloseTo(-n2[k]!, 6);
    }
  });
});

describe('a normal', () => {
  it('é unitária e perpendicular às duas direções da base', () => {
    for (const exemplo of comMergulho) {
      const embedding = embeddingById(exemplo.embedding)!;
      const e = new Float64Array(6);
      const n = new Float64Array(3);

      for (const x of amostrasDe(exemplo)) {
        embeddingBasis(embedding, x, e);
        embeddingNormal(embedding, x, n);
        expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 8);
        for (const base of [0, 3]) {
          const produto = n[0]! * e[base]! + n[1]! * e[base + 1]! + n[2]! * e[base + 2]!;
          expect(Math.abs(produto), `${exemplo.label}`).toBeLessThan(1e-6);
        }
      }
    }
  });
});

describe('a curvatura de cada superfície nova', () => {
  const curvaturaDe = (exemplo: MetricExample, x: Float64Array): number => {
    const metric = compileMetric({ chart: exemplo.chart, components: exemplo.components });
    return gaussianCurvature(metric, christoffelFromMetric(metric, DIM), x);
  };
  const acharPorId = (id: string): MetricExample => EXAMPLES.find((e) => e.id === id)!;

  it('o cilindro é plano — curvo no espaço, reto por dentro', () => {
    const cilindro = acharPorId('cilindro');
    for (const x of amostrasDe(cilindro)) {
      expect(Math.abs(curvaturaDe(cilindro, x))).toBeLessThan(1e-5);
    }
  });

  it('o cone também é plano fora do vértice', () => {
    const cone = acharPorId('cone');
    for (const x of amostrasDe(cone)) {
      expect(Math.abs(curvaturaDe(cone, x))).toBeLessThan(1e-4);
    }
  });

  it('a fita de Möbius é negativa em toda parte e nunca zero', () => {
    // K = −R²/(4·g_uu²) — e ao contrário do cilindro e do cone, que também
    // entortam no espaço, aqui a curvatura não some em lugar nenhum.
    const fita = acharPorId('moebius');
    for (const x of amostrasDe(fita)) {
      const K = curvaturaDe(fita, x);
      expect(K).toBeLessThan(0);
      expect(K, `em (${x[0]!.toFixed(2)}, ${x[1]!.toFixed(2)})`).toBeCloseTo(
        fita.closedCurvature!(x),
        5,
      );
    }
  });

  it('o paraboloide de Flamm segue K = −M/r³', () => {
    const flamm = acharPorId('schwarzschild');
    for (const x of amostrasDe(flamm)) {
      expect(curvaturaDe(flamm, x), `r = ${x[0]!.toFixed(2)}`).toBeCloseTo(
        flamm.closedCurvature!(x),
        6,
      );
    }
  });

  it('o toro tem os três sinais, e cada um no seu lugar', () => {
    // K = cos v / (a (R + a cos v)) com R = 2, a = 0,8.
    const toro = acharPorId('toro');
    const em = (v: number): number => curvaturaDe(toro, Float64Array.from([0.7, v]));
    const exata = (v: number): number => Math.cos(v) / (0.8 * (2 + 0.8 * Math.cos(v)));

    // Parte de fora (v = 0): positiva. Parte de dentro (v = π): negativa.
    // Círculos de cima e de baixo (v = ±π/2): zero.
    expect(em(0)).toBeCloseTo(exata(0), 4);
    expect(em(0)).toBeGreaterThan(0.3);
    expect(em(Math.PI)).toBeCloseTo(exata(Math.PI), 4);
    expect(em(Math.PI)).toBeLessThan(-0.8);
    expect(Math.abs(em(Math.PI / 2))).toBeLessThan(1e-4);
  });

  it('e o toro segue a fórmula fechada num varrimento inteiro do tubo', () => {
    const toro = acharPorId('toro');
    for (let k = 0; k < 12; k++) {
      const v = (-Math.PI * (k + 0.5)) / 6 + Math.PI;
      const K = curvaturaDe(toro, Float64Array.from([1.3, v]));
      expect(K).toBeCloseTo(Math.cos(v) / (0.8 * (2 + 0.8 * Math.cos(v))), 4);
    }
  });
});

describe('o funil de Schwarzschild — o que as "esferas concêntricas" dizem', () => {
  const exemplo = EXAMPLES.find((e) => e.id === 'schwarzschild')!;
  const metric = compileMetric({ chart: exemplo.chart, components: exemplo.components });

  /** Distância própria de r₁ a r₂ ao longo de φ constante: ∫ √g_rr dr. */
  const distancia = (r1: number, r2: number, n = 20000): number => {
    const g = new Float64Array(DIM * DIM);
    const x = new Float64Array(DIM);
    const passo = (r2 - r1) / n;
    let soma = 0;
    for (let i = 0; i < n; i++) {
      x[0] = r1 + (i + 0.5) * passo;
      metric(x, g);
      soma += Math.sqrt(g[0]!);
    }
    return soma * passo;
  };

  it('cada círculo tem comprimento 2πr, como no plano', () => {
    // g_φφ = r²: a circunferência não guarda nenhuma surpresa. Toda a
    // informação está na direção radial, e é isso que faz o desenho ser um
    // funil e não uma esfera.
    const g = new Float64Array(DIM * DIM);
    for (const r of [3, 6, 11]) {
      metric(Float64Array.from([r, 0.4]), g);
      expect(Math.sqrt(g[3]!) * 2 * Math.PI).toBeCloseTo(2 * Math.PI * r, 9);
    }
  });

  it('mas a distância entre dois círculos é maior que a diferença dos raios', () => {
    for (const [r1, r2] of [
      [6, 7],
      [3, 4],
      [2.1, 2.6],
    ] as const) {
      expect(distancia(r1, r2), `de r=${r1} a r=${r2}`).toBeGreaterThan(r2 - r1);
    }
  });

  it('e a razão entre as duas cresce sem limite perto da garganta', () => {
    const razao = (r: number, dr = 0.01): number => distancia(r, r + dr) / dr;
    expect(razao(2.5)).toBeGreaterThan(razao(10));
    expect(razao(2.01)).toBeGreaterThan(razao(2.5));
    // Longe do buraco a métrica volta a ser a do plano — mas por cima, e o
    // desvio é da ordem de M/r: em r=2000 sobra 1/2000, e não zero.
    expect(razao(2000)).toBeGreaterThan(1);
    expect(razao(2000)).toBeLessThan(1.001);

    /*
     * A divergência é pontual, e é por isso que ela é medida com √g_rr e não
     * com a razão acima: com um Δr fixo, a média sobre o intervalo lava o
     * infinito (de r=2,0001 com Δr=0,01 sai só 25,6). O fator de esticamento
     * radial no ponto é 1/√(1−2M/r), e esse não tem teto.
     */
    const g = new Float64Array(DIM * DIM);
    const esticamento = (r: number): number => {
      metric(Float64Array.from([r, 0]), g);
      return Math.sqrt(g[0]!);
    };
    expect(esticamento(2.0001)).toBeGreaterThan(100);
    expect(esticamento(2.000001)).toBeGreaterThan(1000);
    expect(esticamento(2.5)).toBeCloseTo(1 / Math.sqrt(1 - 2 / 2.5), 9);
  });

  it('mas o funil não fica infinitamente longo — a distância até o horizonte é finita', () => {
    // O que diverge é a inclinação da parede, não o comprimento dela. Confundir
    // as duas coisas é o erro clássico de leitura deste desenho.
    expect(distancia(2, 3)).toBeLessThan(4);
    expect(distancia(2, 3)).toBeGreaterThan(2);
  });
});

describe('o domínio do mergulho — onde a superfície acaba e a carta continua', () => {
  const flamm = embeddingById('schwarzschild')!;
  const limites = SCHWARZSCHILD_EXAMPLE.bounds;

  it('a faixa logo acima da garganta fica de fora', () => {
    expect(insideDomain(flamm, Float64Array.from([2.02, 0.3]), limites)).toBe(false);
    expect(insideDomain(flamm, Float64Array.from([6, 0.3]), limites)).toBe(true);
  });

  it('e é exatamente onde a base tangente colapsaria', () => {
    /*
     * A razão de `insideDomain` existir. Em r = 2,02 a métrica é saudável e
     * `probeMetric` aprova — g_rr = 1/(1−2/r) é positivo para todo r > 2 —, mas
     * `point` recorta em 2,04, a diferença central vê os dois lados recortados no
     * mesmo lugar e ∂x/∂r sai zero. Daí somem disco, pilha e vetor, e nos modos
     * de curva a direção nula ainda levava a câmera para dentro da superfície.
     */
    const e = new Float64Array(6);
    embeddingBasis(flamm, Float64Array.from([2.02, 0.3]), e);
    expect(Math.hypot(e[0]!, e[1]!, e[2]!)).toBeLessThan(1e-9);

    embeddingBasis(flamm, Float64Array.from([6, 0.3]), e);
    expect(Math.hypot(e[0]!, e[1]!, e[2]!)).toBeGreaterThan(1);
  });

  it('as superfícies que cobrem a carta inteira não recortam nada', () => {
    for (const id of ['esfera', 'toro', 'cilindro', 'cone', 'moebius']) {
      expect(embeddingById(id)!.domain, id).toBeUndefined();
    }
  });
});
