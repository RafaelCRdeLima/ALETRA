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
} from './embedding';
import { EXAMPLES, type MetricExample } from './examples';
import { compileMetric } from './metric-expr';

const DIM = 2;

/** Pontos internos da carta, longe das bordas onde a carta degenera. */
const amostrasDe = (e: MetricExample): Float64Array[] => {
  const pontos: Float64Array[] = [];
  for (const a of [0.25, 0.5, 0.75]) {
    for (const b of [0.3, 0.65]) {
      pontos.push(
        Float64Array.from([
          e.bounds.min[0]! + a * (e.bounds.max[0]! - e.bounds.min[0]!),
          e.bounds.min[1]! + b * (e.bounds.max[1]! - e.bounds.min[1]!),
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
