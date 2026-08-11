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

export interface ChartPanelState {
  readonly bounds: ChartBounds;
  readonly names: readonly string[];
  /** Componentes de ω na base coordenada. */
  readonly omega: Float64Array;
  readonly point: Float64Array;
  readonly vector: Float64Array;
  /** Máscara quadrada de degeneração (1 = não serve), ou null. */
  readonly mask: Uint8Array | null;
  readonly maskResolution: number;
  /** Quantas folhas o vetor atravessa — para o corte da fração. */
  readonly value: number;
  readonly whole: number;
}

export interface ChartPanelCallbacks {
  readonly onPointDrag: (x: number, y: number) => void;
  readonly onVectorDrag: (x: number, y: number) => void;
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
    </mask>`;
  svg.appendChild(defs);

  const layers = {
    hatch: group('camada-hachura'),
    grid: group('camada-grade'),
    stack: group('camada-pilha'),
    vector: group('camada-vetor'),
    handles: group('camada-alcas'),
    axes: group('camada-eixos'),
  };
  for (const layer of Object.values(layers)) svg.appendChild(layer);

  let latest: ChartPanelState | null = null;
  let drag: 'point' | 'vector' | null = null;
  let size = { width: 480, height: 360 };

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

    for (const layer of Object.values(layers)) layer.replaceChildren();
    drawHatch(state);
    drawGrid(state);
    drawAxes(state);
    drawStack(state);
    drawVector(state);
  }

  // ------------------------------------------------------------- camadas

  function drawHatch(state: ChartPanelState): void {
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

  function drawGrid(state: ChartPanelState): void {
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
   * As folhas de ω. Na carta são retas: ω_i (x - p)^i = k.
   * O véu radial centrado em p reproduz D10 no 2D — a folha aparece perto de
   * onde a contração é lida e some longe dela.
   */
  function drawStack(state: ChartPanelState): void {
    const [w0, w1] = [state.omega[0]!, state.omega[1]!];
    const normSq = w0 * w0 + w1 * w1;
    if (normSq < 1e-12) return;

    const box = plot();
    const [px, py] = toPixel(state, Array.from(state.point));
    const veuRect = defs.querySelector('#veu-rect');
    const radius = Math.min(box.width, box.height) * 0.55;
    veuRect?.setAttribute('x', String(px - radius));
    veuRect?.setAttribute('y', String(py - radius));
    veuRect?.setAttribute('width', String(radius * 2));
    veuRect?.setAttribute('height', String(radius * 2));
    layers.stack.setAttribute('mask', 'url(#veu-mask)');

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
      const segment = clipLevelLine(state, k, normSq);
      if (!segment) continue;
      const [a, b] = segment;
      const [ax, ay] = toPixel(state, a);
      const [bx, by] = toPixel(state, b);
      const el = line(ax, ay, bx, by, k === 0 ? 'folha folha-zero' : 'folha');
      layers.stack.appendChild(el);
    }
  }

  /** Recorta a reta de nível k no retângulo da carta (Liang-Barsky). */
  function clipLevelLine(
    state: ChartPanelState,
    k: number,
    normSq: number,
  ): [number[], number[]] | null {
    const [w0, w1] = [state.omega[0]!, state.omega[1]!];
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

  function drawVector(state: ChartPanelState): void {
    const start = Array.from(state.point);
    const end = [state.point[0]! + state.vector[0]!, state.point[1]! + state.vector[1]!];
    const [sx, sy] = toPixel(state, start);
    const [ex, ey] = toPixel(state, end);

    const crossed =
      Number.isFinite(state.value) && Math.abs(state.value) > 1e-9
        ? Math.min(1, Math.max(0, state.whole / state.value))
        : 1;
    const cx = sx + (ex - sx) * crossed;
    const cy = sy + (ey - sy) * crossed;

    layers.vector.appendChild(line(sx, sy, cx, cy, 'vetor-inteiro'));
    layers.vector.appendChild(line(cx, cy, ex, ey, 'vetor-fracao'));

    const angle = Math.atan2(ey - sy, ex - sx);
    const head = document.createElementNS(NS, 'path');
    const size9 = 9;
    head.setAttribute(
      'd',
      `M ${ex} ${ey} L ${ex - size9 * Math.cos(angle - 0.4)} ${ey - size9 * Math.sin(angle - 0.4)} ` +
        `L ${ex - size9 * Math.cos(angle + 0.4)} ${ey - size9 * Math.sin(angle + 0.4)} Z`,
    );
    head.setAttribute('class', Math.abs(state.value - state.whole) > 1e-6 ? 'ponta-fracao' : 'ponta');
    layers.vector.appendChild(head);

    layers.handles.appendChild(circle(sx, sy, 6, 'alca alca-ponto'));
    layers.handles.appendChild(circle(ex, ey, 6, 'alca alca-ponta'));
  }

  // ------------------------------------------------------------ interação

  svg.addEventListener('pointerdown', (event) => {
    if (!latest) return;
    const [px, py] = local(event);
    const [sx, sy] = toPixel(latest, Array.from(latest.point));
    const [ex, ey] = toPixel(latest, [
      latest.point[0]! + latest.vector[0]!,
      latest.point[1]! + latest.vector[1]!,
    ]);
    const nearTip = Math.hypot(px - ex, py - ey) < 14;
    const nearPoint = Math.hypot(px - sx, py - sy) < 14;
    if (!nearTip && !nearPoint) return;

    drag = nearTip ? 'vector' : 'point';
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  svg.addEventListener('pointermove', (event) => {
    if (!drag || !latest) return;
    const [px, py] = local(event);
    const [cx, cy] = toChart(latest, px, py);
    if (drag === 'point') callbacks.onPointDrag(cx, cy);
    else callbacks.onVectorDrag(cx - latest.point[0]!, cy - latest.point[1]!);
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
