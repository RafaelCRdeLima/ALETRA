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

const cenaDe = (example: MetricExample): SceneDoc =>
  exampleToScene(example, {
    ponto: example.initialPoint,
    vetor: example.initialVector,
    omega: example.initialOmega,
    bemol: 0.4,
    metrica: example.components,
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

  it('traduz o mergulho entre o arquivo (português) e o código (inglês)', () => {
    expect(BASE.mergulho).toBe('esfera');
    expect(sceneToExample(BASE).embedding).toBe('sphere');

    const semMergulho: SceneDoc = { ...BASE, mergulho: null };
    expect(sceneToExample(semMergulho).embedding).toBeNull();
  });
});

describe('comprimento da URL (critério de verificação da Etapa 4)', () => {
  it('fica muito abaixo do limiar de risco de 2 KB', () => {
    for (const example of EXAMPLES) {
      const url = `https://rafaelcrdelima.github.io/ALETRA/?cena=${sceneToParam(cenaDe(example))}`;
      expect(url.length).toBeLessThan(700);
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

  it('recusa mergulho desconhecido', () => {
    recusa({ mergulho: 'toro' }, /só "esfera" ou nulo/);
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
