import { describe, expect, it } from 'vitest';
import { evaluateNode, parse, ParseError } from './expr';

const VARS = ['theta', 'phi'] as const;
const evalAt = (source: string, theta = 0.7, phi = 0.3): number =>
  evaluateNode(parse(source, VARS), Float64Array.from([theta, phi]));

describe('gramática', () => {
  it('respeita precedência e associatividade', () => {
    expect(evalAt('1 + 2 * 3')).toBe(7);
    expect(evalAt('(1 + 2) * 3')).toBe(9);
    expect(evalAt('8 / 4 / 2')).toBe(1); // divisão associa à esquerda
    expect(evalAt('2 ^ 3 ^ 2')).toBe(512); // potência associa à direita
    expect(evalAt('-2 ^ 2')).toBe(-4); // unário aplica depois da potência
  });

  it('lê variáveis da carta e constantes', () => {
    expect(evalAt('theta', 1.25)).toBe(1.25);
    expect(evalAt('phi', 0, 2.5)).toBe(2.5);
    expect(evalAt('pi')).toBeCloseTo(Math.PI, 15);
    expect(evalAt('e')).toBeCloseTo(Math.E, 15);
  });

  it('aceita as funções da lista branca', () => {
    expect(evalAt('sin(theta)^2', 0.7)).toBeCloseTo(Math.sin(0.7) ** 2, 14);
    expect(evalAt('sqrt(4)')).toBe(2);
    expect(evalAt('atan2(1, 1)')).toBeCloseTo(Math.PI / 4, 14);
    expect(evalAt('pow(2, 10)')).toBe(1024);
  });

  it('lê as métricas de interesse do escopo', () => {
    const hyper = parse('1/y^2', ['x', 'y']);
    expect(evaluateNode(hyper, Float64Array.from([0, 2]))).toBeCloseTo(0.25, 14);
    const schwarz = parse('1/(1 - 2/r)', ['r', 'phi']);
    expect(evaluateNode(schwarz, Float64Array.from([4, 0]))).toBeCloseTo(2, 14);
  });

  it('aceita números decimais e sinais encadeados', () => {
    expect(evalAt('0.5')).toBe(0.5);
    expect(evalAt('.25')).toBe(0.25);
    expect(evalAt('--3')).toBe(3);
    expect(evalAt('2 * -3')).toBe(-6);
  });
});

describe('mensagens de erro — legíveis, sem jargão de exceção JS (D4)', () => {
  const erro = (source: string, vars: readonly string[] = VARS): string => {
    try {
      parse(source, vars);
    } catch (e) {
      return (e as ParseError).message;
    }
    return '(não deu erro)';
  };

  it('nomeia a variável desconhecida e lista as disponíveis', () => {
    expect(erro('r + 1')).toMatch(/não conheço "r"/);
    expect(erro('r + 1')).toMatch(/theta, phi/);
  });

  it('nomeia a função desconhecida', () => {
    expect(erro('sen(theta)')).toMatch(/não conheço a função "sen"/);
  });

  it('reclama de aridade errada', () => {
    expect(erro('sin(theta, phi)')).toMatch(/sin espera 1 argumento, recebi 2/);
    expect(erro('atan2(theta)')).toMatch(/atan2 espera 2 argumentos, recebi 1/);
  });

  it('aponta o parêntese não fechado', () => {
    expect(erro('(1 + 2')).toMatch(/faltou fechar o parêntese/);
  });

  it('reclama do operador sem operando', () => {
    expect(erro('1 /')).toMatch(/esperava um número, uma variável ou "\("/);
  });

  it('reclama de sobra no fim', () => {
    expect(erro('1 + 2)')).toMatch(/sobrou/);
  });

  it('avisa quando a função foi usada sem parênteses', () => {
    expect(erro('sin')).toMatch(/precisa de parênteses/);
  });

  it('carrega a posição do erro, para o editor destacar', () => {
    try {
      parse('1 + zzz', VARS);
    } catch (e) {
      expect((e as ParseError).position).toBe(4);
    }
  });
});

describe('superfície de ataque fechada (D4)', () => {
  // A cena viaja na URL e roda ao abrir o link. Nada aqui pode virar código.
  const hostis = [
    // Os quatro primeiros vêm de Object.prototype: com `in`/indexação crua eles
    // atravessam a lista branca sem estar declarados nela. Regressão travada.
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    'this',
    'window',
    'globalThis',
    'alert(1)',
    'process',
    '__proto__',
    'eval(1)',
    'Function("return 1")',
    'require("fs")',
    'fetch("http://x")',
    '[].map',
  ];

  it('recusa todo identificador fora da lista branca', () => {
    for (const source of hostis) {
      expect(() => parse(source, VARS)).toThrow(ParseError);
    }
  });

  it('não tem caminho de escape por símbolos', () => {
    for (const source of ['1; 2', 'a=>a', '`x`', '1 || 2', '{}', 'x[0]']) {
      expect(() => parse(source, VARS)).toThrow();
    }
  });
});
