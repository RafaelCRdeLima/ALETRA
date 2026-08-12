/**
 * Álgebra linear pequena, compartilhada.
 *
 * Estas duas funções nasceram dentro de `christoffel-fd.ts` e passaram a ser
 * usadas também pela curvatura, pela detecção de degeneração e agora por ♯/♭.
 * Extrair *estas funções específicas* é exatamente o movimento que D9 autoriza —
 * e não uma hierarquia de "objeto algébrico", que continua fora.
 *
 * As dimensões param em 3 porque o escopo do projeto para em 3.
 */

/** Determinante de uma matriz n×n row-major (n ≤ 3). */
export function determinant(m: Float64Array, n: number): number {
  if (n === 1) return m[0]!;
  if (n === 2) return m[0]! * m[3]! - m[1]! * m[2]!;
  if (n === 3) {
    return (
      m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
      m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
      m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
    );
  }
  throw new Error(`dimensão ${n} fora do escopo do projeto`);
}

/** Inversa por Gauss-Jordan. Devolve tudo NaN se a matriz for singular. */
export function invert(m: Float64Array, n: number, out: Float64Array): void {
  const a = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i * 2 * n + j] = m[i * n + j]!;
    a[i * 2 * n + n + i] = 1;
  }

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row * 2 * n + col]!) > Math.abs(a[pivot * 2 * n + col]!)) pivot = row;
    }
    if (!Number.isFinite(a[pivot * 2 * n + col]!) || Math.abs(a[pivot * 2 * n + col]!) < 1e-300) {
      out.fill(Number.NaN);
      return;
    }
    if (pivot !== col) {
      for (let k = 0; k < 2 * n; k++) {
        const tmp = a[col * 2 * n + k]!;
        a[col * 2 * n + k] = a[pivot * 2 * n + k]!;
        a[pivot * 2 * n + k] = tmp;
      }
    }
    const diag = a[col * 2 * n + col]!;
    for (let k = 0; k < 2 * n; k++) a[col * 2 * n + k] /= diag;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row * 2 * n + col]!;
      if (factor === 0) continue;
      for (let k = 0; k < 2 * n; k++) a[row * 2 * n + k] -= factor * a[col * 2 * n + k]!;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i * n + j] = a[i * 2 * n + n + j]!;
  }
}
