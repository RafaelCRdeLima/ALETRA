import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos, não absolutos. No GitHub Pages um site de projeto vive
  // em usuario.github.io/ALETRA/, não na raiz do domínio — com `base: '/'` o
  // navegador buscaria /assets/… e receberia 404. Relativo também deixa a mesma
  // build funcionar aberta de um diretório local ou embutida em qualquer
  // subcaminho, o que a Etapa 4 vai precisar para o modo applet.
  base: './',
  build: {
    // Duas páginas: o programa e o roteiro de atividades. O tutorial vive no
    // próprio repositório, e não num endereço de terceiros, porque o link no
    // cabeçalho precisa funcionar para quem só recebeu a URL do ÁLETRA — sem
    // conta, sem login, sem depender de um serviço continuar existindo.
    rollupOptions: {
      // Caminhos relativos à raiz do projeto: usar `resolve(__dirname, …)`
      // exigiria @types/node só para isto, e o typecheck roda antes do build.
      input: {
        principal: 'index.html',
        tutorial: 'tutorial.html',
      },
    },
  },
  test: {
    // core/ é a única camada com suíte automatizada (D8) — e não toca DOM.
    environment: 'node',
    include: ['core/**/*.test.ts'],
  },
});
