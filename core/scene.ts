/**
 * O formato de cena: o que uma cena precisa guardar para ser reaberta igual.
 *
 * Chega na Etapa 4 e não antes de propósito. Só depois de construir três cenas
 * concretas dá para saber o que elas de fato guardam — inventar o formato na
 * Etapa 1 teria produzido campos para coisas que nunca existiram e nenhum campo
 * para a morfose de ♭, que só apareceu na Etapa 3.
 *
 * Guarda a **expressão digitada** da métrica, nunca a AST compilada: é o que o
 * autor escreveu, é o que ele reconhece ao reabrir, e é o que sobrevive a uma
 * mudança futura no parser.
 *
 * ## Sobre confiança
 *
 * Uma cena vem de uma URL que qualquer pessoa pode montar e mandar para um
 * aluno. Tudo aqui é entrada não confiável. As expressões de métrica já são
 * seguras por construção (D4: gramática fechada, AST interpretada, nunca
 * `eval`), mas a *estrutura* precisa ser validada com a mesma seriedade — daí
 * `sceneFromUnknown` recusar qualquer coisa fora do formato em vez de confiar
 * no formato e quebrar depois, no meio do desenho.
 */

export interface SceneDoc {
  readonly versao: 1;
  /** Nomes das coordenadas — o que o parser aceita nas expressões. */
  readonly carta: readonly string[];
  /** Triângulo superior da métrica, como expressões: [g₀₀, g₀₁, g₁₁]. */
  readonly metrica: readonly string[];
  readonly limites: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly ponto: readonly number[];
  readonly vetor: readonly number[];
  readonly omega: readonly number[];
  /** Segunda 1-form e segundo vetor: a 2-form da Etapa 5 é ω ∧ η, lida em (u, v). */
  readonly eta: readonly number[];
  readonly u: readonly number[];
  /**
   * A diagonal do laço da holonomia (Etapa 8), opcional.
   *
   * Estado próprio e não `u` reaproveitado: a escala de um vetor tangente e a de
   * um laço diferem por uma ordem de grandeza, e servir aos dois com o mesmo
   * campo fazia o laço nascer do tamanho de uma seta.
   */
  readonly laco: readonly number[] | null;
  /**
   * Qual leitura a cena abre mostrando. O tipo sai de `MODOS_CONHECIDOS` em vez
   * de repetir a união: as duas listas já divergiram uma vez, quando a leitura
   * de simetria entrou na validação e não aqui.
   */
  readonly modo: ModoCena;
  readonly maxVetor: number;
  /** Morfose v ⇄ v♭ da Etapa 3, em [0, 1]. */
  readonly bemol: number;
  /** Identificador do mergulho em ℝ³, ou nulo para viver só na carta. */
  readonly mergulho: string | null;
  /**
   * Os campos digitados das Etapas 6 e 7.
   *
   * Nulo quando a cena não os define — aí a interface usa os padrões da carta.
   * Sem isto, copiar o link no modo derivada ou colchete guardava o *modo* e
   * perdia tudo que o autor tinha escrito, e quem abrisse veria os padrões: a
   * promessa da Etapa 4 ("vê exatamente o que você via") quebrada em silêncio,
   * porque a cena continuava abrindo.
   */
  readonly campos: {
    readonly omega: readonly string[];
    readonly f: string;
    readonly usarDf: boolean;
    readonly x: readonly string[];
    readonly y: readonly string[];
    /** O campo da leitura de simetria. */
    readonly xi: readonly string[];
    readonly passo: number;
  } | null;
  readonly rotulo: string;
  readonly nota: string;
}

export const VERSAO_ATUAL = 1;

/** As leituras que o produto sabe abrir. Cresce a cada etapa que traz uma nova. */
const MODOS_CONHECIDOS = [
  'uma',
  'duas',
  'derivada',
  'colchete',
  'holonomia',
  'geodesica',
  'killing',
] as const;
type ModoCena = (typeof MODOS_CONHECIDOS)[number];

/** Os mergulhos que o produto sabe desenhar — o catálogo de `embedding.ts`. */
const MERGULHOS_CONHECIDOS: readonly string[] = [
  'esfera',
  'cilindro',
  'cone',
  'toro',
  'moebius',
  'schwarzschild',
];

const ehModo = (valor: unknown): valor is ModoCena =>
  typeof valor === 'string' && (MODOS_CONHECIDOS as readonly string[]).includes(valor);

export class SceneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneError';
  }
}

// ------------------------------------------------------------- validação

function exigirObjeto(valor: unknown, onde: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new SceneError(`${onde}: esperava um objeto`);
  }
  return valor as Record<string, unknown>;
}

function exigirTexto(valor: unknown, onde: string, maximo = 400): string {
  if (typeof valor !== 'string') throw new SceneError(`${onde}: esperava texto`);
  if (valor.length > maximo) {
    throw new SceneError(`${onde}: texto longo demais (${valor.length} > ${maximo})`);
  }
  return valor;
}

function exigirNumero(valor: unknown, onde: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new SceneError(`${onde}: esperava um número finito`);
  }
  return valor;
}

function exigirNumeros(valor: unknown, onde: string, quantos: number): number[] {
  if (!Array.isArray(valor) || valor.length !== quantos) {
    throw new SceneError(`${onde}: esperava ${quantos} números`);
  }
  return valor.map((v, i) => exigirNumero(v, `${onde}[${i}]`));
}

function exigirTextos(valor: unknown, onde: string, quantos: number): string[] {
  if (!Array.isArray(valor) || valor.length !== quantos) {
    throw new SceneError(`${onde}: esperava ${quantos} itens`);
  }
  return valor.map((v, i) => exigirTexto(v, `${onde}[${i}]`));
}

/**
 * Os campos digitados das Etapas 6 e 7, validados com o mesmo rigor do resto.
 *
 * As expressões não são compiladas aqui — quem compila é a interface, com o
 * parser de gramática fechada de D4 — mas o teto de comprimento vale desde já:
 * o campo não é um canal de carga.
 */
function lerCampos(bruto: unknown): SceneDoc['campos'] {
  if (bruto === undefined || bruto === null) return null;
  const o = exigirObjeto(bruto, 'cena.campos');

  const passo = exigirNumero(o['passo'], 'cena.campos.passo');
  if (passo <= 0) throw new SceneError('cena.campos.passo: tem de ser positivo');

  const usarDf = o['usarDf'];
  if (typeof usarDf !== 'boolean') {
    throw new SceneError('cena.campos.usarDf: esperava verdadeiro ou falso');
  }

  return {
    omega: exigirTextos(o['omega'], 'cena.campos.omega', 2),
    f: exigirTexto(o['f'], 'cena.campos.f'),
    usarDf,
    x: exigirTextos(o['x'], 'cena.campos.x', 2),
    y: exigirTextos(o['y'], 'cena.campos.y', 2),
    // Endereços gerados antes da leitura de simetria não trazem ξ. Preenchido
    // como η e u são preenchidos quando faltam: a cena abre, e a interface põe
    // por cima a simetria que o próprio exemplo declara.
    xi: o['xi'] === undefined ? ['0', '1'] : exigirTextos(o['xi'], 'cena.campos.xi', 2),
    passo,
  };
}

/**
 * Valida uma estrutura vinda de JSON e devolve uma cena, ou explica o que está
 * errado. Nenhum campo é assumido; nenhum extra é preservado.
 */
export function sceneFromUnknown(bruto: unknown): SceneDoc {
  const o = exigirObjeto(bruto, 'cena');

  const versao = exigirNumero(o['versao'], 'cena.versao');
  if (versao !== VERSAO_ATUAL) {
    throw new SceneError(
      `esta cena é da versão ${versao} e este ÁLETRA lê a versão ${VERSAO_ATUAL}`,
    );
  }

  const carta = exigirTextos(o['carta'], 'cena.carta', 2);
  for (const nome of carta) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nome)) {
      throw new SceneError(`cena.carta: "${nome}" não é um nome de coordenada válido`);
    }
  }

  const limites = exigirObjeto(o['limites'], 'cena.limites');
  const min = exigirNumeros(limites['min'], 'cena.limites.min', 2);
  const max = exigirNumeros(limites['max'], 'cena.limites.max', 2);
  for (let i = 0; i < 2; i++) {
    if (!(max[i]! > min[i]!)) {
      throw new SceneError(`cena.limites: o máximo de ${carta[i]} tem de ser maior que o mínimo`);
    }
  }

  const maxVetor = exigirNumero(o['maxVetor'], 'cena.maxVetor');
  if (maxVetor <= 0) throw new SceneError('cena.maxVetor: tem de ser positivo');

  const bemol = exigirNumero(o['bemol'], 'cena.bemol');
  if (bemol < 0 || bemol > 1) throw new SceneError('cena.bemol: tem de estar entre 0 e 1');

  const mergulho = o['mergulho'] ?? null;
  if (mergulho !== null && !MERGULHOS_CONHECIDOS.includes(mergulho as string)) {
    throw new SceneError(
      `cena.mergulho: só ${MERGULHOS_CONHECIDOS.map((m) => `"${m}"`).join(', ')} ou nulo`,
    );
  }

  const vetor = exigirNumeros(o['vetor'], 'cena.vetor', 2);
  const omega = exigirNumeros(o['omega'], 'cena.omega', 2);

  // η e u chegaram na Etapa 5 e são opcionais: um endereço gerado antes dela
  // continua abrindo, e o que falta vira a rotação de 90° do par correspondente
  // — a mesma escolha que a interface usa como padrão, pelo mesmo motivo (um η
  // paralelo a ω daria ω∧η = 0 e um ladrilho sem células).
  const girar = (c: readonly number[]): number[] => [-c[1]!, c[0]!];
  const modo = o['modo'] ?? 'uma';
  if (!ehModo(modo)) {
    throw new SceneError(
      `cena.modo: só ${MODOS_CONHECIDOS.map((m) => `"${m}"`).join(', ')} são conhecidos`,
    );
  }

  return {
    versao: VERSAO_ATUAL,
    carta,
    metrica: exigirTextos(o['metrica'], 'cena.metrica', 3),
    limites: { min, max },
    ponto: exigirNumeros(o['ponto'], 'cena.ponto', 2),
    vetor,
    omega,
    eta: o['eta'] === undefined ? girar(omega) : exigirNumeros(o['eta'], 'cena.eta', 2),
    u: o['u'] === undefined ? girar(vetor) : exigirNumeros(o['u'], 'cena.u', 2),
    laco:
      o['laco'] === undefined || o['laco'] === null
        ? null
        : exigirNumeros(o['laco'], 'cena.laco', 2),
    modo,
    campos: lerCampos(o['campos']),
    maxVetor,
    bemol,
    mergulho: mergulho as string | null,
    rotulo: exigirTexto(o['rotulo'] ?? '', 'cena.rotulo', 120),
    nota: exigirTexto(o['nota'] ?? '', 'cena.nota', 400),
  };
}

// ------------------------------------------------------------ texto e URL

/** O formato legível: JSON indentado, versionável em git porque é texto. */
export function sceneToText(cena: SceneDoc): string {
  return `${JSON.stringify(cena, null, 2)}\n`;
}

export function sceneFromText(texto: string): SceneDoc {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new SceneError('isto não é um arquivo de cena válido (JSON malformado)');
  }
  return sceneFromUnknown(bruto);
}

/**
 * Codificação para a URL: JSON minificado → UTF-8 → base64url.
 *
 * Sem compressão, e isto é decisão medida e não esquecimento — ver D14. As
 * cenas do escopo cabem em poucas centenas de caracteres, muito abaixo de
 * qualquer limite prático de URL, e `CompressionStream` custaria assincronia
 * no caminho de abertura da página para economizar bytes que não faltam.
 */
export function sceneToParam(cena: SceneDoc): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cena));
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sceneFromParam(param: string): SceneDoc {
  let binario: string;
  try {
    const base64 = param.replace(/-/g, '+').replace(/_/g, '/');
    binario = atob(base64);
  } catch {
    throw new SceneError('o endereço da cena está truncado ou corrompido');
  }
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return sceneFromText(new TextDecoder().decode(bytes));
}
