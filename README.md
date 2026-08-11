<p align="center">
  <img src="assets/aletra-alfa-marca.svg" alt="ÁLETRA" width="112" />
</p>

<h1 align="center">ÁLETRA</h1>

<p align="center">
  <b>A</b>tlas, <b>L</b>evantamento e <b>E</b>xterior de <b>T</b>angentes em
  <b>R</b>enderização <b>A</b>nimada
</p>

Geometria diferencial que se lê como contagem.

Uma one-form ω é desenhada como uma pilha de folhas. Um vetor v é uma seta. E o
valor ⟨ω, v⟩ é literalmente **quantas folhas a seta atravessa** — o número na
tela e a imagem são a mesma leitura, não dois fatos que o aluno precisa
reconciliar.

**[Abrir no navegador →](https://rafaelcrdelima.github.io/ALETRA/)**

Não instala nada, não envia nada para servidor nenhum: a página é estática e
toda a geometria é calculada na aba aberta, na máquina de quem abriu.

## O que já funciona

- **Esfera, plano hiperbólico e fatia equatorial de Schwarzschild**, ou qualquer
  métrica que você digitar nos campos `g_ij`.
- **Dois painéis sincronizados**: a carta de coordenadas e, quando existe, o
  mergulho em ℝ³. Arrastar num move o outro. As duas imagens discordam — o
  número não.
- **Regiões onde a carta falha** aparecem hachuradas, com o arraste bloqueado e
  uma mensagem que distingue singularidade de coordenada (o horizonte em r=2M,
  os polos da esfera) de singularidade de curvatura real (r=0).

Ainda não: ♯/♭ lado a lado, ∧, d, colchete de Lie, transporte paralelo,
geodésicas, cena compartilhável por URL. O caminho está em [PLAN.md](PLAN.md), e
o porquê de cada escolha técnica em [DECISIONS.md](DECISIONS.md).

## Desenvolvimento

```bash
pnpm install
pnpm dev         # servidor local
pnpm test        # suíte do núcleo numérico
pnpm build       # typecheck + build de produção em dist/
pnpm verificar   # captura as cenas no navegador (precisa do dev no ar)
```

`core/` é matemática pura, sem DOM nem WebGL, e é a única camada com testes
automatizados — os casos de verificação são superfícies com resposta fechada
conhecida (curvatura constante, Christoffels analíticos). `render/` desenha o
que `core/` calcula, e `app/` cuida do estado e da interação.

## Licença

Ainda não definida.
