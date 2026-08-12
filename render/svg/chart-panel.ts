/**
 * O painel de carta: o mesmo ponto, o mesmo vetor e a mesma pilha, desenhados
 * direto nas coordenadas em que o aluno digitou a métrica.
 *
 * O contraste com o painel 3D é o conteúdo desta etapa. Aqui as folhas ficam
 * igualmente espaçadas *em coordenada*, sempre — na carta, ω com componentes
 * fixos tem conjuntos de nível retos e uniformes por definição. Empurradas para
 * ℝ³ pelo mergulho, as mesmas folhas ganham espaçamento físico variável: perto
 * do polo |e_φ| encolhe, e a mesma diferença de φ vira uma distância menor na
 * superfície. Arrastar p em direção ao polo mostra as duas imagens divergindo
 * enquanto o número não muda. É isso que faz ⟨ω,v⟩ ser geometria e não artefato
 * de coordenada.
 *
 * Uma ressalva que o desenho carrega: ω é um covetor *no ponto p*, não um campo.
 * Desenhar seus níveis pela carta inteira já é uma extensão — a extensão de
 * componentes constantes nessas coordenadas, que é escolha de carta, não
 * geometria. O véu radial centrado em p não é enfeite: ele apaga a parte do
 * desenho que essa escolha inventou e deixa nítido só o que é local a p.
 *
 * SVG e não Canvas/WebGL por D3: texto nítido, hit-testing de arraste e o efeito
 * de véu são nativos aqui e trabalhosos lá.
 */
import type { ChartBounds } from '../../core/degenerate';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Uma pilha a desenhar. São várias a partir da Etapa 3: ω e v♭ convivem na
 * mesma carta, e o que os distingue é a cor e a opacidade — não a geometria,
 * porque *são* a mesma espécie de objeto. É esse o ponto da etapa.
 */
export interface StackLayer {
  readonly components: Float64Array;
  readonly classe: string;
  readonly opacidade: number;
}

export interface ChartPanelState {
  readonly bounds: ChartBounds;
  readonly names: readonly string[];
  readonly stacks: readonly StackLayer[];
  /**
   * O paralelogramo gerado por dois vetores, quando há 2-form em cena.
   * É o que transforma "há um ladrilho" em "há **este** número de células":
   * sem região cercada não há o que contar.
   */
  readonly cell: {
    readonly u: Float64Array;
    readonly v: Float64Array;
    /**
     * Arestas da célula unitária em coordenadas da carta — a base dual de
     * (ω, η). É o que permite pintar as células como *áreas* em vez de deixá-las
     * como vãos entre linhas que o olho tem de reconstruir.
     *
     * Vem de fora e não é deduzida aqui porque a forma da célula **não pertence
     * à 2-form**: numa superfície ela é top-degree, só densidade e orientação.
     * Este retículo é o da fatoração ω∧η que o aluno escolheu; outra fatoração
     * com o mesmo σ daria células de outro formato e a mesma contagem.
     */
    readonly lattice: { readonly a: readonly number[]; readonly b: readonly number[] } | null;
  } | null;
  /** Segundo vetor desenhado, quando existe. */
  readonly vectorU: Float64Array | null;
  /**
   * O quadrilátero de fluxos da Etapa 7: dois caminhos que saem do mesmo ponto
   * e não chegam ao mesmo lugar. O vão entre as pontas é o colchete.
   */
  readonly bracket: {
    readonly caminhoXY: readonly Float64Array[];
    readonly caminhoYX: readonly Float64Array[];
  } | null;
  /**
   * O laço da Etapa 8 e o vetor que voltou dele.
   *
   * O transportado é desenhado a partir do mesmo ponto que o original: é a
   * sobreposição dos dois que mostra o giro. Separá-los mostraria dois vetores
   * em lugares diferentes, que é outra história.
   */
  readonly loop: {
    readonly caminho: readonly Float64Array[];
    readonly transportado: Float64Array;
  } | null;
  /**
   * A geodésica da Etapa 9 e, quando pedida, a vizinha do desvio geodésico.
   *
   * Duas e não uma porque a curvatura só vira *efeito* quando há com o que
   * comparar: uma curva sozinha é sempre "reta" do ponto de vista dela mesma.
   */
  readonly geodesic: {
    readonly principal: readonly Float64Array[];
    readonly vizinha: readonly Float64Array[] | null;
  } | null;
  readonly point: Float64Array;
  readonly vector: Float64Array;
  /** Máscara quadrada de degeneração (1 = não serve), ou null. */
  readonly mask: Uint8Array | null;
  readonly maskResolution: number;
  /**
   * O corte da fração ao longo de v, quando ele significa alguma coisa.
   *
   * Nulo no modo 2-form: ali o número conta células cercadas por *dois* vetores,
   * e não é propriedade de v sozinho — marcar um ponto no meio de v sugeriria
   * uma leitura que não existe.
   */
  readonly cut: { readonly value: number; readonly whole: number } | null;
}

export interface ChartPanelCallbacks {
  readonly onPointDrag: (x: number, y: number) => void;
  readonly onVectorDrag: (x: number, y: number) => void;
  readonly onVectorUDrag: (x: number, y: number) => void;
}

const MARGIN = { left: 46, right: 18, top: 18, bottom: 34 };
const MAX_SHEETS = 60;

export interface ChartPanel {
  readonly element: SVGSVGElement;
  render(state: ChartPanelState): void;
}

export function createChartPanel(callbacks: ChartPanelCallbacks): ChartPanel {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'chart-panel');
  svg.setAttribute('preserveAspectRatio', 'none');

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `
    <pattern id="hachura" width="7" height="7" patternTransform="rotate(45)"
             patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#e4380d" stroke-width="2.4" opacity="0.45"/>
    </pattern>
    <radialGradient id="veu-2d">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="55%" stop-color="#fff" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="veu-mask">
      <rect id="veu-rect" fill="url(#veu-2d)"/>
    </mask>
    <pattern id="celulas" patternUnits="userSpaceOnUse" width="1" height="1">
      <rect x="0.07" y="0.07" width="0.86" height="0.86" fill="#f4efe9" opacity="0.20"/>
    </pattern>`;
  svg.appendChild(defs);

  // A ordem importa: o paralelogramo é pintado *antes* das pilhas, para as
  // folhas atravessarem por cima dele e recortarem as células visivelmente. Se
  // ficasse por cima, cobriria justamente o que precisa ser contado.
  const layers = {
    hatch: group('camada-hachura'),
    grid: group('camada-grade'),
    cell: group('camada-celula'),
    stack: group('camada-pilha'),
    vector: group('camada-vetor'),
    handles: group('camada-alcas'),
    axes: group('camada-eixos'),
  };
  for (const layer of Object.values(layers)) svg.appendChild(layer);

  let latest: ChartPanelState | null = null;
  let drag: 'point' | 'vector' | 'vectorU' | null = null;
  let size = { width: 480, height: 360 };

  /**
   * A hachura só muda quando a métrica ou o tamanho do painel mudam — não quando
   * o ponto se move. Redesenhá-la a cada pointermove custava centenas de nós SVG
   * por evento e deixava Schwarzschild (que nem desenha 3D) mais lento que a
   * esfera. Guardar a máscara desenhada por último e comparar por identidade
   * resolve, porque cada recompilação da métrica produz um array novo.
   */
  let hatchedMask: Uint8Array | null = null;
  let hatchedSize = '';

  function group(className: string): SVGGElement {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', className);
    return g;
  }

  const plot = () => ({
    x: MARGIN.left,
    y: MARGIN.top,
    width: Math.max(10, size.width - MARGIN.left - MARGIN.right),
    height: Math.max(10, size.height - MARGIN.top - MARGIN.bottom),
  });

  /** Carta → pixel. */
  function toPixel(state: ChartPanelState, c: readonly number[]): [number, number] {
    const box = plot();
    const { min, max } = state.bounds;
    const u = (c[0]! - min[0]!) / (max[0]! - min[0]!);
    const v = (c[1]! - min[1]!) / (max[1]! - min[1]!);
    return [box.x + u * box.width, box.y + (1 - v) * box.height];
  }

  /** Pixel → carta. */
  function toChart(state: ChartPanelState, px: number, py: number): [number, number] {
    const box = plot();
    const { min, max } = state.bounds;
    const u = (px - box.x) / box.width;
    const v = 1 - (py - box.y) / box.height;
    return [min[0]! + u * (max[0]! - min[0]!), min[1]! + v * (max[1]! - min[1]!)];
  }

  function render(state: ChartPanelState): void {
    latest = state;
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0) size = { width: rect.width, height: rect.height };
    svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);

    for (const [name, layer] of Object.entries(layers)) {
      if (name !== 'hatch') layer.replaceChildren();
    }
    drawHatch(state);
    drawGrid();
    drawAxes(state);
    drawCell(state);
    drawStack(state);
    drawBracket(state);
    drawLoop(state);
    drawGeodesic(state);
    drawVector(state);
  }

  /**
   * O laço e o vetor que voltou dele.
   *
   * O transportado sai do mesmo ponto que o original, por cima dele: o ângulo
   * entre os dois *é* a leitura, e desenhá-los separados mostraria dois vetores
   * distintos em vez de um que girou.
   */
  function drawLoop(state: ChartPanelState): void {
    if (!state.loop) return;

    const contorno = document.createElementNS(NS, 'polyline');
    contorno.setAttribute(
      'points',
      state.loop.caminho.map((p) => toPixel(state, Array.from(p)).join(',')).join(' '),
    );
    contorno.setAttribute('class', 'laco');
    layers.vector.appendChild(contorno);

    const [sx, sy] = toPixel(state, Array.from(state.point));
    const [tx, ty] = toPixel(state, [
      state.point[0]! + state.loop.transportado[0]!,
      state.point[1]! + state.loop.transportado[1]!,
    ]);
    layers.vector.appendChild(line(sx, sy, tx, ty, 'vetor-transportado'));

    const angulo = Math.atan2(ty - sy, tx - sx);
    const ponta = document.createElementNS(NS, 'path');
    const t = 9;
    ponta.setAttribute(
      'd',
      `M ${tx} ${ty} L ${tx - t * Math.cos(angulo - 0.4)} ${ty - t * Math.sin(angulo - 0.4)} ` +
        `L ${tx - t * Math.cos(angulo + 0.4)} ${ty - t * Math.sin(angulo + 0.4)} Z`,
    );
    ponta.setAttribute('class', 'ponta-transportada');
    layers.vector.appendChild(ponta);
  }

  /**
   * Os dois caminhos e o vão.
   *
   * O vão é traçado por último e mais grosso porque ele *é* a leitura: os
   * caminhos existem para mostrar de onde ele veio. Se os dois campos comutam,
   * as pontas coincidem e não sobra segmento nenhum — o quadrilátero fecha, e o
   * fechamento é a informação.
   */
  function drawBracket(state: ChartPanelState): void {
    if (!state.bracket) return;
    const { caminhoXY, caminhoYX } = state.bracket;

    const polilinha = (pontos: readonly Float64Array[], classe: string): void => {
      if (pontos.length < 2) return;
      const el = document.createElementNS(NS, 'polyline');
      el.setAttribute(
        'points',
        pontos.map((p) => toPixel(state, Array.from(p)).join(',')).join(' '),
      );
      el.setAttribute('class', classe);
      layers.vector.appendChild(el);
    };

    polilinha(caminhoXY, 'caminho-x');
    polilinha(caminhoYX, 'caminho-y');

    const fimXY = caminhoXY[caminhoXY.length - 1];
    const fimYX = caminhoYX[caminhoYX.length - 1];
    if (!fimXY || !fimYX) return;

    const [ax, ay] = toPixel(state, Array.from(fimYX));
    const [bx, by] = toPixel(state, Array.from(fimXY));
    layers.vector.appendChild(line(ax, ay, bx, by, 'vao'));
    layers.handles.appendChild(circle(ax, ay, 4.5, 'alca alca-u'));
    layers.handles.appendChild(circle(bx, by, 4.5, 'alca alca-ponto'));
  }

  /** O paralelogramo gerado por u e v — a região cujas células se contam. */
  function drawCell(state: ChartPanelState): void {
    if (!state.cell) return;
    const { u, v } = state.cell;
    const p = state.point;
    const cantos = [
      [p[0]!, p[1]!],
      [p[0]! + u[0]!, p[1]! + u[1]!],
      [p[0]! + u[0]! + v[0]!, p[1]! + u[1]! + v[1]!],
      [p[0]! + v[0]!, p[1]! + v[1]!],
    ].map((c) => toPixel(state, c));

    const poligono = document.createElementNS(NS, 'polygon');
    poligono.setAttribute('points', cantos.map(([x, y]) => `${x},${y}`).join(' '));
    poligono.setAttribute('class', 'celula');
    // Ladrilho quando as células são contáveis; liso quando não são, para o
    // desenho nunca sugerir que há o que contar onde não há.
    poligono.setAttribute(
      'fill',
      ladrilhar(state) ? 'url(#celulas)' : 'rgba(244, 239, 233, 0.11)',
    );
    layers.cell.appendChild(poligono);
  }

  /**
   * Alinha o padrão de células ao retículo de ω e η, ancorado em p.
   *
   * Devolve falso quando não há o que ladrilhar: ω e η paralelos (σ ≈ 0, células
   * infinitas) ou células menores que alguns pixels, caso em que o padrão viraria
   * um borrão cinza e mentiria sobre haver algo contável. Aí fica o preenchimento
   * liso, e o numeral continua dizendo a verdade.
   */
  function ladrilhar(state: ChartPanelState): boolean {
    const rede = state.cell?.lattice;
    const padrao = defs.querySelector('#celulas');
    if (!rede || !padrao) return false;

    const box = plot();
    const { min, max } = state.bounds;
    const sx = box.width / (max[0]! - min[0]!);
    const sy = box.height / (max[1]! - min[1]!);

    // Carta → pixel, com o y invertido como no resto do painel.
    const ax = rede.a[0]! * sx;
    const ay = -rede.a[1]! * sy;
    const bx = rede.b[0]! * sx;
    const by = -rede.b[1]! * sy;

    const area = Math.abs(ax * by - ay * bx);
    if (!Number.isFinite(area) || area < 90) return false;

    const [px, py] = toPixel(state, Array.from(state.point));
    padrao.setAttribute('patternTransform', `matrix(${ax} ${ay} ${bx} ${by} ${px} ${py})`);
    return true;
  }

  // ------------------------------------------------------------- camadas

  function drawHatch(state: ChartPanelState): void {
    const stamp = `${size.width}x${size.height}`;
    if (state.mask === hatchedMask && stamp === hatchedSize) return;
    hatchedMask = state.mask;
    hatchedSize = stamp;
    layers.hatch.replaceChildren();

    if (!state.mask) return;
    const box = plot();
    const n = state.maskResolution;
    const cellW = box.width / (n - 1);
    const cellH = box.height / (n - 1);

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (state.mask[row * n + col] !== 1) continue;
        const cell = document.createElementNS(NS, 'rect');
        cell.setAttribute('x', String(box.x + col * cellW - cellW / 2));
        cell.setAttribute('y', String(box.y + box.height - row * cellH - cellH / 2));
        cell.setAttribute('width', String(cellW));
        cell.setAttribute('height', String(cellH));
        cell.setAttribute('fill', 'url(#hachura)');
        layers.hatch.appendChild(cell);
      }
    }
  }

  function drawGrid(): void {
    const box = plot();
    const STEPS = 8;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      layers.grid.appendChild(
        line(box.x + t * box.width, box.y, box.x + t * box.width, box.y + box.height, 'grade'),
      );
      layers.grid.appendChild(
        line(box.x, box.y + t * box.height, box.x + box.width, box.y + t * box.height, 'grade'),
      );
    }
    const frame = document.createElementNS(NS, 'rect');
    frame.setAttribute('x', String(box.x));
    frame.setAttribute('y', String(box.y));
    frame.setAttribute('width', String(box.width));
    frame.setAttribute('height', String(box.height));
    frame.setAttribute('class', 'moldura');
    layers.grid.appendChild(frame);
  }

  function drawAxes(state: ChartPanelState): void {
    const box = plot();
    const { min, max } = state.bounds;
    layers.axes.appendChild(
      text(box.x + box.width / 2, box.y + box.height + 24, state.names[0] ?? 'x', 'eixo'),
    );
    const vertical = text(14, box.y + box.height / 2, state.names[1] ?? 'y', 'eixo');
    vertical.setAttribute('transform', `rotate(-90 14 ${box.y + box.height / 2})`);
    layers.axes.appendChild(vertical);

    layers.axes.appendChild(text(box.x, box.y + box.height + 24, fmt(min[0]!), 'tick'));
    layers.axes.appendChild(
      text(box.x + box.width, box.y + box.height + 24, fmt(max[0]!), 'tick'),
    );
    layers.axes.appendChild(text(box.x - 8, box.y + box.height, fmt(min[1]!), 'tick fim'));
    layers.axes.appendChild(text(box.x - 8, box.y + 10, fmt(max[1]!), 'tick fim'));
  }

  /**
   * As pilhas. Na carta são retas: ω_i (x - p)^i = k, para cada 1-form.
   * O véu radial centrado em p reproduz D10 no 2D — a folha aparece perto de
   * onde a contração é lida e some longe dela, e é compartilhado por todas as
   * camadas porque a localidade é do ponto, não da forma.
   */
  function drawStack(state: ChartPanelState): void {
    const box = plot();
    const [px, py] = toPixel(state, Array.from(state.point));
    const veuRect = defs.querySelector('#veu-rect');
    const radius = Math.min(box.width, box.height) * 0.55;
    veuRect?.setAttribute('x', String(px - radius));
    veuRect?.setAttribute('y', String(py - radius));
    veuRect?.setAttribute('width', String(radius * 2));
    veuRect?.setAttribute('height', String(radius * 2));
    layers.stack.setAttribute('mask', 'url(#veu-mask)');

    for (const camada of state.stacks) {
      if (camada.opacidade > 0.01) drawLayer(state, camada);
    }
  }

  function drawLayer(state: ChartPanelState, camada: StackLayer): void {
    const [w0, w1] = [camada.components[0]!, camada.components[1]!];
    const normSq = w0 * w0 + w1 * w1;
    if (normSq < 1e-12) return;

    const { min, max } = state.bounds;
    const corners = [
      [min[0]!, min[1]!],
      [min[0]!, max[1]!],
      [max[0]!, min[1]!],
      [max[0]!, max[1]!],
    ];
    let lo = Infinity;
    let hi = -Infinity;
    for (const corner of corners) {
      const value = w0 * (corner[0]! - state.point[0]!) + w1 * (corner[1]! - state.point[1]!);
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
    if (hi - lo > MAX_SHEETS) {
      const middle = (hi + lo) / 2;
      lo = middle - MAX_SHEETS / 2;
      hi = middle + MAX_SHEETS / 2;
    }

    for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
      const segment = clipLevelLine(state, camada.components, k, normSq);
      if (!segment) continue;
      const [a, b] = segment;
      const [ax, ay] = toPixel(state, a);
      const [bx, by] = toPixel(state, b);
      const el = line(ax, ay, bx, by, `${camada.classe}${k === 0 ? ' folha-zero' : ''}`);
      el.setAttribute('opacity', String(camada.opacidade));
      layers.stack.appendChild(el);
    }
  }

  /** Recorta a reta de nível k no retângulo da carta (Liang-Barsky). */
  function clipLevelLine(
    state: ChartPanelState,
    components: Float64Array,
    k: number,
    normSq: number,
  ): [number[], number[]] | null {
    const [w0, w1] = [components[0]!, components[1]!];
    const anchor = [
      state.point[0]! + (k * w0) / normSq,
      state.point[1]! + (k * w1) / normSq,
    ];
    const dir = [-w1, w0];
    const { min, max } = state.bounds;

    let tMin = -Infinity;
    let tMax = Infinity;
    for (let axis = 0; axis < 2; axis++) {
      const p = dir[axis]!;
      const lower = min[axis]! - anchor[axis]!;
      const upper = max[axis]! - anchor[axis]!;
      if (Math.abs(p) < 1e-12) {
        if (lower > 0 || upper < 0) return null;
        continue;
      }
      const t1 = lower / p;
      const t2 = upper / p;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
    if (tMin >= tMax) return null;

    return [
      [anchor[0]! + tMin * dir[0]!, anchor[1]! + tMin * dir[1]!],
      [anchor[0]! + tMax * dir[0]!, anchor[1]! + tMax * dir[1]!],
    ];
  }

  /** Uma seta lisa, sem o corte de fração: o segundo vetor não é o que se lê. */
  function drawSimpleArrow(state: ChartPanelState, comps: Float64Array): void {
    const [sx, sy] = toPixel(state, Array.from(state.point));
    const [ex, ey] = toPixel(state, [
      state.point[0]! + comps[0]!,
      state.point[1]! + comps[1]!,
    ]);
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) return;

    layers.vector.appendChild(line(sx, sy, ex, ey, 'vetor-u'));
    const angulo = Math.atan2(ey - sy, ex - sx);
    const ponta = document.createElementNS(NS, 'path');
    const t = 9;
    ponta.setAttribute(
      'd',
      `M ${ex} ${ey} L ${ex - t * Math.cos(angulo - 0.4)} ${ey - t * Math.sin(angulo - 0.4)} ` +
        `L ${ex - t * Math.cos(angulo + 0.4)} ${ey - t * Math.sin(angulo + 0.4)} Z`,
    );
    ponta.setAttribute('class', 'ponta-u');
    layers.vector.appendChild(ponta);
    layers.handles.appendChild(circle(ex, ey, 6, 'alca alca-u'));
  }

  /** A geodésica, e a vizinha atrás dela. */
  function drawGeodesic(state: ChartPanelState): void {
    if (!state.geodesic) return;
    const traçar = (pontos: readonly Float64Array[], classe: string): void => {
      if (pontos.length < 2) return;
      const el = document.createElementNS(NS, 'polyline');
      el.setAttribute(
        'points',
        pontos.map((p) => toPixel(state, Array.from(p)).join(',')).join(' '),
      );
      el.setAttribute('class', classe);
      layers.vector.appendChild(el);
    };
    if (state.geodesic.vizinha) traçar(state.geodesic.vizinha, 'traco-vizinho');
    traçar(state.geodesic.principal, 'traco-geodesico');
  }

  function drawVector(state: ChartPanelState): void {
    // No modo do colchete o conteúdo é o quadrilátero; v e u não participam da
    // leitura e só competiriam com ele por atenção.
    if (state.bracket) return;
    if (state.vectorU) drawSimpleArrow(state, state.vectorU);
    const start = Array.from(state.point);
    const end = [state.point[0]! + state.vector[0]!, state.point[1]! + state.vector[1]!];
    const [sx, sy] = toPixel(state, start);
    const [ex, ey] = toPixel(state, end);

    const corte = state.cut;
    const crossed =
      corte && Number.isFinite(corte.value) && Math.abs(corte.value) > 1e-9
        ? Math.min(1, Math.max(0, corte.whole / corte.value))
        : 1;
    const cx = sx + (ex - sx) * crossed;
    const cy = sy + (ey - sy) * crossed;

    layers.vector.appendChild(line(sx, sy, cx, cy, 'vetor-inteiro'));
    if (corte) layers.vector.appendChild(line(cx, cy, ex, ey, 'vetor-fracao'));

    const angle = Math.atan2(ey - sy, ex - sx);
    const head = document.createElementNS(NS, 'path');
    const size9 = 9;
    head.setAttribute(
      'd',
      `M ${ex} ${ey} L ${ex - size9 * Math.cos(angle - 0.4)} ${ey - size9 * Math.sin(angle - 0.4)} ` +
        `L ${ex - size9 * Math.cos(angle + 0.4)} ${ey - size9 * Math.sin(angle + 0.4)} Z`,
    );
    const temFracao = corte !== null && Math.abs(corte.value - corte.whole) > 1e-6;
    head.setAttribute('class', temFracao ? 'ponta-fracao' : 'ponta');
    layers.vector.appendChild(head);

    layers.handles.appendChild(circle(sx, sy, 6, 'alca alca-ponto'));
    layers.handles.appendChild(circle(ex, ey, 6, 'alca alca-ponta'));
  }

  // ------------------------------------------------------------ interação

  svg.addEventListener('pointerdown', (event) => {
    if (!latest) return;
    const [px, py] = local(event);
    const perto = (comps: Float64Array): boolean => {
      const [x, y] = toPixel(latest!, [
        latest!.point[0]! + comps[0]!,
        latest!.point[1]! + comps[1]!,
      ]);
      return Math.hypot(px - x, py - y) < 14;
    };

    const [sx, sy] = toPixel(latest, Array.from(latest.point));
    // A ponta de v ganha da de u quando as duas estão sob o cursor: v é o vetor
    // que o numeral lê, então é o que o aluno provavelmente quis pegar.
    if (perto(latest.vector)) drag = 'vector';
    else if (latest.vectorU && perto(latest.vectorU)) drag = 'vectorU';
    else if (Math.hypot(px - sx, py - sy) < 14) drag = 'point';
    else return;

    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  svg.addEventListener('pointermove', (event) => {
    if (!drag || !latest) return;
    const [px, py] = local(event);
    const [cx, cy] = toChart(latest, px, py);
    if (drag === 'point') callbacks.onPointDrag(cx, cy);
    else if (drag === 'vectorU') {
      callbacks.onVectorUDrag(cx - latest.point[0]!, cy - latest.point[1]!);
    } else callbacks.onVectorDrag(cx - latest.point[0]!, cy - latest.point[1]!);
  });

  const stop = (event: PointerEvent): void => {
    if (!drag) return;
    drag = null;
    svg.releasePointerCapture(event.pointerId);
  };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);

  function local(event: PointerEvent): [number, number] {
    const rect = svg.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  return { element: svg, render };
}

// ------------------------------------------------------------- utilidades

function line(x1: number, y1: number, x2: number, y2: number, className: string): SVGLineElement {
  const el = document.createElementNS(NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('class', className);
  return el;
}

function circle(cx: number, cy: number, r: number, className: string): SVGCircleElement {
  const el = document.createElementNS(NS, 'circle');
  el.setAttribute('cx', String(cx));
  el.setAttribute('cy', String(cy));
  el.setAttribute('r', String(r));
  el.setAttribute('class', className);
  return el;
}

function text(x: number, y: number, content: string, className: string): SVGTextElement {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('class', className);
  el.textContent = content;
  return el;
}

function fmt(value: number): string {
  if (Math.abs(value - Math.PI) < 1e-6) return 'π';
  if (Math.abs(value + Math.PI) < 1e-6) return '−π';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
