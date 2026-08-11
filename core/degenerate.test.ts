/**
 * D7: onde a métrica não serve, e — quando dá para saber — por quê.
 *
 * Os casos aqui são exatamente os que D7 cita como o erro conceitual que o
 * produto pode mostrar ao vivo: o horizonte de Schwarzschild em r=2M *parece*
 * uma catástrofe na carta e não é, enquanto r=0 é. Se estes testes passam, a
 * interface pode afirmar a distinção sem mentir.
 */
import { describe, expect, it } from 'vitest';
import { christoffelFromMetric } from './christoffel-fd';
import { degeneracyMask, probeMetric } from './degenerate';
import { HYPERBOLIC_EXAMPLE, SCHWARZSCHILD_EXAMPLE, SPHERE_EXAMPLE } from './examples';
import { compileMetric } from './metric-expr';

const DIM = 2;
const engineOf = (example: typeof SPHERE_EXAMPLE) => {
  const metric = compileMetric({ chart: example.chart, components: example.components });
  return { metric, christoffel: christoffelFromMetric(metric, DIM) };
};

describe('pontos saudáveis', () => {
  it('não marca nada onde a métrica é boa', () => {
    for (const example of [SPHERE_EXAMPLE, HYPERBOLIC_EXAMPLE, SCHWARZSCHILD_EXAMPLE]) {
      const { metric, christoffel } = engineOf(example);
      const x = Float64Array.from(example.initialPoint);
      expect(probeMetric(metric, christoffel, DIM, x).kind).toBe('ok');
    }
  });
});

describe('singularidade de coordenada — a carta falha, a geometria não', () => {
  it('reconhece o polo da esfera', () => {
    const { metric, christoffel } = engineOf(SPHERE_EXAMPLE);
    const probe = probeMetric(metric, christoffel, DIM, Float64Array.from([0, 0.4]));
    expect(probe.kind).toBe('coordinate');
    expect(probe.message).toMatch(/singularidade de coordenada/);
  });

  it('reconhece o horizonte de Schwarzschild em r = 2M', () => {
    const { metric, christoffel } = engineOf(SCHWARZSCHILD_EXAMPLE);
    const probe = probeMetric(metric, christoffel, DIM, Float64Array.from([2, 0]));
    expect(probe.kind).toBe('coordinate');
  });

  it('reconhece a borda y = 0 do semiplano hiperbólico', () => {
    const { metric, christoffel } = engineOf(HYPERBOLIC_EXAMPLE);
    const probe = probeMetric(metric, christoffel, DIM, Float64Array.from([0, 0]));
    expect(probe.kind).toBe('coordinate');
  });
});

describe('singularidade de curvatura — a geometria diverge de verdade', () => {
  it('separa r = 0 de r = 2M em Schwarzschild', () => {
    const { metric, christoffel } = engineOf(SCHWARZSCHILD_EXAMPLE);
    const centro = probeMetric(metric, christoffel, DIM, Float64Array.from([0, 0]));
    expect(centro.kind).toBe('curvature');
    expect(centro.message).toMatch(/nenhuma mudança de coordenadas conserta/);

    // O contraste é o conteúdo pedagógico: mesma métrica, dois pontos que a
    // carta trata igual e a geometria não.
    const horizonte = probeMetric(metric, christoffel, DIM, Float64Array.from([2, 0]));
    expect(horizonte.kind).not.toBe(centro.kind);
  });
});

describe('máscara para hachurar o painel 2D', () => {
  it('marca a faixa dos polos na esfera e deixa o meio livre', () => {
    const { metric } = engineOf(SPHERE_EXAMPLE);
    const mask = degeneracyMask(
      metric,
      DIM,
      { min: [0, -Math.PI], max: [Math.PI, Math.PI] },
      21,
    );
    const at = (row: number, col: number): number => mask[row * 21 + col]!;
    expect(at(10, 0)).toBe(1); // θ = 0
    expect(at(10, 20)).toBe(1); // θ = π
    expect(at(10, 10)).toBe(0); // equador
  });

  it('hachura o interior do horizonte em Schwarzschild, e só ele', () => {
    // g_rr = 1/(1-2M/r) fica negativa para r < 2M: a carta deixa de descrever
    // uma superfície ali. Um teste só de det ≈ 0 não pegaria isto — det não zera
    // nem explode de um jeito que um limiar relativo capture.
    const { metric } = engineOf(SCHWARZSCHILD_EXAMPLE);
    const n = 41;
    const mask = degeneracyMask(metric, DIM, SCHWARZSCHILD_EXAMPLE.bounds, n);
    const { min, max } = SCHWARZSCHILD_EXAMPLE.bounds;
    const rAt = (col: number): number => min[0]! + ((max[0]! - min[0]!) * col) / (n - 1);

    for (let col = 0; col < n; col++) {
      const dentro = rAt(col) < 2;
      const hachurado = mask[Math.floor(n / 2) * n + col] === 1;
      expect(hachurado).toBe(dentro);
    }
  });

  it('não trava nem devolve NaN em métrica degenerada de propósito', () => {
    const metric = compileMetric({ chart: SPHERE_EXAMPLE.chart, components: ['0', '0', '0'] });
    const mask = degeneracyMask(metric, DIM, { min: [0, 0], max: [1, 1] }, 8);
    expect(mask.every((cell) => cell === 1)).toBe(true);
  });
});
