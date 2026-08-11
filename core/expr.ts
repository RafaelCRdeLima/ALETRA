/**
 * Parser e interpretador de expressões para os componentes da métrica (D4).
 *
 * A gramática é fechada e a AST é **interpretada**, nunca compilada para código
 * executável. Isto não é preferência de estilo: cenas viajam na URL e rodam ao
 * abrir o link, inclusive embutidas em página de terceiros. `eval`/`new Function`
 * sobre esse conteúdo seria execução de código arbitrário a partir de uma URL não
 * confiável — um XSS embutido no formato de arquivo do próprio produto. Um
 * interpretador sobre gramática fechada elimina a classe inteira por construção.
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/') factor)*
 *   factor  := ('-' | '+') factor | power
 *   power   := primary ('^' factor)?      — potência associa à direita
 *   primary := número | variável | função '(' args ')' | '(' expr ')'
 *
 * A potência morde mais forte que o menos unário: -2^2 é -(2^2) = -4, não
 * (-2)² = 4. Por isso a base de '^' é um `primary` e não um `factor`, enquanto o
 * expoente é um `factor` inteiro — assim 2^-3 também funciona.
 */

export type Node =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'var'; readonly index: number; readonly name: string }
  | { readonly kind: 'neg'; readonly arg: Node }
  | { readonly kind: 'bin'; readonly op: BinOp; readonly left: Node; readonly right: Node }
  | { readonly kind: 'call'; readonly fn: FnName; readonly args: readonly Node[] };

type BinOp = '+' | '-' | '*' | '/' | '^';

/** Lista branca fechada. Nada fora daqui é chamável, por construção. */
const FUNCTIONS = {
  sin: { arity: 1, apply: (a: number[]) => Math.sin(a[0]!) },
  cos: { arity: 1, apply: (a: number[]) => Math.cos(a[0]!) },
  tan: { arity: 1, apply: (a: number[]) => Math.tan(a[0]!) },
  sinh: { arity: 1, apply: (a: number[]) => Math.sinh(a[0]!) },
  cosh: { arity: 1, apply: (a: number[]) => Math.cosh(a[0]!) },
  tanh: { arity: 1, apply: (a: number[]) => Math.tanh(a[0]!) },
  exp: { arity: 1, apply: (a: number[]) => Math.exp(a[0]!) },
  log: { arity: 1, apply: (a: number[]) => Math.log(a[0]!) },
  sqrt: { arity: 1, apply: (a: number[]) => Math.sqrt(a[0]!) },
  abs: { arity: 1, apply: (a: number[]) => Math.abs(a[0]!) },
  atan2: { arity: 2, apply: (a: number[]) => Math.atan2(a[0]!, a[1]!) },
  pow: { arity: 2, apply: (a: number[]) => Math.pow(a[0]!, a[1]!) },
} as const;

export type FnName = keyof typeof FUNCTIONS;

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
};

/**
 * Consulta que não enxerga a cadeia de protótipos.
 *
 * `'constructor' in FUNCTIONS` é `true` e `CONSTANTS['constructor']` devolve
 * `Object` — herdados de Object.prototype, não declarados aqui. Com `in`/indexação
 * crua, "constructor", "__proto__", "toString" e companhia atravessariam a lista
 * branca. Num parser cuja razão de existir é fechar essa porta (D4), a consulta
 * precisa ser por propriedade própria.
 */
function has(table: object, name: string): boolean {
  return Object.hasOwn(table, name);
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// ------------------------------------------------------------------ tokens

type TokenKind = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'end';
interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly value: number;
  readonly at: number;
}

/**
 * Lê um número a partir de `start` e devolve onde ele termina (ou `start`, se o
 * que havia ali era só um ponto solto).
 *
 * Aceita notação de expoente porque o público escreve `1e-5` por reflexo, e a
 * alternativa era ele receber "sobrou 'e' no fim da expressão" — mensagem que
 * não ajuda ninguém a consertar nada.
 *
 * O 'e' só é consumido como expoente se vier dígito de fato depois dele. Assim
 * `1e-5` é um número e `2*e` continua sendo dois vezes a constante de Euler:
 * as duas leituras coexistem sem ambiguidade.
 */
function readNumber(source: string, start: number): number {
  const isDigit = (k: number): boolean =>
    k < source.length && source[k]! >= '0' && source[k]! <= '9';

  let i = start;
  while (isDigit(i)) i++;
  if (source[i] === '.') {
    i++;
    while (isDigit(i)) i++;
  }
  if (i === start + 1 && source[start] === '.') return start;
  if (i === start) return start;

  if (source[i] === 'e' || source[i] === 'E') {
    let j = i + 1;
    if (source[j] === '+' || source[j] === '-') j++;
    if (isDigit(j)) {
      while (isDigit(j)) j++;
      i = j;
    }
  }
  return i;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    const start = i;

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      const end = readNumber(source, i);
      if (end === i) throw new ParseError(`ponto solto na posição ${start + 1}`, start);
      i = end;
      const text = source.slice(start, i);
      tokens.push({ kind: 'num', text, value: Number(text), at: start });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) i++;
      tokens.push({ kind: 'ident', text: source.slice(start, i), value: 0, at: start });
      continue;
    }

    i++;
    if ('+-*/^'.includes(ch)) tokens.push({ kind: 'op', text: ch, value: 0, at: start });
    else if (ch === '(') tokens.push({ kind: 'lparen', text: ch, value: 0, at: start });
    else if (ch === ')') tokens.push({ kind: 'rparen', text: ch, value: 0, at: start });
    else if (ch === ',') tokens.push({ kind: 'comma', text: ch, value: 0, at: start });
    else throw new ParseError(`não entendi o símbolo "${ch}" na posição ${start + 1}`, start);
  }
  tokens.push({ kind: 'end', text: '', value: 0, at: source.length });
  return tokens;
}

// ------------------------------------------------------------------ parser

/**
 * Compila uma expressão contra os nomes de variável de uma carta.
 * `variables` são os nomes aceitos (ex. ['theta', 'phi']); a posição na lista
 * vira o índice usado na avaliação.
 */
export function parse(source: string, variables: readonly string[]): Node {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token => tokens[pos]!;
  const next = (): Token => tokens[pos++]!;

  const describe = (t: Token): string =>
    t.kind === 'end' ? 'o fim da expressão' : `"${t.text}"`;

  function parseExpr(): Node {
    let left = parseTerm();
    while (peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = next().text as '+' | '-';
      left = { kind: 'bin', op, left, right: parseTerm() };
    }
    return left;
  }

  function parseTerm(): Node {
    let left = parseFactor();
    while (peek().kind === 'op' && (peek().text === '*' || peek().text === '/')) {
      const op = next().text as '*' | '/';
      left = { kind: 'bin', op, left, right: parseFactor() };
    }
    return left;
  }

  function parseFactor(): Node {
    const t = peek();
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      next();
      const arg = parseFactor();
      return t.text === '-' ? { kind: 'neg', arg } : arg;
    }
    return parsePower();
  }

  function parsePower(): Node {
    const base = parsePrimary();
    if (peek().kind === 'op' && peek().text === '^') {
      next();
      return { kind: 'bin', op: '^', left: base, right: parseFactor() };
    }
    return base;
  }

  function parsePrimary(): Node {
    const t = next();

    if (t.kind === 'num') return { kind: 'num', value: t.value };

    if (t.kind === 'lparen') {
      const inner = parseExpr();
      if (peek().kind !== 'rparen') {
        throw new ParseError(
          `faltou fechar o parêntese aberto na posição ${t.at + 1}`,
          peek().at,
        );
      }
      next();
      return inner;
    }

    if (t.kind === 'ident') {
      if (peek().kind === 'lparen') return parseCall(t);

      const index = variables.indexOf(t.text);
      if (index >= 0) return { kind: 'var', index, name: t.text };

      if (has(CONSTANTS, t.text)) return { kind: 'num', value: CONSTANTS[t.text]! };

      if (has(FUNCTIONS, t.text)) {
        throw new ParseError(
          `"${t.text}" é uma função e precisa de parênteses, como ${t.text}(x)`,
          t.at,
        );
      }
      throw new ParseError(
        `não conheço "${t.text}" — nesta carta as variáveis são ${variables.join(', ')}`,
        t.at,
      );
    }

    throw new ParseError(
      `esperava um número, uma variável ou "(" e encontrei ${describe(t)}`,
      t.at,
    );
  }

  function parseCall(name: Token): Node {
    if (!has(FUNCTIONS, name.text)) {
      throw new ParseError(
        `não conheço a função "${name.text}" — as disponíveis são ${Object.keys(FUNCTIONS).join(', ')}`,
        name.at,
      );
    }
    const fn = name.text as FnName;
    next(); // consome '('

    const args: Node[] = [];
    if (peek().kind !== 'rparen') {
      args.push(parseExpr());
      while (peek().kind === 'comma') {
        next();
        args.push(parseExpr());
      }
    }
    if (peek().kind !== 'rparen') {
      throw new ParseError(`faltou fechar o parêntese de ${fn}`, peek().at);
    }
    next();

    const { arity } = FUNCTIONS[fn];
    if (args.length !== arity) {
      throw new ParseError(
        `${fn} espera ${arity} argumento${arity === 1 ? '' : 's'}, recebi ${args.length}`,
        name.at,
      );
    }
    return { kind: 'call', fn, args };
  }

  const tree = parseExpr();
  if (peek().kind !== 'end') {
    throw new ParseError(`sobrou ${describe(peek())} no fim da expressão`, peek().at);
  }
  return tree;
}

// -------------------------------------------------------------- avaliação

/** Percorre a AST e devolve o número. Nenhum código é gerado em momento algum. */
export function evaluateNode(node: Node, x: Float64Array): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var':
      return x[node.index]!;
    case 'neg':
      return -evaluateNode(node.arg, x);
    case 'bin': {
      const a = evaluateNode(node.left, x);
      const b = evaluateNode(node.right, x);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return Math.pow(a, b);
      }
    }
    // eslint-disable-next-line no-fallthrough -- o switch acima é exaustivo
    case 'call': {
      const args = node.args.map((arg) => evaluateNode(arg, x));
      return FUNCTIONS[node.fn].apply(args);
    }
  }
}

/** Nomes que o editor pode oferecer ao aluno. */
export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS);
export const CONSTANT_NAMES: readonly string[] = Object.keys(CONSTANTS);
