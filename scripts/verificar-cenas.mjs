/**
 * Verificação visual das cenas — o `pnpm test` cobre `core/`, isto cobre o resto.
 *
 * O PLAN.md diz que `render/` e `app/` são verificados visualmente a cada etapa,
 * porque não há sentido em testar automaticamente "isto parece certo para um
 * aluno". Este script não tenta julgar isso: ele carrega cada exemplo, conta o
 * que dá para contar (folhas desenhadas, células hachuradas), exercita os dois
 * critérios de erro da Etapa 2, e deixa os PNGs para um humano olhar.
 *
 * Precisa do dev server no ar:  pnpm dev
 * Uso:                          pnpm verificar [diretório-de-saída]
 */
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? process.env.TMPDIR ?? '/tmp';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForSelector('.chart-panel .folha');

for (const id of ['esfera', 'hiperbolico', 'schwarzschild']) {
  await page.selectOption('#seletor', id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/etapa2-${id}.png` });
  const numeral = await page.textContent('#numeral-value');
  const folhas = await page.locator('.chart-panel .folha').count();
  const hachura = await page.locator('.camada-hachura rect').count();
  console.log(`${id}: ⟨ω,v⟩=${numeral} folhas=${folhas} células-hachuradas=${hachura}`);
}

// Componentes de v: têm de acompanhar o arraste e, ao contrário, mover o vetor
// quando digitadas. Se um dos dois lados quebrar, o campo vira enfeite.
console.log('\n— componentes do vetor —');
{
  await page.selectOption('#seletor', 'esfera');
  await page.waitForTimeout(500);
  const campos = page.locator('#campos-vetor input');
  const ler = async () => [await campos.nth(0).inputValue(), await campos.nth(1).inputValue()];
  const antes = await ler();

  // Arrasta a ponta para o lado oposto do ponto base: o vetor inverte e os
  // componentes trocam de sinal. Um deslocamento qualquer não serviria — na
  // esfera v já está no limite de |v|_g, então arrastar só o gira, e arrastar
  // quase na direção dele não mudaria nada visível.
  const base = await page.locator('.alca-ponto').boundingBox();
  const ponta = await page.locator('.alca-ponta').boundingBox();
  const bx = base.x + base.width / 2;
  const by = base.y + base.height / 2;
  const tx = ponta.x + ponta.width / 2;
  const ty = ponta.y + ponta.height / 2;

  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(bx - (tx - bx), by - (ty - by), { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const depois = await ler();
  console.log(
    `arraste: v⁰ ${antes[0]}→${depois[0]}, v¹ ${antes[1]}→${depois[1]}` +
      `  ${antes[0] !== depois[0] || antes[1] !== depois[1] ? '✓ acompanhou' : '✗ NÃO ACOMPANHOU'}`,
  );

  // A conferência lê ω da própria página: número fixo aqui só serviria para
  // dar falso negativo no dia em que o exemplo mudasse de valores iniciais.
  await campos.nth(0).fill('0,20');
  await campos.nth(1).fill('0,40');
  await page.locator('#seletor').focus();
  await page.waitForTimeout(400);

  const num = (t) => Number(t.replace('.', '').replace(',', '.'));
  const w0 = num(await page.locator('#omega-0-out').textContent());
  const w1 = num(await page.locator('#omega-1-out').textContent());
  const mostrado = num((await page.textContent('#numeral-value')).trim());
  const esperado = w0 * 0.2 + w1 * 0.4;
  console.log(
    `digitado v=(0,20; 0,40) com ω=(${w0}; ${w1}) → mostrado ${mostrado}, ` +
      `esperado ${esperado.toFixed(2)}  ${Math.abs(mostrado - esperado) < 0.01 ? '✓' : '✗ DIVERGE'}`,
  );
}
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.chart-panel .folha');

// Etapa 3: a tese é que ♭ só faz alguma coisa porque a métrica não é euclidiana.
// Se v♭ diferisse de v no plano euclidiano, ou coincidisse na esfera, a etapa
// inteira estaria mentindo.
console.log('\n— ♯ e ♭ —');
for (const id of ['euclidiano', 'esfera']) {
  await page.selectOption('#seletor', id);
  await page.waitForTimeout(500);
  const campos = page.locator('#campos-vetor input');
  const v = [await campos.nth(0).inputValue(), await campos.nth(1).inputValue()];
  const texto = (await page.textContent('#v-bemol')).trim();
  const bemol = texto.match(/\(([^;]+);([^)]+)\)/).slice(1, 3).map((s) => s.trim());
  const iguais = v[0] === bemol[0] && v[1] === bemol[1];
  const esperado = id === 'euclidiano';
  console.log(
    `${id}: v=(${v.join(' ; ')})  v♭=(${bemol.join(' ; ')})  ` +
      `${iguais === esperado ? '✓' : '✗ INESPERADO'} ${iguais ? 'coincidem' : 'diferem'}`,
  );
}

// A morfose tem de fazer a pilha de v♭ aparecer e a de ω recuar.
{
  await page.locator('#bemol').fill('1');
  await page.waitForTimeout(600);
  const folhasBemol = await page.locator('.chart-panel .folha-bemol').count();
  const opacidadeOmega = await page
    .locator('.chart-panel .folha')
    .first()
    .getAttribute('opacity');
  await page.screenshot({ path: `${OUT}/bemol-esfera.png` });
  await page.selectOption('#seletor', 'euclidiano');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/bemol-euclidiano.png` });
  console.log(
    `morfose em 1: folhas de v♭ = ${folhasBemol}, opacidade de ω = ${Number(opacidadeOmega).toFixed(2)}`,
  );
  await page.locator('#bemol').fill('0');
  await page.waitForTimeout(300);
}
await page.selectOption('#seletor', 'esfera');
await page.waitForTimeout(400);

// D7 ao vivo: arrastar o ponto contra o polo tem de recusar o movimento e dizer
// que ali a carta falha — não que a geometria falha.
await page.selectOption('#seletor', 'esfera');
await page.waitForTimeout(400);
{
  const box = await page.locator('.chart-panel').boundingBox();
  const alca = page.locator('.alca-ponto');
  const p = await alca.boundingBox();
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 2, p.y + p.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const aviso = (await page.textContent('#aviso-singularidade'))?.trim();
  console.log('polo da esfera:', aviso ? aviso.slice(0, 72) + '…' : '(nenhum aviso)');
  await page.screenshot({ path: `${OUT}/etapa2-polo.png` });
}

// Métrica com erro de sintaxe proposital (critério de verificação da Etapa 2).
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.chart-panel .folha');
const campo = page.locator('#campos-metrica input').nth(2);
await campo.fill('sen(theta)^2');
await page.waitForTimeout(400);
console.log('erro de sintaxe:', (await page.textContent('#erro-metrica'))?.trim());
await page.screenshot({ path: `${OUT}/etapa2-erro.png` });

// Métrica degenerada proposital.
await campo.fill('0');
await page.waitForTimeout(500);
const hachuraDegenerada = await page.locator('.camada-hachura rect').count();
console.log('g=0 → células hachuradas:', hachuraDegenerada);
await page.screenshot({ path: `${OUT}/etapa2-degenerada.png` });

// Etapa 5: contar células. O critério visual do PLAN.md é que trocar a ordem de
// ω e η inverta a orientação — o que na leitura aparece como o número trocando
// de sinal sem mudar de módulo.
console.log('\n— ∧ e a contagem de células —');
{
  await page.selectOption('#seletor', 'euclidiano');
  await page.waitForTimeout(400);
  await page.selectOption('#modo', 'duas');
  await page.waitForTimeout(600);

  const num = (t) => Number(t.replace(/\./g, '').replace(',', '.'));
  const lerNumeral = async () => num((await page.textContent('#numeral-value')).trim());
  const rotulo = (await page.textContent('#numeral-label')).trim();

  const w = [num(await page.textContent('#omega-0-out')), num(await page.textContent('#omega-1-out'))];
  const e = [num(await page.textContent('#eta-0-out')), num(await page.textContent('#eta-1-out'))];
  const v = [
    num(await page.locator('#campos-vetor input').nth(0).inputValue()),
    num(await page.locator('#campos-vetor input').nth(1).inputValue()),
  ];
  const u = [
    num(await page.locator('#campos-u input').nth(0).inputValue()),
    num(await page.locator('#campos-u input').nth(1).inputValue()),
  ];

  const sigma = w[0] * e[1] - w[1] * e[0];
  const esperado = sigma * (u[0] * v[1] - u[1] * v[0]);
  const mostrado = await lerNumeral();
  console.log(`rótulo: ${rotulo}`);
  console.log(
    `  σ = ${sigma.toFixed(2)}, det[u v] = ${(u[0] * v[1] - u[1] * v[0]).toFixed(3)} → ` +
      `esperado ${esperado.toFixed(2)}, mostrado ${mostrado.toFixed(2)}  ` +
      `${Math.abs(esperado - mostrado) < 0.02 ? '✓' : '✗ DIVERGE'}`,
  );
  console.log(`  glosa: "${(await page.textContent('#numeral-gloss')).trim()}"`);

  const celulas = await page.locator('.camada-celula polygon').count();
  const folhasEta = await page.locator('.chart-panel .folha-eta').count();
  // As células têm de estar *pintadas*, não só implícitas no cruzamento das
  // linhas — uma regra de CSS com `fill` já engoliu esse padrão uma vez.
  const preenchimento = await page.locator('.camada-celula polygon').getAttribute('fill');
  console.log(
    `  paralelogramo desenhado=${celulas === 1}, folhas de η = ${folhasEta}, ` +
      `células pintadas=${preenchimento?.includes('url(#celulas)') ? '✓' : `✗ (${preenchimento})`}`,
  );
  await page.screenshot({ path: `${OUT}/duas-formas.png` });

  // Os dois vetores têm de respeitar o mesmo teto de |·|_g. Recortar só v
  // deixava u passar do disco tangente, e o disco é o desenho do plano tangente.
  await page.selectOption('#seletor', 'esfera');
  await page.waitForTimeout(500);
  const comprimento = await page.evaluate(() => {
    const ler = (sel) =>
      [...document.querySelectorAll(sel)].map((i) => Number(i.value.replace(',', '.')));
    return { v: ler('#campos-vetor input'), u: ler('#campos-u input') };
  });
  // θ do ponto inicial da esfera; o teste não move o ponto. g = diag(1, sin²θ).
  const THETA = 1.15;
  const TETO = 0.42; // maxVector do exemplo da esfera
  const normaG = (c) => Math.sqrt(c[0] ** 2 + Math.sin(THETA) ** 2 * c[1] ** 2);
  const teto = TETO;
  console.log(
    `  |v|_g = ${normaG(comprimento.v).toFixed(3)}, |u|_g = ${normaG(comprimento.u).toFixed(3)} ` +
      `(teto ${teto})  ${normaG(comprimento.u) <= teto + 0.005 ? '✓ u recortado' : '✗ u ESCAPOU'}`,
  );
  await page.screenshot({ path: `${OUT}/duas-formas-esfera.png` });
  await page.selectOption('#seletor', 'euclidiano');
  await page.waitForTimeout(400);

  // Trocar ω por η inverte a orientação: mesmo módulo, sinal oposto.
  await page.locator('#omega-0').fill(String(e[0]));
  await page.locator('#omega-1').fill(String(e[1]));
  await page.locator('#eta-0').fill(String(w[0]));
  await page.locator('#eta-1').fill(String(w[1]));
  await page.waitForTimeout(500);
  const trocado = await lerNumeral();
  console.log(
    `  ω↔η: ${mostrado.toFixed(2)} → ${trocado.toFixed(2)}  ` +
      `${Math.abs(trocado + mostrado) < 0.02 ? '✓ inverteu' : '✗ NÃO INVERTEU'}`,
  );

  await page.selectOption('#modo', 'uma');
  await page.waitForTimeout(300);
}

// Etapa 6: d. O critério é o zero de d² aparecer *no desenho* — as células
// acabando — e não como um texto dizendo que deu zero.
console.log('\n— d e o colapso de d² —');
{
  await page.selectOption('#seletor', 'euclidiano');
  await page.selectOption('#modo', 'derivada');
  await page.waitForTimeout(700);

  const num = (t) => Number(t.replace(/\./g, '').replace(',', '.'));
  const lerNumeral = async () => num((await page.textContent('#numeral-value')).trim());
  const pintadas = async () =>
    ((await page.locator('.camada-celula polygon').getAttribute('fill')) ?? '').includes(
      'url(#celulas)',
    );

  const u = [
    num(await page.locator('#campos-u input').nth(0).inputValue()),
    num(await page.locator('#campos-u input').nth(1).inputValue()),
  ];
  const v = [
    num(await page.locator('#campos-vetor input').nth(0).inputValue()),
    num(await page.locator('#campos-vetor input').nth(1).inputValue()),
  ];
  // ω = (1-y) dx + x dy  ⟹  dω = 2 dx∧dy (a constante não sobrevive à derivada)
  const esperado = 2 * (u[0] * v[1] - u[1] * v[0]);
  const circulacao = await lerNumeral();
  const omegaLido = `${await page.locator('#campo-omega-0').inputValue()}, ${await page
    .locator('#campo-omega-1')
    .inputValue()}`;
  console.log(`  rótulo: ${(await page.textContent('#numeral-label')).trim()}`);
  console.log(
    `  ω = (${omegaLido}) → dω(u,v) = ${circulacao.toFixed(2)}, esperado ${esperado.toFixed(2)}  ` +
      `${Math.abs(circulacao - esperado) < 0.02 ? '✓' : '✗ DIVERGE'}`,
  );
  console.log(`  células pintadas: ${(await pintadas()) ? '✓ há o que contar' : '✗'}`);
  await page.screenshot({ path: `${OUT}/derivada.png` });

  // d² = 0: trocar ω por df tem de zerar a circulação e apagar o ladrilho.
  await page.locator('#usar-df').check();
  await page.waitForTimeout(700);
  const depois = await lerNumeral();
  const aindaPintadas = await pintadas();
  console.log(
    `  ω = df → dω(u,v) = ${depois.toFixed(4)}  ` +
      `${Math.abs(depois) < 0.01 ? '✓ colapsou' : '✗ NÃO COLAPSOU'}; ` +
      `células pintadas: ${aindaPintadas ? '✗ ainda há ladrilho' : '✓ ladrilho sumiu'}`,
  );
  await page.screenshot({ path: `${OUT}/derivada-d2.png` });

  // Trocar de carta não pode deixar uma expressão em x,y numa carta (θ,φ).
  await page.locator('#usar-df').uncheck();
  await page.selectOption('#seletor', 'esfera');
  await page.waitForTimeout(700);
  const erro = (await page.textContent('#erro-metrica'))?.trim();
  console.log(
    `  troca para a esfera: ω = (${await page.locator('#campo-omega-0').inputValue()}, ` +
      `${await page.locator('#campo-omega-1').inputValue()}), erro="${erro}"`,
  );

  await page.selectOption('#modo', 'uma');
  await page.waitForTimeout(300);
}

// Etapa 7: o quadrilátero que não fecha. O critério do plano é que campos
// coordenados fechem e campos que não comutam abram — e que o vão escale com t².
console.log('\n— colchete de Lie —');
{
  await page.selectOption('#seletor', 'euclidiano');
  await page.selectOption('#modo', 'colchete');
  await page.waitForTimeout(700);

  const num = (t) => Number(t.replace(/\./g, '').replace(',', '.'));
  const vao = async () => num((await page.textContent('#numeral-value')).trim());
  // O texto da glosa é "t²·|[X, Y]| = 1,00": tirar tudo que não é dígito
  // engoliria a vírgula de "[X, Y]" junto. O número é o que vem depois do "=".
  const previsto = async () =>
    num((await page.textContent('#numeral-gloss')).split('=').pop().trim());

  const campos = async () =>
    `X=(${await page.locator('#campo-x-0').inputValue()},${await page
      .locator('#campo-x-1')
      .inputValue()}), Y=(${await page.locator('#campo-y-0').inputValue()},${await page
      .locator('#campo-y-1')
      .inputValue()})`;

  const aberto = await vao();
  console.log(
    `  ${await campos()}: vão = ${aberto.toFixed(4)}, ` +
      `t²·|[X,Y]| = ${(await previsto()).toFixed(4)}  ` +
      `${aberto > 0.05 ? '✓ não fecha' : '✗ FECHOU'}`,
  );
  await page.screenshot({ path: `${OUT}/colchete.png` });

  // Campos coordenados comutam: o quadrilátero tem de fechar.
  await page.locator('#campo-y-1').fill('1');
  await page.waitForTimeout(600);
  const fechado = await vao();
  console.log(
    `  X=(1,0), Y=(0,1): vão = ${fechado.toFixed(4)}  ` +
      `${fechado < 0.005 ? '✓ fecha' : '✗ NÃO FECHOU'}`,
  );
  await page.screenshot({ path: `${OUT}/colchete-fecha.png` });

  // O vão escala com t²: metade do passo, um quarto do vão.
  await page.locator('#campo-y-1').fill('x');
  await page.locator('#tempo-fluxo').fill('0.4');
  await page.waitForTimeout(600);
  const grande = await vao();
  await page.locator('#tempo-fluxo').fill('0.2');
  await page.waitForTimeout(600);
  const pequeno = await vao();
  const razao = grande / pequeno;
  console.log(
    `  t: 0,40 → 0,20 dá vão ${grande.toFixed(4)} → ${pequeno.toFixed(4)}, razão ${razao.toFixed(2)}  ` +
      `${razao > 3.5 && razao < 4.5 ? '✓ escala com t²' : '✗ ESCALA ERRADA'}`,
  );

  await page.selectOption('#modo', 'uma');
  await page.waitForTimeout(300);
}

// Etapa 8: Gauss-Bonnet na tela. O critério do plano é o ângulo bater com a
// área cercada na esfera, e o laço euclidiano devolver o vetor idêntico.
console.log('\n— holonomia —');
{
  const num = (t) => Number(t.replace(/\./g, '').replace(',', '.'));
  const angulo = async () => num((await page.textContent('#numeral-value')).trim());
  const area = async () =>
    num((await page.textContent('#numeral-gloss')).split('=').pop().replace(/[^\d,.-]/g, ''));

  await page.selectOption('#seletor', 'esfera');
  await page.selectOption('#modo', 'holonomia');
  await page.waitForTimeout(800);
  const a = await angulo();
  const s = await area();
  console.log(
    `  esfera: ângulo = ${a.toFixed(3)} rad, área cercada = ${s.toFixed(3)}  ` +
      `${Math.abs(Math.abs(a) - s) < 0.02 ? '✓ Gauss-Bonnet' : '✗ DIVERGE'}`,
  );
  const laco = await page.locator('.chart-panel .laco').count();
  const transportado = await page.locator('.chart-panel .vetor-transportado').count();
  console.log(`  laço desenhado=${laco === 1}, vetor transportado desenhado=${transportado === 1}`);
  await page.screenshot({ path: `${OUT}/holonomia.png` });

  await page.selectOption('#seletor', 'euclidiano');
  await page.waitForTimeout(800);
  const plano = await angulo();
  console.log(
    `  euclidiano: ângulo = ${plano.toFixed(4)} rad  ` +
      `${Math.abs(plano) < 0.005 ? '✓ volta idêntico' : '✗ GIROU'}`,
  );
  await page.screenshot({ path: `${OUT}/holonomia-plana.png` });

  await page.selectOption('#seletor', 'hiperbolico');
  await page.waitForTimeout(800);
  const hip = await angulo();
  // O sinal absoluto depende da orientação do laço, que muda com o padrão de
  // cada exemplo — o que tem conteúdo é a esfera e o hiperbólico girarem para
  // lados **opostos**, porque K tem sinais opostos. Comparar com zero, como esta
  // linha fazia antes, era testar a orientação por acidente.
  console.log(
    `  hiperbólico: ângulo = ${hip.toFixed(3)} rad (esfera ${a.toFixed(3)})  ` +
      `${Math.sign(hip) === -Math.sign(a) ? '✓ gira para o outro lado' : '✗ MESMO SENTIDO'}`,
  );

  await page.selectOption('#seletor', 'esfera');
  await page.selectOption('#modo', 'uma');
  await page.waitForTimeout(300);
}

// Etapa 4: o critério é ida e volta *de verdade* — alterar a cena, copiar o
// link, abrir numa aba nova sem estado nenhum, e conferir que voltou igual.
// Recarregar a mesma aba não provaria nada: sobreviveria a qualquer cache.
console.log('\n— cena na URL —');
{
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await p.waitForSelector('.chart-panel .folha');

  // Uma cena que ninguém teria por acidente: métrica digitada à mão, vetor
  // alterado, morfose no meio.
  await p.locator('#campos-metrica input').nth(2).fill('sin(theta)^2 * 0.6');
  await p.locator('#campos-vetor input').nth(0).fill('0,17');
  await p.locator('#bemol').fill('0.5');
  await p.locator('#omega-0').fill('4.3');
  await p.waitForTimeout(500);

  const antes = {
    metrica: await p.locator('#campos-metrica input').nth(2).inputValue(),
    v0: await p.locator('#campos-vetor input').nth(0).inputValue(),
    numeral: (await p.textContent('#numeral-value')).trim(),
    bemolLido: (await p.textContent('#v-bemol')).trim(),
  };

  await p.locator('#copiar').click();
  await p.waitForTimeout(400);
  const url = await p.evaluate(() => navigator.clipboard.readText());
  console.log(`link com ${url.length} caracteres`);

  // Aba nova, contexto novo: nada de localStorage, cookie ou histórico.
  const limpa = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const q = await limpa.newPage();
  await q.goto(url, { waitUntil: 'networkidle' });
  await q.waitForSelector('.chart-panel .folha');
  await q.waitForTimeout(600);

  const depois = {
    metrica: await q.locator('#campos-metrica input').nth(2).inputValue(),
    v0: await q.locator('#campos-vetor input').nth(0).inputValue(),
    numeral: (await q.textContent('#numeral-value')).trim(),
    bemolLido: (await q.textContent('#v-bemol')).trim(),
  };

  for (const chave of Object.keys(antes)) {
    const ok = antes[chave] === depois[chave];
    console.log(`  ${chave}: ${ok ? '✓' : `✗ "${antes[chave]}" → "${depois[chave]}"`}`);
  }
  await q.screenshot({ path: `${OUT}/cena-restaurada.png` });

  // Endereço corrompido não pode derrubar a página.
  const r = await limpa.newPage();
  await r.goto('http://localhost:5173/?cena=lixo!!!', { waitUntil: 'networkidle' });
  await r.waitForTimeout(800);
  const aviso = (await r.textContent('#erro-metrica'))?.trim();
  const desenhou = (await r.locator('.chart-panel .folha').count()) > 0;
  console.log(`  cena corrompida: desenhou mesmo assim=${desenhou}, aviso="${aviso}"`);

  await ctx.close();
  await limpa.close();
}

// Layout em telas reais. O 1366×768 é o que boa parte da turma tem, e é onde o
// cromo antes comia um terço da cena. `sobra` mede a altura que os painéis
// recebem: se ela desabar, o desenho encolheu para o controle caber.
console.log('\n— layout —');
for (const [w, h] of [
  [1920, 1080],
  [1600, 1000],
  [1366, 768],
  [1280, 800],
  [820, 900],
]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await p.waitForSelector('.chart-panel .folha');
  const box = await p.locator('#paineis').boundingBox();
  const rolagem = await p.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  // O modo 2-form acrescenta dois blocos de controle. Se a barra transbordar,
  // ela corta um controle pelo meio — foi o que aconteceu na primeira versão.
  // Os modos com células acrescentam blocos de controle; o de derivada é o que
  // acrescenta mais. Se a barra transbordar, corta um controle pelo meio.
  let cortado = false;
  for (const m of ['duas', 'derivada']) {
    await p.selectOption('#modo', m);
    await p.waitForTimeout(400);
    cortado ||= await p.evaluate(() => {
      const c = document.getElementById('controles');
      return c.scrollHeight > c.clientHeight + 1;
    });
    await p.screenshot({ path: `${OUT}/layout-${w}x${h}-${m}.png` });
  }
  await p.selectOption('#modo', 'uma');
  await p.waitForTimeout(200);

  console.log(
    `${w}×${h}: painéis ${Math.round(box.height)}px (${Math.round((box.height / h) * 100)}% da tela)` +
      `${rolagem ? '  ⚠ ROLAGEM HORIZONTAL' : ''}` +
      `${cortado ? '  ⚠ CONTROLES CORTADOS no modo 2-form' : ''}`,
  );
  await p.screenshot({ path: `${OUT}/layout-${w}x${h}.png` });
  await p.close();
}

// Modo cena-limpa: as condições do teste de 30 segundos da Etapa 1.
console.log('\n— modo cena-limpa —');
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await p.goto('http://localhost:5173/?limpo=1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const visivel = async (sel) => await p.locator(sel).isVisible();
  console.log(
    `cromo escondido: seletor=${await visivel('#seletor')} ` +
      `controles=${await visivel('#controles')} carta=${await visivel('#painel-carta')}`,
  );
  console.log(`cena e numeral: canvas=${await visivel('#stage canvas')} ` +
      `numeral="${(await p.textContent('#numeral-value'))?.trim()}"`);
  await p.screenshot({ path: `${OUT}/limpo.png` });
  await p.close();
}

console.log('\nerros de console:', errors.length ? errors : 'nenhum');
await browser.close();
