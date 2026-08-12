export { chart, zeros, type Chart } from './chart';
export { componentCount, evaluate, form, increasingIndices, type Form } from './forms';
export { christoffelIndex, normSquared, type ChristoffelFn, type MetricFn } from './metric';
export { read, type Reading } from './reading';

// Etapa 1 — a esfera em forma fechada, hoje o padrão-ouro da diferença finita.
export {
  SPHERE_CHART,
  sphereBasis,
  sphereChartOf,
  sphereChristoffel,
  sphereCurvature,
  sphereEmbed,
  sphereMetric,
  sphereNormal,
} from './sphere';

// Etapa 2 — métrica digitada, motor numérico geral, e onde ele não vale.
export {
  CONSTANT_NAMES,
  FUNCTION_NAMES,
  ParseError,
  evaluateNode,
  parse,
  type Node,
} from './expr';
export { DEFAULT_H, christoffelFromMetric } from './christoffel-fd';
export { determinant, invert } from './linalg';
export { DEFAULT_H_CURVATURE, gaussianCurvature } from './curvature';
export {
  degeneracyMask,
  probeMetric,
  type ChartBounds,
  type MetricProbe,
  type SingularityKind,
} from './degenerate';
export {
  compileMetric,
  componentIndices,
  componentLabel,
  upperTriangleCount,
  type MetricSource,
} from './metric-expr';
// Etapa 3 — ♯ e ♭: o mesmo objeto em duas notações.
export { flat, flatForm, sharp, sharpVector } from './musical';
export {
  EUCLIDEAN_EXAMPLE,
  EXAMPLES,
  HYPERBOLIC_EXAMPLE,
  SCHWARZSCHILD_EXAMPLE,
  SPHERE_EXAMPLE,
  exampleById,
  type MetricExample,
} from './examples';
