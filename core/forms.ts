/**
 * Formas diferenciais num ponto, guardadas pelos seus componentes independentes.
 *
 * O grau é um *dado* do registro, não um tipo. Numa carta de dimensão 2, uma
 * 1-form tem 2 componentes e uma 2-form tem 1 — e `evaluate` trata os dois casos
 * com o mesmo laço. Ver D12 em DECISIONS.md: isto é layout de dados, e não a
 * hierarquia de classes que D9 proíbe.
 *
 * Ordem dos componentes: multi-índices estritamente crescentes em ordem
 * lexicográfica. Para dim=3, uma 2-form é [ω₀₁, ω₀₂, ω₁₂].
 */
export interface Form {
  readonly degree: number;
  readonly dim: number;
  readonly components: Float64Array;
}

/** C(dim, degree) — quantos componentes independentes uma forma desse grau tem. */
export function componentCount(dim: number, degree: number): number {
  if (degree < 0 || degree > dim) return 0;
  let n = 1;
  for (let i = 0; i < degree; i++) n = (n * (dim - i)) / (i + 1);
  return Math.round(n);
}

const indexCache = new Map<string, readonly (readonly number[])[]>();

/**
 * Os multi-índices estritamente crescentes de comprimento `degree` em `dim`
 * dimensões, em ordem lexicográfica — a ordem canônica dos componentes.
 */
export function increasingIndices(dim: number, degree: number): readonly (readonly number[])[] {
  const key = `${dim},${degree}`;
  const cached = indexCache.get(key);
  if (cached) return cached;

  const out: number[][] = [];
  if (degree === 0) {
    out.push([]);
  } else if (degree > 0 && degree <= dim) {
    const current = new Array<number>(degree);
    const walk = (start: number, depth: number): void => {
      if (depth === degree) {
        out.push([...current]);
        return;
      }
      for (let i = start; i <= dim - (degree - depth); i++) {
        current[depth] = i;
        walk(i + 1, depth + 1);
      }
    };
    walk(0, 0);
  }

  indexCache.set(key, out);
  return out;
}

/** Constrói uma forma, validando a contagem de componentes contra (dim, degree). */
export function form(dim: number, degree: number, components: readonly number[]): Form {
  const expected = componentCount(dim, degree);
  if (components.length !== expected) {
    throw new Error(
      `uma ${degree}-form em dimensão ${dim} tem ${expected} componente(s), ` +
        `recebi ${components.length}`,
    );
  }
  return { degree, dim, components: Float64Array.from(components) };
}

/**
 * Avalia a forma sobre `degree` vetores.
 *
 * Esta é a contração do projeto inteiro: com degree=1 é ⟨ω, v⟩ da Etapa 1; com
 * degree=2 é ω(u, v) da Etapa 5. Nenhum código novo por grau — só o laço sobre
 * os multi-índices, com o determinante do menor correspondente carregando a
 * antissimetria.
 */
export function evaluate(f: Form, vectors: readonly Float64Array[]): number {
  if (vectors.length !== f.degree) {
    throw new Error(`uma ${f.degree}-form precisa de ${f.degree} vetor(es), recebi ${vectors.length}`);
  }
  if (f.degree === 0) return f.components[0] ?? 0;

  const indices = increasingIndices(f.dim, f.degree);
  let total = 0;
  for (let c = 0; c < indices.length; c++) {
    const weight = f.components[c];
    if (weight === 0) continue;
    total += weight * minorDeterminant(vectors, indices[c]!);
  }
  return total;
}

/**
 * det da matriz M[a][b] = vectors[a][idx[b]].
 *
 * Casos explícitos até 3×3 porque o escopo do projeto limita a dimensão a 3
 * (ver "Fora de escopo em todas as etapas" no PLAN.md). Passar disso é erro de
 * programação, não um caso a suportar.
 */
function minorDeterminant(vectors: readonly Float64Array[], idx: readonly number[]): number {
  const a = vectors[0]!;
  switch (idx.length) {
    case 1:
      return a[idx[0]!]!;
    case 2: {
      const b = vectors[1]!;
      const [i, j] = [idx[0]!, idx[1]!];
      return a[i]! * b[j]! - a[j]! * b[i]!;
    }
    case 3: {
      const b = vectors[1]!;
      const c = vectors[2]!;
      const [i, j, k] = [idx[0]!, idx[1]!, idx[2]!];
      return (
        a[i]! * (b[j]! * c[k]! - b[k]! * c[j]!) -
        a[j]! * (b[i]! * c[k]! - b[k]! * c[i]!) +
        a[k]! * (b[i]! * c[j]! - b[j]! * c[i]!)
      );
    }
    default:
      throw new Error(`grau ${idx.length} fora do escopo do projeto (dimensão máxima 3)`);
  }
}
