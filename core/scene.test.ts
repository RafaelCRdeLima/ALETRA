/**
 * O formato de cena, incluindo o critério de verificação que a Etapa 4 exige:
 * medir o comprimento da URL das cenas de exemplo e confirmar que fica bem
 * abaixo do limiar de risco.
 *
 * A parte mais importante daqui é a recusa. Uma cena chega de uma URL que
 * qualquer pessoa monta e manda para um aluno; o parser de métrica já é seguro
 * por D4, mas a estrutura precisa ser validada com a mesma seriedade.
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLES, exampleToScene, sceneToExample, type MetricExample } from './examples';
import {
  SceneError,
  sceneFromParam,
  sceneFromText,
  sceneToParam,
  sceneToText,
  type SceneDoc,
} from './scene';

const girar = (c: readonly number[]): number[] => [-c[1]!, c[0]!];

const cenaDe = (example: MetricExample): SceneDoc =>
  exampleToScene(example, {
    ponto: example.initialPoint,
    vetor: example.initialVector,
    omega: example.initialOmega,
    eta: girar(example.initialOmega),
    u: girar(example.initialVector),
    laco: [0.8, 1.1],
    modo: 'uma',
    bemol: 0.4,
    metrica: example.components,
    campos: {
      omega: ['1 - y', 'x'],
      f: 'x*y',
      usarDf: false,
      x: ['1', '0'],
      y: ['0', '1 + x'],
      passo: 1.2,
    },
  });

const BASE: SceneDoc = cenaDe(EXAMPLES[0]!);

describe('ida e volta', () => {
  it('texto → cena → texto é estável para todos os exemplos', () => {
    for (const example of EXAMPLES) {
      const cena = cenaDe(example);
      expect(sceneFromText(sceneToText(cena))).toEqual(cena);
    }
  });

  it('URL → cena → URL é estável para todos os exemplos', () => {
    for (const example of EXAMPLES) {
      const cena = cenaDe(example);
      expect(sceneFromParam(sceneToParam(cena))).toEqual(cena);
    }
  });

  it('preserva a métrica como digitada, não como compilada', () => {
    const cena: SceneDoc = { ...BASE, metrica: ['1', '0', 'sin(theta)^2'] };
    expect(sceneFromParam(sceneToParam(cena)).metrica).toEqual(['1', '0', 'sin(theta)^2']);
  });

  it('sobrevive a acento no texto da nota', () => {
    const cena: SceneDoc = { ...BASE, nota: 'Órbita à beira do horizonte — atenção às unidades' };
    expect(sceneFromParam(sceneToParam(cena)).nota).toBe(cena.nota);
  });

  it('uma cena vira exemplo e volta sem perder nada relevante', () => {
    const exemplo = sceneToExample(BASE);
    expect(exemplo.chart.names).toEqual(BASE.carta);
    expect(exemplo.components).toEqual(BASE.metrica);
    expect(exemplo.maxVector).toBe(BASE.maxVetor);
  });

  it('o mergulho atravessa como identificador, sem tradução', () => {
    // Havia um mapeamento 'esfera' ⇄ 'sphere' aqui, de quando o único mergulho
    // era a esfera e o código falava inglês. Com o catálogo de superfícies o id
    // passou a ser o mesmo dos dois lados, e a tradução deixou de existir —
    // menos uma camada onde os dois nomes podiam divergir.
    expect(sceneToExample(BASE).embedding).toBe(BASE.mergulho);

    const semMergulho: SceneDoc = { ...BASE, mergulho: null };
    expect(sceneToExample(semMergulho).embedding).toBeNull();
  });

  it('aceita todas as superfícies do catálogo', () => {
    for (const id of ['esfera', 'cilindro', 'cone', 'toro']) {
      expect(sceneFromText(JSON.stringify({ ...BASE, mergulho: id })).mergulho).toBe(id);
    }
  });
});

describe('comprimento da URL (critério de verificação da Etapa 4)', () => {
  /**
   * O limiar conservador de URL é ~2 KB. O teto aqui é metade disso: sobra
   * folga de verdade e ainda assim o teste quebra quando o formato cresce
   * demais, que é o gatilho que D14 mandou vigiar.
   *
   * Já quebrou uma vez, e funcionou: os campos digitados das Etapas 6 e 7
   * levaram as cenas de ~580 para ~745 caracteres.
   */
  const TETO = 1000;

  it('fica muito abaixo do limiar de risco de 2 KB', () => {
    for (const example of EXAMPLES) {
      const url = `https://rafaelcrdelima.github.io/ALETRA/?cena=${sceneToParam(cenaDe(example))}`;
      expect(url.length, `URL de ${example.label}`).toBeLessThan(TETO);
    }
  });
});

describe('recusa de entrada malformada', () => {
  const recusa = (mudanca: Record<string, unknown>, padrao: RegExp): void => {
    expect(() => sceneFromText(JSON.stringify({ ...BASE, ...mudanca }))).toThrow(padrao);
  };

  it('recusa JSON malformado', () => {
    expect(() => sceneFromText('{ nem json')).toThrow(/JSON malformado/);
  });

  it('recusa versão desconhecida', () => {
    recusa({ versao: 7 }, /versão 7/);
  });

  it('recusa arrays com tamanho errado', () => {
    recusa({ ponto: [1] }, /cena\.ponto: esperava 2 números/);
    recusa({ metrica: ['1', '0'] }, /cena\.metrica: esperava 3 itens/);
  });

  it('recusa números não finitos', () => {
    recusa({ vetor: [1, null] }, /esperava um número finito/);
    recusa({ maxVetor: 'grande' }, /esperava um número finito/);
  });

  it('recusa nome de coordenada que o parser não aceitaria', () => {
    recusa({ carta: ['x', '2y'] }, /não é um nome de coordenada válido/);
    recusa({ carta: ['x', 'y z'] }, /não é um nome de coordenada válido/);
  });

  it('recusa limites invertidos', () => {
    recusa({ limites: { min: [1, 0], max: [0, 1] } }, /máximo de .* maior que o mínimo/);
  });

  it('recusa maxVetor não positivo e bemol fora de [0,1]', () => {
    recusa({ maxVetor: 0 }, /tem de ser positivo/);
    recusa({ bemol: 1.5 }, /entre 0 e 1/);
  });

  it('recusa mergulho fora do catálogo', () => {
    // Já foi 'toro' o exemplo de desconhecido aqui — e o toro virou conhecido.
    // Um nome que o produto nunca vai desenhar serve melhor ao papel.
    recusa({ mergulho: 'garrafa-de-klein' }, /cena\.mergulho: só/);
  });

  it('recusa modo desconhecido', () => {
    recusa({ modo: 'tres' }, /cena\.modo: só/);
  });

  it('aceita todos os modos conhecidos', () => {
    for (const modo of ['uma', 'duas', 'derivada', 'colchete'] as const) {
      expect(sceneFromText(JSON.stringify({ ...BASE, modo })).modo).toBe(modo);
    }
  });

  it('recusa texto longo demais — o campo não é um canal de carga', () => {
    recusa({ nota: 'x'.repeat(500) }, /longo demais/);
  });

  it('recusa a raiz que não é objeto', () => {
    expect(() => sceneFromText('[1,2,3]')).toThrow(SceneError);
    expect(() => sceneFromText('"cena"')).toThrow(SceneError);
    expect(() => sceneFromText('null')).toThrow(SceneError);
  });

  it('recusa parâmetro de URL corrompido', () => {
    expect(() => sceneFromParam('!!!não é base64!!!')).toThrow(SceneError);
  });

  it('não carrega campos extras que alguém tenha enfiado no JSON', () => {
    const cena = sceneFromText(JSON.stringify({ ...BASE, malicioso: 'oi', __proto__: {} }));
    expect(Object.hasOwn(cena, 'malicioso')).toBe(false);
  });
});

describe('os campos digitados das Etapas 6 e 7', () => {
  it('sobrevivem à ida e volta pela URL', () => {
    const restaurada = sceneFromParam(sceneToParam(BASE));
    expect(restaurada.campos).toEqual(BASE.campos);
  });

  it('são opcionais — uma cena sem eles carrega com campos nulos', () => {
    const { campos: _c, ...semCampos } = BASE;
    expect(sceneFromText(JSON.stringify(semCampos)).campos).toBeNull();
  });

  it('são validados com o mesmo rigor do resto', () => {
    const comCampos = (mudanca: Record<string, unknown>): string =>
      JSON.stringify({ ...BASE, campos: { ...BASE.campos, ...mudanca } });

    expect(() => sceneFromText(comCampos({ passo: -1 }))).toThrow(/passo: tem de ser positivo/);
    expect(() => sceneFromText(comCampos({ usarDf: 'sim' }))).toThrow(/verdadeiro ou falso/);
    expect(() => sceneFromText(comCampos({ x: ['1'] }))).toThrow(/campos\.x: esperava 2/);
    expect(() => sceneFromText(comCampos({ f: 'z'.repeat(500) }))).toThrow(/longo demais/);
  });
});

describe('compatibilidade com endereços gerados antes da Etapa 5', () => {
  it('preenche η e u com a rotação de 90° quando faltam', () => {
    const { eta: _e, u: _u, modo: _m, laco: _l, ...semEtapa5 } = BASE;
    const cena = sceneFromText(JSON.stringify(semEtapa5));

    expect(cena.eta).toEqual([-BASE.omega[1]!, BASE.omega[0]!]);
    expect(cena.u).toEqual([-BASE.vetor[1]!, BASE.vetor[0]!]);
    expect(cena.modo).toBe('uma');
    // O laço não tem padrão no formato: quem sabe dimensioná-lo é a interface,
    // que conhece os limites da carta. Nulo aqui quer dizer "use o seu padrão".
    expect(cena.laco).toBeNull();
  });

  it('o laço sobrevive à ida e volta quando existe', () => {
    expect(sceneFromParam(sceneToParam(BASE)).laco).toEqual([0.8, 1.1]);
  });

  it('o padrão nunca produz um ladrilho vazio', () => {
    // η paralelo a ω daria ω∧η = 0 e nenhuma célula para contar — a pior
    // primeira impressão possível para uma etapa que se chama "contar células".
    const { eta: _e, ...semEta } = BASE;
    const cena = sceneFromText(JSON.stringify(semEta));
    const sigma = cena.omega[0]! * cena.eta[1]! - cena.omega[1]! * cena.eta[0]!;
    expect(Math.abs(sigma)).toBeGreaterThan(0);
  });
});

describe('cena editada à mão', () => {
  it('carrega um arquivo escrito do zero, sem passar pela interface', () => {
    const escritoAMao = `{
      "versao": 1,
      "carta": ["u", "w"],
      "metrica": ["1 + u^2", "0", "1"],
      "limites": { "min": [-2, -2], "max": [2, 2] },
      "ponto": [0.5, 0],
      "vetor": [0.4, 0.3],
      "omega": [2, 1],
      "maxVetor": 1.5,
      "bemol": 0,
      "mergulho": null,
      "rotulo": "Uma sela",
      "nota": "Métrica inventada à mão para testar o formato."
    }`;
    const cena = sceneFromText(escritoAMao);
    expect(cena.carta).toEqual(['u', 'w']);
    expect(cena.metrica[0]).toBe('1 + u^2');
    expect(cena.rotulo).toBe('Uma sela');
  });
});
