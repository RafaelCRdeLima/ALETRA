import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos, não absolutos. No GitHub Pages um site de projeto vive
  // em usuario.github.io/ALETRA/, não na raiz do domínio — com `base: '/'` o
  // navegador buscaria /assets/… e receberia 404. Relativo também deixa a mesma
  // build funcionar aberta de um diretório local ou embutida em qualquer
  // subcaminho, o que a Etapa 4 vai precisar para o modo applet.
  base: './',
  test: {
    // core/ é a única camada com suíte automatizada (D8) — e não toca DOM.
    environment: 'node',
    include: ['core/**/*.test.ts'],
  },
});
