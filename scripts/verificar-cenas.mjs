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
  console.log(
    `${w}×${h}: painéis ${Math.round(box.height)}px (${Math.round((box.height / h) * 100)}% da tela)` +
      `${rolagem ? '  ⚠ ROLAGEM HORIZONTAL' : ''}`,
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
