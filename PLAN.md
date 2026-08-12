# ÁLETRA — Plano de construção

Este plano assume as decisões técnicas registradas em `DECISIONS.md` — cada etapa abaixo referencia
a decisão relevante (`D1`, `D2`, ...) em vez de repetir a justificativa. Leia `DECISIONS.md` primeiro
se algo aqui parecer arbitrário.

**Premissas assumidas** (ver `DECISIONS.md` D0 para a lista completa e a origem de cada uma):
ritmo de sprint dedicado; público do teste da Etapa 1 é aluno de graduação típico; repositório
privado por ora; sem backend; sem conta de usuário.

**Fora de escopo em todas as etapas** (restrição do projeto, não desta sessão): dimensão > 3,
álgebra simbólica em runtime, provas formais, fibrados gerais, spinores, qualquer coisa que exija
o aluno escrever código.

---

## Estrutura de código (mínima, não é um framework)

```
core/     funções puras: métrica, Christoffel (diferença finita), geodésica (RK4),
          transporte paralelo, contração, ♯/♭, ∧, d. Sem DOM/WebGL/SVG. (D9)
render/   svg/  — painel de carta 2D
          three/ — painel de mergulho em R³
app/      estado de cena, wiring de interação, serialização (a partir da Etapa 4)
```

`core/` é a única camada com suíte de testes automatizada (Vitest, D8). `render/` e `app/` são
verificados manualmente/visualmente a cada etapa — não há sentido em testar automaticamente "isto
parece certo para um aluno."

---

## Estratégia de teste numérico (resumo — detalhe completo em D8)

Casos padrão-ouro com forma fechada conhecida: **esfera** ($K=1/R^2$ constante, geodésicas =
grandes círculos), **plano hiperbólico** ($K=-1$ constante, geodésicas = semicírculos/verticais no
modelo upper half-plane), **fatia equatorial de Schwarzschild** (Christoffels fechados conhecidos,
$E$/$L$/$|v|_g$ conservados ao longo de geodésicas mesmo sem forma fechada geral).

Testes: Christoffel por diferença finita vs. fechado; curvatura gaussiana constante onde deveria
ser constante; geodésica numérica vs. analítica; conservação de $|v|_g$; holonomia num triângulo
esférico = área (Gauss-Bonnet) — este último é ao mesmo tempo teste do motor e conteúdo da Etapa 8.

`pnpm test` roda tudo. Cada etapa abaixo diz quais subconjuntos precisam estar verdes.

---

## Etapa 1 — O símbolo, funcionando

**Estado:** cena construída e funcionando (`pnpm dev`). Falta o único critério que realmente
decide a etapa — o teste de 30 segundos com alunos reais.

**Objetivo:** provar, com o público mais exigente possível para essa prova (um aluno de
graduação típico, sem explicação prévia — D6), que a pilha de superfícies de nível se lê como
contagem. Esta etapa é a aposta central do projeto. Se ela falhar, o projeto está errado, e o
objetivo é descobrir isso em semanas, não em meses.

**Escopo concreto:**
- Uma esfera de raio fixo, mergulhada em $\mathbb{R}^3$, renderizada em Three.js. Christoffels em
  forma fechada (não diferença finita ainda — ver nota abaixo).
- Um ponto $p$ na superfície, arrastável (reparametrizado em $(\theta,\phi)$, permanece na
  superfície por construção).
- O plano tangente $T_pS^2$ desenhado como disco translúcido no ponto, com uma base local
  $(e_\theta, e_\phi)$ visível.
- Um vetor $v \in T_pS^2$ arrastável dentro do plano tangente (dois componentes na base local).
- Uma one-form $\omega$ com componentes fixos ou ajustáveis por dois sliders simples, desenhada
  como pilha de folhas locais ao redor de $p$ (patches delimitados com desvanecimento por
  distância — D10; **não** é preciso resolver oclusão em grande escala aqui, porque o escopo da
  Etapa 1 é só a vizinhança de $p$).
- Numeral vivo de $\langle\omega, v\rangle$, sempre com casa decimal, sem arredondar (D11);
  segmento fracionário do vetor destacado visualmente.
- **Uma única cena.** Sem editor, sem menu, sem salvar, sem painel 2D sincronizado, sem escolha de
  outra superfície.

**Por que Christoffel fechado e não diferença finita aqui:** a Etapa 1 testa se a linguagem visual
funciona, não se o motor numérico é geral. Introduzir diferença finita antes de saber se a pilha
"lê" seria resolver o problema errado primeiro. A generalização por diferença finita é o conteúdo
da Etapa 2, sobre uma base visual já validada.

**Critério de verificação:**
- Numérico: valor mostrado na tela igual a $\omega_\theta v^\theta + \omega_\phi v^\phi$ calculado
  independentemente, dentro da precisão de ponto flutuante — checagem trivial, mas roda em CI.
- Pedagógico (o critério que realmente importa, e é humano, não automatizável): sentar alguns dos
  seus próprios alunos na frente da cena, sem explicação, cronometrar até "entenderem que o número
  é quantas linhas o vetor atravessa" com as próprias palavras deles. Isto é literalmente o teste
  de 30 segundos do enunciado do projeto — rodá-lo com pessoas reais é o próximo passo mais barato
  disponível, e o usuário tem acesso direto a esse público.

**O que deliberadamente não faz ainda:** editor de métrica, ♯/♭, ∧, d, colchete de Lie, transporte
paralelo, geodésicas, salvar/URL, painel 2D, embedding como applet, suporte a celular, mais de uma
superfície.

---

## Etapa 2 — Métrica arbitrária + carta 2D sincronizada

**Estado:** construída e verificada. Os três exemplos carregam, os dois painéis sincronizam, a
região não-riemanniana é hachurada e o erro de sintaxe é legível. `pnpm verificar` recaptura as
telas.

**Objetivo:** generalizar a Etapa 1 de "uma esfera com fórmula fechada embutida" para "qualquer
métrica que o usuário digite", provando ao mesmo tempo que diferença finita não perde fidelidade
visual em relação à forma fechada da Etapa 1.

**Escopo concreto:**
- Parser/interpretador de AST para componentes de métrica (D4) — gramática fechada, sem `eval`.
- Motor de Christoffel por diferença finita (D5), com detecção de métrica degenerada e
  singularidade de coordenada (D7): região hachurada, arraste bloqueado, mensagem em português.
- Painel de carta 2D (SVG) mostrando o ponto/vetor/pilha diretamente nas coordenadas da carta,
  ao lado do painel 3D da Etapa 1 (agora genérico: qualquer superfície com mergulho conhecido, ou
  só o painel 2D quando não há mergulho em R³ definido — ex. hiperbólico abstrato).
  Sincronizados: arrastar em qualquer um dos dois move o mesmo ponto no outro.
- Pré-carregar como exemplos: esfera (recuperando a Etapa 1, agora por diferença finita — serve de
  teste de regressão visual), plano hiperbólico ($g=1/y^2$), fatia equatorial de Schwarzschild.
- Ainda sem editor persistente/menu — trocar de exemplo pode ser um seletor simples, não uma UI de
  autoria completa (isso é Etapa 4).

**Critério de verificação:**
- `pnpm test`: Christoffel por diferença finita vs. fechado nos três casos padrão-ouro, dentro da
  tolerância de D8; curvatura gaussiana constante nos três casos.
- Visual: a cena da esfera nesta etapa deve ser indistinguível, a olho, da Etapa 1 (regressão).
- Digitar uma métrica com erro de sintaxe proposital e confirmar que a mensagem de erro é
  compreensível sem jargão de exceção JS.
- Digitar uma métrica degenerada proposital (ex. $g=0$) e confirmar que a região é sinalizada, não
  trava a página.

**O que deliberadamente não faz ainda:** ♯/♭, ∧, d, colchete de Lie, transporte paralelo,
geodésicas, salvar/URL, editor visual de cena, embedding.

---

## Etapa 3 — ♯ e ♭ lado a lado

**Estado:** construída. O plano euclidiano entrou como quarto exemplo e é o controle experimental:
ali $v^\flat$ tem exatamente os mesmos números que $v$ e as folhas saem perpendiculares à seta no
desenho; na esfera os números divergem e a perpendicularidade some. Duas ressalvas honestas abaixo.

**Objetivo:** mostrar que $v$ e $v^\flat$ são o mesmo objeto em duas representações, e que essa
distinção só é visível porque a métrica não é euclidiana (compromisso #2 do projeto).

**Escopo concreto:**
- Sobre a base da Etapa 2 (métrica arbitrária, carta 2D + 3D sincronizados): o mesmo vetor
  desenhado simultaneamente como $v$ (seta) e $v^\flat$ (pilha de one-form), com um botão/toggle
  que anima a transição entre as duas representações em vez de trocar abruptamente — reforça que é
  o mesmo objeto, não dois objetos relacionados.
- Cena de comparação lado a lado: a mesma operação num grid euclidiano (onde $v$ e $v^\flat$
  coincidem visualmente) versus na esfera/hiperbólico (onde não coincidem) — o contraste é o
  conteúdo pedagógico desta etapa.

**Critério de verificação:**
- `pnpm test`: $v^\flat_i = g_{ij}v^j$ e $v^\sharp{}^i = g^{ij}\omega_j$ testados contra os casos
  padrão-ouro (inclusive o caso euclidiano, onde ♯/♭ devem ser identidade numérica).
- Visual: no grid euclidiano, $v$ e $v^\flat$ desenhados devem se sobrepor exatamente; na esfera,
  visivelmente não.

**Duas ressalvas do que foi construído:**

1. **A comparação é por troca de exemplo, não lado a lado.** O escopo pedia as duas cenas
   simultâneas; o que existe é um seletor que alterna entre euclidiano e esfera com o controle da
   morfose preservado. Lado a lado de verdade exigiria duas instâncias da cena na tela ao mesmo
   tempo, o que é reestruturação do layout, não ajuste. Fica em aberto se compensa.
2. **Na esfera, a pilha de $v^\flat$ é rala por geometria, não por bug.** O espaçamento das folhas
   de $v^\flat$ é $1/|v|_g$, e o pedaço visível da superfície tem raio $\approx 0{,}5$, então
   $|v|_g \le 0{,}5$ e as folhas ficam mais afastadas que a própria vizinhança desenhada — a seta
   atravessa $|v|^2_g \approx 0{,}18$ de uma folha. Está correto e o numeral mostra a fração, mas
   ali $v^\flat$ lê-se como *uma linha*, não como pilha. No euclidiano, onde a região visível é
   maior, ela lê-se como pilha e a seta cruza duas folhas. Se isso atrapalhar o aluno, o conserto é
   pedagógico (aumentar a vizinhança desenhada na esfera), não numérico.

**O que deliberadamente não faz ainda:** ∧, d, colchete de Lie, transporte paralelo, geodésicas,
salvar/URL, editor, embedding.

---

## Etapa 4 — Formato de cena, URL compartilhável, edição mínima

**Estado:** construída. Cena serializada na URL (496–581 caracteres nos quatro exemplos, medido),
botão de copiar link, carregamento com validação estrita, e formato de texto editável à mão. As
duas decisões que esta etapa devia tomar estão registradas: D14 (sem compressão, por medição) e
D15 (sem camada reativa, que era a reavaliação agendada por D2). O modo embedding chegou antes, na
preparação do teste com alunos.

**Objetivo:** transformar as três cenas concretas construídas até aqui na infraestrutura de
autoria e compartilhamento que o produto promete — só agora, porque só agora se sabe o que uma
cena realmente precisa guardar (o aviso do usuário contra arquitetura antecipada, D9, se aplica
igualmente ao formato de arquivo).

**Escopo concreto:**
- Formato de texto legível para uma cena: métrica (a expressão digitada, não a AST compilada),
  carta, ponto base, lista de objetos (vetores, one-forms) com seus valores, estado de vista
  (câmera 3D, zoom 2D), texto explicativo opcional. Versionável em git por construção (é texto).
- Serialização para URL: encoding compacto + compressão (ex. JSON minificado → deflate → base64url)
  — ver risco de tamanho de URL abaixo.
- Painel de parâmetros mínimo (não um construtor visual de cena): campos para editar os valores já
  existentes numa cena carregada. Autoria de cena nova continua sendo editar o formato de texto à
  mão, o que já satisfaz o requisito de "autorar cenas à mão" do projeto sem precisar de um editor
  visual completo.
- Modo embedding: a mesma aplicação, com o chrome de UI (painel de parâmetros, menu) escondido via
  parâmetro de URL, para uso em `<iframe>`.
- Reavaliar aqui (D2) se uma camada reativa pequena compensa a complexidade adicional para o
  painel de parâmetros — decisão adiada até este ponto de propósito.

**Critério de verificação:**
- Serializar uma cena, copiar a URL, abrir numa aba anônima, confirmar que reproduz exatamente o
  estado original (incluindo métrica digitada à mão).
- Editar o arquivo de texto de uma cena manualmente (sem passar pela UI) e confirmar que carrega.
- Medir o comprimento da URL das três cenas de exemplo da Etapa 2 e confirmar que fica bem abaixo
  do limiar de risco (ver Riscos).

**O que deliberadamente não faz ainda:** construtor visual de cena do zero (arrastar para criar um
novo vetor, por exemplo, permanece um recurso das etapas seguintes se justificado), ∧, d, colchete
de Lie, transporte paralelo, geodésicas.

---

## Etapa 5 — ∧, produto exterior

**Estado:** construída. A pilha de ω e a de η se cruzam e ladrilham o plano; o paralelogramo gerado
por $u$ e $v$ cerca a região, e o numeral conta as células com a mesma disciplina de D11 ("5 células
+ 0,58"). Trocar a ordem de $\omega$ e $\eta$ inverte o sinal — critério visual verificado. Um botão
alterna entre a leitura de 1-form e a de 2-form, porque mostrar $\langle\omega,v\rangle$ e
$(\omega\wedge\eta)(u,v)$ ao mesmo tempo obrigaria o aluno a descobrir sozinho qual número
corresponde a qual desenho.

**Confirmação de D12:** nenhum código de avaliação novo foi preciso. `evaluate(σ, [u, v])` é a mesma
função que a Etapa 1 usa com um vetor, e já estava verde desde lá. O que esta etapa escreveu foi o
$\wedge$ em si e o desenho.

**Objetivo:** estender a linguagem visual da pilha para 2-forms: paralelogramo orientado como
gerador, célula como unidade, contagem de células = número.

**Escopo concreto:** sobre a infraestrutura de cena da Etapa 4, um novo tipo de objeto (2-form,
como célula/grade de paralelogramos) e a operação $\omega \wedge \eta$ produzindo-o a partir de
duas one-forms. Mesma disciplina de numeral vivo + fração visível (D11) aplicada a "quantas
células".

**Precisão trazida por D12:** numa superfície 2D — que é o caso de *todas* as cenas deste plano —
uma 2-form é top-degree: não tem direção, só densidade e orientação, e o desenho é um ladrilho de
células. O desenho de tubos (2-form num domínio 3D) é outra coisa, exige um domínio tridimensional
que nenhuma etapa deste plano cria, e está fora de escopo aqui. O `core/` já representa formas por
grau desde a Etapa 1, então esta etapa não precisa de estrutura nova — só do desenho novo.

**Critério de verificação:**
- `pnpm test`: $\omega\wedge\eta$ antissimétrico ($\omega\wedge\eta = -\eta\wedge\omega$) e
  bilinear, testado numericamente sobre casos simples com resultado conhecido à mão. A avaliação
  genérica de $k$-forms já está verde desde a Etapa 1 (`core/forms.test.ts`); o que falta testar
  aqui é o $\wedge$ em si.
- Visual: trocar a ordem de $\omega$ e $\eta$ inverte a orientação visível da célula.
- Pedagógico: **teste de 30 segundos próprio**, com alunos reais. Contar células não herda a
  validação da Etapa 1 — atravessar linhas é varredura 1D, contar células envolve orientação e
  sinal (D12).

**O que deliberadamente não faz ainda:** d, colchete de Lie, transporte paralelo, geodésicas.

---

## Etapa 6 — d, derivada exterior

**Objetivo:** construção de Bachman (circulação em torno de célula infinitesimal), com $d^2=0$
visivelmente óbvio, não só demonstrável por álgebra.

**Escopo concreto:** operador $d$ sobre one-forms produzindo uma 2-form (construção de
circulação); aplicar $d$ duas vezes em sequência sobre a mesma cena e mostrar a 2-form resultante
colapsando a zero visivelmente (não uma mensagem de texto "$d^2=0$" — o produto tem que desenhar o
zero).

**Critério de verificação:**
- `pnpm test`: $d(d\omega) = 0$ numericamente (dentro de tolerância de diferença finita) para
  one-forms arbitrárias digitadas nos casos padrão-ouro.
- Visual: a célula de $d(d\omega)$ mostrada como visivelmente degenerada/nula.

**O que deliberadamente não faz ainda:** colchete de Lie, transporte paralelo, geodésicas.

---

## Etapa 7 — Colchete de Lie

**Objetivo:** o quadrilátero de fluxos que não fecha — mostrar dois campos vetoriais, seguir fluxo
de um depois do outro e vice-versa, e o gap visível é o colchete.

**Escopo concreto:** dois campos vetoriais na cena; integração de fluxo curto ao longo de cada um
(reaproveita o integrador RK4 do núcleo, D5); desenho explícito do quadrilátero e do vetor de gap
= $[X,Y]$ aproximado.

**Critério de verificação:**
- `pnpm test`: $[X,Y]$ calculado via diferença finita das derivadas direcionais comparado contra
  colchete de campos com forma fechada conhecida (ex. campos coordenados, que comutam — o gap deve
  ir a zero).
- Visual: para campos coordenados o quadrilátero fecha; para campos que não comutam, não fecha, e
  o gap escala corretamente com o tamanho do passo de fluxo ao diminuí-lo.

**O que deliberadamente não faz ainda:** transporte paralelo, geodésicas.

---

## Etapa 8 — Transporte paralelo em curva fechada → holonomia

**Objetivo:** transportar um vetor ao longo de um laço fechado na superfície e mostrar que ele
volta rodado — o ângulo de holonomia como número visível, ligado à curvatura englobada.

**Escopo concreto:** integrador de transporte paralelo (equação de transporte paralelo ao longo de
uma curva parametrizada, reaproveitando Christoffel do núcleo); laço editável na carta (ex.
triângulo esférico ou laço arbitrário); vetor inicial e final desenhados simultaneamente com o
ângulo entre eles em destaque.

**Critério de verificação:**
- `pnpm test`: holonomia num triângulo esférico igual à área do triângulo (Gauss-Bonnet), dentro
  de tolerância — este é o teste de D8 que dobra como conteúdo pedagógico da própria etapa.
- Visual: laço no plano euclidiano (curvatura zero) produz holonomia zero — vetor volta idêntico.

**O que deliberadamente não faz ainda:** geodésicas como objeto de primeira classe na UI (o
integrador já existe internamente desde a Etapa 7, mas geodésica como cena dedicada é a Etapa 9).

---

## Etapa 9 — Geodésicas e desvio geodésico

**Objetivo:** geodésica como "linha mais reta possível" traçada ao vivo a partir de um ponto e
direção; desvio geodésico como duas geodésicas vizinhas se aproximando/afastando conforme a
curvatura.

**Escopo concreto:** traçar geodésica a partir de $(p, v)$ arrastáveis, integrada em tempo real
(RK4, D5), com parada/aviso ao se aproximar de singularidade de coordenada (D7) — este é o caso de
uso mais direto desse tratamento (ex. geodésica caindo em direção a $r=2M$ em Schwarzschild).
Desvio geodésico: par de geodésicas vizinhas com separação inicial pequena, mostrando a separação
crescer/oscilar/diminuir conforme o sinal da curvatura.

**Critério de verificação:**
- `pnpm test`: geodésica numérica vs. analítica nos casos padrão-ouro (grandes círculos,
  semicírculos), erro bound pelo comprimento de arco integrado; conservação de $|v|_g$.
- Visual: em Schwarzschild, uma geodésica dirigida ao horizonte para com a mensagem de
  singularidade de coordenada, distinta de uma mensagem de singularidade real caso o caso de teste
  também cubra $r\to0$.

**O que deliberadamente não faz ainda:** nada do escopo do projeto fica de fora depois desta etapa
— é a última da lista de operações priorizada pelo usuário. Trabalho futuro além disto (construtor
visual completo de cena, suporte a celular, mais superfícies pré-carregadas) fica para depois desta
sequência, sem definição aqui.

---

## Riscos

| Risco | Sinal antecipado |
|---|---|
| A aposta central falha: a pilha não se lê como contagem sem explicação prévia | Teste de 30s da Etapa 1 com alunos reais falha — rodar isso **primeiro**, antes de qualquer outra etapa, é o ponto mais barato para descobrir se o projeto está errado |
| Oclusão da pilha em 3D não generaliza além do caso local da Etapa 1 (D10) | Aparece já na Etapa 2/3 quando a carta cobre região maior, ou na Etapa 5 quando 2-forms (células não coplanares entre si) entram em cena |
| Diferença finita instável perto dos casos reais de uso (horizonte, polos, cúspides) | Testes de D8 falhando ou exigindo afrouxar tolerância já na Etapa 2 |
| Tentação de construir uma arquitetura genérica de "objeto geométrico" antes da hora (D9) | Sinal de alerta: uma classe base abstrata aparecendo em `core/` antes da Etapa 5. Se aparecer, parar e reverter para funções concretas |
| Performance de integração em tempo real (Christoffel + RK4 a 60fps durante arraste) | Profiling durante a Etapa 2; só então considerar a válvula de escape de D1 (isolar um módulo em WASM), nunca antes de medir |
| Limite de tamanho de URL para cenas grandes | Medir o comprimento da URL das cenas de exemplo já na Etapa 4; se aproximar de ~2–8 KB, o formato compacto+compressão de D4/Etapa 4 precisa ser revisitado antes de crescer mais |
| Projeto pausa por falta de tempo do único mantenedor | Não é risco técnico, mas cada etapa é demonstrável e útil isoladamente por construção — se o projeto parar em qualquer etapa, o que existe já é uma demo funcional, não um framework pela metade |
