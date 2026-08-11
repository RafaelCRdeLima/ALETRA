# ÁLETRA — Decisões técnicas

Cada decisão: o que foi escolhido, o que foi descartado, por quê, e quando revisitar.
Isto é o registro que justifica o `PLAN.md`. Se uma etapa do plano parecer arbitrária, a
justificativa está aqui.

---

## D0 — Premissas assumidas nesta sessão

Respondidas explicitamente pelo usuário:

- **Ritmo:** sprint dedicado (blocos de semanas cheias), não projeto lateral de poucas horas/semana.
  Isso permite etapas um pouco maiores e mais próximas umas das outras do que se fosse ritmo de
  fim de semana.
- **Público do teste de 30 segundos da Etapa 1:** aluno de graduação típico, não um colega da área.
  A régua é legibilidade pedagógica imediata, mesmo que isso custe generalidade. Isso pesou
  diretamente na escolha da superfície da Etapa 1 (D6).
- **Licença:** privado por enquanto, decisão de abrir código adiada. Consequência prática: nenhuma
  dependência foi filtrada por licença nesta rodada; se o projeto abrir depois, revisitar
  `package.json` para dependências GPL/AGPL antes de publicar.

Assumido sem perguntar, porque não bloqueava o plano (declarado aqui para poder ser corrigido):

- Hospedagem é indiferente neste estágio — qualquer host estático serve (GitHub Pages, Cloudflare
  Pages, servidor próprio). Nenhuma decisão de infraestrutura amarra o código a um provedor.
- Não há necessidade de conta de usuário, backend, ou persistência server-side. "Cena na URL" é
  tratado como suficiente para compartilhamento; nenhum backend é assumido em nenhuma etapa.
- Poppins (Google Fonts, licença OFL) pode ser auto-hospedada sem problema de licença, mesmo com o
  projeto privado.

---

## D1 — Linguagem e stack: TypeScript puro, sem Rust/WASM

**Decisão:** núcleo numérico e aplicação inteiros em TypeScript. Nenhuma dependência de um módulo
Rust compilado para WASM na v1.

**Alternativa descartada:** núcleo em Rust (aproveitando a fluência do autor e o ODEROM como
referência) compilado para WASM, com camada de UI em JS/TS por cima.

**Justificativa:**
- A carga numérica é pequena por construção: algumas dezenas de geodésicas integradas a 60fps,
  Christoffels por diferença finita avaliados sob demanda durante arraste do mouse. Isso é trivial
  para um `Float64Array` em JS moderno — não há regime aqui em que WASM ganharia por performance.
- O usuário já descartou reaproveitamento real de código do ODEROM — a tentação de Rust é fluência
  pessoal, não economia de trabalho. Fluência em Rust não compensa a complexidade estrutural que
  WASM impõe a um produto que é, na sua essência, uma interface reativa.
- ÁLETRA é dominado por trabalho de UI/interação: arraste ao vivo, sincronização de painéis,
  serialização de estado, iteração visual rápida e descartável (provar um encoding visual, jogar
  fora, tentar outro — isto vai acontecer muito nas Etapas 1–3). Rust/WASM impõe fronteira de
  marshalling entre o núcleo e a UI, tempo de build mais alto, e um ciclo de iteração pior
  exatamente onde a velocidade de iteração mais importa.
- "Abre num link, sem instalar nada" pesa contra WASM: adiciona um artefato binário a baixar antes
  do primeiro frame, e a superfície de depuração (source maps de Rust-em-browser) é
  estruturalmente pior que TS puro no DevTools.
- Compilar closures de métrica digitadas pelo usuário (ver D3) para um `Function` dinâmico em WASM
  seria mais complicado que interpretar uma AST em TS; a rota TS é estritamente mais simples aqui.

**Válvula de escape, não descartada permanentemente:** se profiling em alguma etapa futura (ex.:
congruências densas de geodésicas na Etapa 9, ou holonomia sobre laços com muitos pontos)
mostrar JS como gargalo real e mensurado, isolar **só esse módulo** como WASM, não migrar o projeto.
Decisão a revisitar apenas com dado de profiling em mãos, não por antecipação.

**Revisitar quando:** profiling mostrar um hot path específico dominando o frame time, não antes.

---

## D2 — Ferramental de build

**Decisão:** Vite + TypeScript (modo `strict`) + Vitest para testes. Sem framework de UI reativo
nas Etapas 1–3 (DOM/SVG manipulado diretamente). Reavaliar necessidade de uma camada reativa
pequena (ex. Solid.js, pela reatividade fina que casa bem com arraste contínuo de parâmetro e
estado serializado na URL) na Etapa 4, quando o editor de cena e o painel de parâmetros
justificarem a complexidade adicional.

**Justificativa:** a Etapa 1 é uma cena fixa, sem menu — não há estado suficiente para justificar
um framework. Introduzir um antes da hora é o mesmo erro que a arquitetura genérica de objetos
geométricos que o usuário pediu explicitamente para evitar (ver D9): estrutura antes de saber o
que ela precisa suportar.

**Revisitar quando:** Etapa 4 (editor + formato de cena), com base no que o painel de parâmetros
realmente precisar.

---

## D3 — Renderização: SVG para os painéis 2D, Three.js (WebGL) para os painéis 3D

**Decisão:** painel de carta 2D em SVG puro (DOM). Painel de mergulho em R³ em Three.js. Estado
sincronizado na camada de dados da aplicação (um único ponto de verdade: coordenadas na carta +
função de mergulho → posição em R³), não compartilhando um renderer entre os dois painéis.

**Alternativas descartadas:**
- Um único pipeline WebGL para os dois painéis (2D como câmera ortográfica dentro da mesma cena
  Three.js). Descartada porque texto nítido, hit-testing de arraste, e principalmente o efeito de
  véu com gradiente radial + máscara — que é **literalmente a técnica usada nos SVGs da marca**
  (`aletra-marca.svg`, `<mask>`/`<radialGradient>`) — são triviais em SVG/DOM e trabalhosos em
  WebGL. Replicar a marca com fidelidade pixel-a-pixel é mais barato reaproveitando a própria
  técnica que ela já usa.
- SVG também para o painel 3D. Descartada: reimplementar projeção, oclusão e iluminação à mão em
  SVG é reinventar um motor 3D; Three.js já resolve isso maduramente.

**Justificativa:** cada painel usa a tecnologia em que o efeito desejado é nativo, e a
sincronização acontece no nível do estado da cena (dados), que é o único lugar onde os dois
painéis realmente precisam concordar. Isso também mantém os módulos de renderização substituíveis
independentemente.

**Revisitar quando:** se o painel 2D precisar de efeitos que SVG não faz bem em escala (grandes
quantidades de geometria animada), reavaliar Canvas2D como alternativa intermediária — não pular
direto para unificar em WebGL.

---

## D4 — Entrada de métrica: interpretador de AST restrito, nunca `eval`/`new Function`

**Decisão:** o aluno digita componentes de $g_{ij}(x)$ como expressões (`1/y^2`, `sin(theta)^2`
etc.). Um parser recursivo-descendente próprio constrói uma AST sobre uma gramática fechada:
`+ - * / ^`, parênteses, unário, variáveis nomeadas da carta, e uma lista branca fixa de funções
(`sin cos tan sinh cosh tanh exp log sqrt abs atan2 pow`) e constantes (`pi e`). A AST é
**interpretada** (percorrida e avaliada), nunca compilada para código JS executável.

**Alternativa descartada:** `new Function(...)` gerando uma closure JS a partir da string digitada,
ou uma lib de parsing matemático genérica (ex. mathjs) usada em modo não restrito.

**Justificativa — não é só estilo, é a superfície de ataque real do produto:** cenas são
serializadas na URL e a cena "roda" ao abrir o link (requisito central do produto: "mexo na cena
ao vivo na aula e mando o link"). Isso significa que uma string de métrica digitada por qualquer
pessoa pode ser aberta por qualquer outra pessoa que clicar no link — inclusive em contexto
embutido como applet numa página de terceiros. `eval`/`new Function` sobre esse conteúdo é
execução de código arbitrário a partir de uma URL não confiável: um vetor de XSS embutido no
próprio formato de arquivo do produto. Um interpretador de AST sobre gramática fechada elimina essa
classe de vulnerabilidade estruturalmente, não por sanitização.

**Mensagens de erro:** validação em duas camadas — (1) erro de parse (posição + token esperado,
ex. "esperava um número ou variável depois de '/'") e (2) validação numérica pré-voo: antes de
usar a métrica, avaliá-la numericamente numa grade grosseira sobre a região visível da carta;
células com `det(g) ≈ 0`, `NaN`, ou `Inf` são marcadas como degeneradas e a região é
hachurada/desabilitada na interface (ver D7), com mensagem em português simples, não em jargão de
exceção.

**Revisitar quando:** se a lista branca de funções se mostrar insuficiente para uma métrica de
interesse pedagógico real (pouco provável para os casos do escopo: esfera, hiperbólico,
Schwarzschild).

---

## D5 — Christoffels por diferença finita: passo, integração de geodésica, e por que isso é suficiente

**Decisão:** $\Gamma^a_{bc}$ por diferença central sobre $g$ (fórmula já especificada pelo
usuário), com passo $h$ relativo à escala característica da carta, na faixa
$h \sim 10^{-5}$–$10^{-6}$ (equilíbrio padrão entre erro de truncamento $O(h^2)$ e ruído de
arredondamento de ponto flutuante — a heurística $h \sim \sqrt{\epsilon_{\text{máquina}}}$ dá
$h \sim 10^{-8}$ para a derivada em si, mas como o produto final passa por mais uma camada de
álgebra antes de virar pixel, um passo pouco maior é mais robusto sem custar precisão visível).
Não expor $h$ na interface — é parâmetro de engenharia, não conceito pedagógico.

Integração de geodésica: RK4 de passo fixo como padrão. Não implementar passo adaptativo
(RKF45/Dormand-Prince) antecipadamente.

**Justificativa:** o próprio usuário já argumentou o ponto central — a tela tem resolução de pixel
e o integrador introduz mais erro que a diferença finita; forma fechada exata não muda um pixel.
RK4 de passo fixo é simples de raciocinar, fácil de testar (ver D8), e suficiente para os casos do
escopo (esfera, hiperbólico, fatia de Schwarzschild fora do horizonte). Adaptativo é complexidade
real (controle de erro, rejeição de passo) que só se justifica diante de uma falha demonstrada —
ex. órbita muito próxima da esfera de fótons em Schwarzschild onde passo fixo grosseiro visivelmente
"vaza" energia/momento angular. Construir para esse caso antes de vê-lo falhar é otimização
prematura.

**Revisitar quando:** um teste do D8 (conservação de $|v|_g$ ao longo da geodésica) mostrar deriva
inaceitável num caso concreto do escopo — aí sim considerar passo adaptativo, só nesse caminho de
código.

---

## D6 — Superfície da Etapa 1: esfera, não hiperbólico nem Schwarzschild

**Decisão:** a cena de abertura da Etapa 1 é uma esfera (raio fixo) mergulhada em $\mathbb{R}^3$,
com Christoffels exatos (fórmula fechada, não diferença finita — ver Etapa 1 no `PLAN.md` para o
motivo de adiar a diferença finita).

**Alternativas descartadas:** plano hiperbólico (upper half-plane, $g = 1/y^2$) e fatia de
Schwarzschild.

**Justificativa:** o público-alvo do teste de 30 segundos da Etapa 1 é um aluno de graduação
típico (decisão do usuário nesta sessão), não um colega da área. Isso muda o critério de escolha:
o objetivo da Etapa 1 não é provar generalidade da métrica arbitrária (isso é a Etapa 2), é provar
que a pilha de superfícies de nível **se lê como contagem** sem explicação prévia. Uma esfera não
exige que o aluno primeiro aceite um espaço não-familiar antes de a demonstração fazer sentido —
"por que a Terra é curva" é intuição que já existe. Hiperbólico e Schwarzschild adicionam uma carga
conceitual anterior (aceitar a métrica antes de ver a contração) que compete com o que a Etapa 1
está de fato testando. A não-euclidianidade do compromisso #2 já está satisfeita pela esfera: a
métrica induzida difere da métrica plana, ♯/♭ já seriam visivelmente diferentes se testados nela
(mesmo que isso só entre na Etapa 3).

**Revisitar quando:** nunca, a menos que o teste de 30 segundos com alunos reais (ver Etapa 1)
mostre que a esfera não é suficientemente "óbvia" — sinal de risco improvável, mas verificável
diretamente com os próprios alunos do usuário.

---

## D7 — Singularidades de coordenada e métrica degenerada: detectar e rotular, nunca travar

**Decisão:** antes de usar uma métrica (digitada ou pré-definida) em qualquer operação, avaliá-la
numa grade sobre a região visível. Células onde $|\det g|$ cai abaixo de um limiar relativo, ou
onde qualquer componente é `NaN`/`Inf`, são marcadas como degeneradas: hachuradas na carta,
arraste do ponto base bloqueado ali, e integração de geodésica que se aproxime da região para e
mostra mensagem explícita.

**Distinção pedagógica deliberada:** a mensagem diferencia singularidade de coordenada (ex.
$r=2M$ em coordenadas de Schwarzschild, polos de $(\theta,\phi)$ na esfera) de singularidade de
curvatura real (ex. $r=0$ em Schwarzschild) sempre que o caso do escopo permitir essa distinção
sem ambiguidade. Isso não é só robustez de engenharia — é um dos erros conceituais mais comuns em
relatividade geral introdutória, e o produto está numa posição rara de poder mostrá-lo ao vivo em
vez de só descrevê-lo.

**Revisitar quando:** não antecipado; comportamento estável desde a Etapa 2 (primeira etapa com
métrica arbitrária).

---

## D8 — Estratégia de teste numérico: casos analíticos conhecidos como padrão-ouro

**Decisão:** núcleo numérico (`core/`) é TypeScript puro sem dependência de DOM/WebGL/SVG,
testável em Node via Vitest. Casos padrão-ouro com Christoffel, curvatura, e geodésicas em forma
fechada:

- **Esfera $S^2$** (raio $R$): $K = 1/R^2$ constante em toda parte; geodésicas são grandes círculos,
  fechadas e periódicas.
- **Plano hiperbólico** (upper half-plane, $g=1/y^2 \cdot \delta$): $K=-1$ constante; geodésicas são
  semicírculos ou retas verticais no modelo.
- **Fatia equatorial de Schwarzschild** ($\theta=\pi/2$, 2D espacial): Christoffels em forma
  fechada conhecida; sem geodésica fechada simples em geral, mas $E$, $L$ e a normalização de
  $|v|_g$ são conservados ao longo de qualquer geodésica — teste de invariante, não de forma
  fechada.

**Testes concretos:**
1. Christoffel por diferença finita vs. fórmula fechada, amostrado numa grade longe de
   singularidades de coordenada — tolerância relativa apertada (ordem $10^{-5}$–$10^{-6}$, coerente
   com o $h$ de D5).
2. Curvatura gaussiana (via tensor de Riemann construído sobre os Christoffels de diferença finita)
   constante e igual ao valor exato em toda a grade — teste de regressão forte, porque qualquer bug
   na cadeia de derivadas aparece como variação espacial onde deveria ser plano.
3. Geodésica integrada numericamente (RK4) contra a curva analítica (grandes círculos, semicírculos)
   — erro cresce com o comprimento de arco, então o teste bound a tolerância pelo comprimento
   integrado, não usa um número fixo.
4. $|v|_g$ constante ao longo de qualquer geodésica integrada, em qualquer dos três casos —
   invariante barato de checar, funciona mesmo sem forma fechada (cobre Schwarzschild).
5. **Holonomia de transporte paralelo num triângulo esférico = área do triângulo** (Gauss-Bonnet).
   Este teste é particularmente bom porque a própria Etapa 8 do produto (transporte paralelo →
   holonomia) é o teste de si mesma: se a cena pedagógica mostra o número certo, o motor de
   transporte paralelo está correto, e vice-versa — sinergia entre o que se testa e o que se ensina.

**Como rodar:** `pnpm test` roda a suíte inteira de `core/`; cada etapa do `PLAN.md` referencia
quais desses testes precisam estar verdes antes de considerar a etapa fechada.

**Revisitar quando:** nunca — esta é a espinha dorsal de confiança do projeto; expandir os casos
conforme novas superfícies/cartas entrarem em escopo, não substituir a estratégia.

---

## D9 — Estrutura de código: separação `core` / `render` / `app`, não um framework de objetos geométricos

**Decisão:** três camadas apenas, sem hierarquia de classes abstratas de "objeto geométrico":

- `core/`: funções puras sobre `Float64Array`/números — avaliação de métrica, Christoffel por
  diferença finita, integrador de geodésica, transporte paralelo, contração, ♯/♭, ∧, d. Sem
  import de DOM, Three.js, ou SVG. Testável isoladamente (D8).
- `render/`: desenha o que `core/` calcula. Um módulo SVG para o painel 2D, um módulo Three.js
  para o painel 3D. Não contém lógica geométrica, só mapeamento de números para geometria de tela.
- `app/`: estado da cena, wiring de interação (arraste, sliders), serialização (Etapa 4).

**Por que não é o "framework genérico" que o usuário pediu para evitar:** a separação não modela
"o que é um objeto geométrico" — não há classe base `TangentVector extends GeometricObject`. Ela
separa apenas o que precisa ser testável sem WebGL/DOM do que não precisa. Isso é uma fronteira de
testabilidade, não uma abstração de domínio, e sobrevive exatamente porque não tenta prever quais
objetos vão existir — cada etapa adiciona funções concretas a `core/`, nunca uma nova subclasse.

**Revisitar quando:** se por volta da Etapa 4–5 `core/` acumular padrões repetidos entre
contração/∧/d que peçam uma função utilitária compartilhada (ex. um avaliador de expressão
tensorial pequeno), extrair *essa função específica*, não uma hierarquia.

---

## D10 — Pilha de one-form em 3D: patches locais com desvanecimento por distância, não planos infinitos

**Decisão:** cada "folha" da pilha em 3D é um patch delimitado (não um plano infinito), cuja
opacidade e extensão caem com a distância ao longo da folha a partir do ponto onde a contração está
sendo lida (o ponto base do vetor, ou o segmento do vetor sendo arrastado) — generalizando
diretamente o efeito de véu do logo (`radialGradient` + `mask` centrado quase exatamente no ponto
médio do vetor, confirmado ao ler `aletra-marca.svg`). Como as folhas são paralelas e o vetor tem
uma direção normal conhecida, elas são ordenadas trivialmente por distância assinada ao longo dessa
normal — sem precisar de order-independent transparency genérico.

**Alternativa descartada:** planos semi-transparentes de extensão fixa/grande cobrindo a cena
inteira. Descartada porque em 3D isso oclui a superfície, o ponto, e o próprio vetor — o problema
de legibilidade citado explicitamente no prompt do usuário (pergunta em aberto #4).

**Justificativa:** o vocabulário visual da marca já resolveu este problema em 2D (o véu esconde o
que está longe de onde se opera, revela o que está perto) — a solução em 3D é a mesma ideia
aplicada ao longo da direção normal das folhas, não uma técnica nova. Como o número de folhas
visíveis é tipicamente pequeno (⟨ω,v⟩ de interesse pedagógico é um inteiro pequeno ou fração
simples, raramente >10–15), não é necessário um esquema geral de transparência ordenada — a
ordenação por distância assinada ao longo da normal comum já é suficiente e exata.

**Revisitar quando:** Etapa 5 (∧, células 2-form em 3D) — se células não-paralelas entre si
precisarem de blending simultâneo, aí sim considerar profundidade real (depth peeling) em vez de
ordenação por normal comum.

---

## D11 — Exibição do valor fracionário de ⟨ω, v⟩

**Decisão:** o numeral nunca arredonda silenciosamente — sempre mostra a parte decimal
(ex. "3.7", não "≈4" nem "3"). O segmento do vetor entre a última linha inteiramente cruzada e a
ponta é destacado visualmente (espessura ou cor diferenciada) proporcional à fração, de modo que
a régua "quantas linhas o vetor atravessa" e o número na tela sejam a mesma leitura em dois
formatos, nunca dois fatos que precisam ser reconciliados pelo aluno.

**Justificativa:** ambiguidade aqui mina diretamente o compromisso #1 do projeto (o número **é** a
imagem). Arredondar silenciosamente sugeriria que a pilha só está definida em valores inteiros, o
que é falso e contraria o propósito pedagógico do widget.

**Revisitar quando:** não antecipado.

---

## D12 — Prontidão para 2-forms desde a Etapa 1: layout de dados, não abstração

**Decisão:** o `core/` representa formas diferenciais como um registro
`{ degree, dim, components }` com componentes indexados num `Float64Array`, na ordem lexicográfica
dos multi-índices estritamente crescentes. A avaliação de uma $k$-form sobre $k$ vetores é **uma
única função** com laço sobre esses multi-índices (determinante do menor correspondente), não uma
função por grau. `dim` é sempre parâmetro, nunca o literal `2`.

Consequência concreta: a Etapa 1 usa `evaluate(ω, [v])` com `degree = 1`; a Etapa 5 usa
`evaluate(ω, [u, v])` com `degree = 2`. Mesmo código, nenhum tipo novo.

**Alternativas descartadas:**
- Escrever a Etapa 1 com componentes nomeados (`{theta, phi}`) e uma contração explícita
  `ω.theta*v.theta + ω.phi*v.phi`, refatorando na Etapa 5. Descartada porque o retrofit tocaria a
  contração, o render e toda a serialização de cena da Etapa 4 — caro exatamente onde o projeto já
  terá tração.
- Hierarquia de classes por grau (`class TwoForm extends Form`). Descartada por [D9] — e é
  precisamente o que D9 proíbe.

**Por que isto não contradiz D9:** D9 proíbe *abstração de domínio* — hierarquia de classes,
registry de renderizadores, motor tensorial genérico. O que está sendo fixado aqui é
*representação*: como os números ficam na memória e qual a assinatura da função que os consome.
Um registro com três campos e uma função com um laço não preveem quais objetos vão existir; só
evitam que o grau da forma fique codificado na estrutura do programa. O sinal de alerta de D9
(uma classe base abstrata aparecendo em `core/`) continua valendo sem alteração.

**Distinção que o `PLAN.md` não fazia, registrada aqui:** "2-form" são duas coisas visualmente
distintas.
- Numa **superfície 2D** (esfera, hiperbólico, fatia de Schwarzschild — todas as cenas do plano
  atual), uma 2-form é top-degree: não tem direção, só densidade e orientação. Desenha-se como
  ladrilho de células cobrindo a superfície, e contar células dentro do paralelogramo gerado por
  $u$ e $v$ é o valor. Isto é o caso fácil, e é o único que as Etapas 5–6 precisam.
- Num **domínio 3D**, uma 2-form vira o desenho de tubos, com plano próprio e oclusão genuinamente
  difícil (a ordenação por normal comum de [D10] quebra). Hoje **nenhuma cena do plano tem domínio
  3D** — toda superfície é variedade 2D com mergulho em $\mathbb{R}^3$. O caso dos tubos é escopo
  novo, não coberto por nenhuma etapa, e não está sendo antecipado aqui.

**Oportunidade anotada, não comprometida:** a curvatura é uma 2-form, e a holonomia da Etapa 8 é a
integral dela sobre a área englobada pelo laço — que é exatamente o teste de Gauss-Bonnet de [D8].
Se a Etapa 5 entregar o ladrilho de células, a Etapa 8 pode mostrar o ângulo de holonomia **como a
contagem de células de curvatura dentro do laço**, unificando a tese central do projeto uma
dimensão acima. Não é compromisso de escopo; é o motivo pelo qual vale a pena a 2-form ficar bem
resolvida na Etapa 5.

**Ressalva pedagógica:** contar células **não** herda a validação do teste de 30 segundos da Etapa 1.
Atravessar linhas é uma varredura 1D; contar células envolve orientação e sinal, que é onde o aluno
costuma se perder. A Etapa 5 precisa do seu próprio teste com alunos reais.

**Revisitar quando:** Etapa 5, ao desenhar a primeira 2-form de verdade.
