/**
 * Integração de fluxo por RK4 de passo fixo (D5).
 *
 * O `PLAN.md` diz que a Etapa 7 "reaproveita o integrador RK4 do núcleo". Ele
 * não existia: D5 o especifica, mas nenhuma etapa anterior precisou dele. Entra
 * aqui, e a Etapa 9 o reaproveita para geodésicas — a ordem inverteu, a peça é
 * a mesma.
 *
 * Passo fixo e não adaptativo, também por D5: controle de erro e rejeição de
 * passo são complexidade real, e só se justificam diante de uma falha
 * demonstrada. Os fluxos desta etapa são curtos por construção — o quadrilátero
 * de Lie vive numa vizinhança pequena do ponto —, então o regime em que passo
 * adaptativo ganharia não é alcançado.
 */

/** Um campo vetorial: a velocidade em cada ponto. */
export type VectorField = (x: Float64Array, out: Float64Array) => void;

/** Um passo de RK4 de tamanho `dt`, de `x` para `out`. */
export function rk4Step(
  field: VectorField,
  x: Float64Array,
  dt: number,
  dim: number,
  out: Float64Array,
): void {
  const k1 = new Float64Array(dim);
  const k2 = new Float64Array(dim);
  const k3 = new Float64Array(dim);
  const k4 = new Float64Array(dim);
  const tmp = new Float64Array(dim);

  field(x, k1);
  for (let i = 0; i < dim; i++) tmp[i] = x[i]! + (dt / 2) * k1[i]!;
  field(tmp, k2);
  for (let i = 0; i < dim; i++) tmp[i] = x[i]! + (dt / 2) * k2[i]!;
  field(tmp, k3);
  for (let i = 0; i < dim; i++) tmp[i] = x[i]! + dt * k3[i]!;
  field(tmp, k4);

  for (let i = 0; i < dim; i++) {
    out[i] = x[i]! + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }
}

/**
 * Segue o fluxo do campo por tempo `t`, em `steps` passos.
 * `t` pode ser negativo — o fluxo anda para trás.
 */
export function flow(
  field: VectorField,
  start: Float64Array,
  t: number,
  steps: number,
  dim: number,
): Float64Array {
  const dt = t / steps;
  let atual = Float64Array.from(start);
  const proximo = new Float64Array(dim);

  for (let n = 0; n < steps; n++) {
    rk4Step(field, atual, dt, dim, proximo);
    atual = Float64Array.from(proximo);
  }
  return atual;
}

/** O caminho inteiro, ponto a ponto — o que o desenho precisa para traçar a curva. */
export function flowPath(
  field: VectorField,
  start: Float64Array,
  t: number,
  steps: number,
  dim: number,
): Float64Array[] {
  const dt = t / steps;
  const caminho: Float64Array[] = [Float64Array.from(start)];
  const proximo = new Float64Array(dim);

  for (let n = 0; n < steps; n++) {
    rk4Step(field, caminho[caminho.length - 1]!, dt, dim, proximo);
    caminho.push(Float64Array.from(proximo));
  }
  return caminho;
}
