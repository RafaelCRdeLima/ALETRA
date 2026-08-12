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
