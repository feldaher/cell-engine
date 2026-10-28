// A small line plot of series over time on a 2D canvas: live readouts, earlier runs drawn faint
// behind the current one, a dashed second trace, and marks where the conditions changed.

export interface Series {
  label: string;
  colour: string;
  /** [x, y] in data units. */
  points: [number, number][];
  dash?: number[];
  faint?: boolean;
  width?: number;
}

export interface Axes { x: [number, number]; y: [number, number] }

export interface PlotOptions {
  /** x positions (data units) of vertical marks. */
  marks?: number[];
  margin?: number;
  grid?: boolean;
  /** Colours of the grid and marks, and of tick labels. */
  gridColour?: string;
  ink?: string;
  xTicks?: number;
  yTicks?: number;
  /** Labels the ticks with this formatter; none when omitted. */
  format?: (v: number) => string;
}

/** Ticks on 1-2-5 steps within [lo, hi], at most `maxTicks` of them. */
export function niceTicks(lo: number, hi: number, maxTicks: number): number[] {
  const span = hi - lo;
  if (!(span > 0) || maxTicks < 2) return [lo];
  const raw = span / (maxTicks - 1), mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= maxTicks - 1 + 1e-9)!;
  const out: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9 * step; k++) out.push(+(k * step).toPrecision(12));
  return out;
}

/** The extent of all the points; a flat or single-point range is widened so it has a height. */
export function bounds(series: Series[], pad = 0): Axes {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of series) for (const [x, y] of s.points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (!isFinite(x0)) return { x: [0, 1], y: [0, 1] };
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) { const h = Math.abs(y0) * 0.1 || 1; y0 -= h; y1 += h; }
  const py = (y1 - y0) * pad;
  return { x: [x0, x1], y: [y0 - py, y1 + py] };
}

export function toPixel(a: Axes, w: number, h: number, margin: number): (x: number, y: number) => [number, number] {
  const sx = (w - 2 * margin) / (a.x[1] - a.x[0]), sy = (h - 2 * margin) / (a.y[1] - a.y[0]);
  return (x, y) => [margin + (x - a.x[0]) * sx, h - margin - (y - a.y[0]) * sy];
}

export function drawPlot(ctx: CanvasRenderingContext2D, series: Series[], axes: Axes, opt: PlotOptions = {}): void {
  const { width: w, height: h } = ctx.canvas, m = opt.margin ?? 4;
  const P = toPixel(axes, w, h, m), grid = opt.gridColour ?? '#2a2d34';
  ctx.clearRect(0, 0, w, h);
  if (opt.grid !== false) {
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath();
    for (const y of niceTicks(axes.y[0], axes.y[1], opt.yTicks ?? 3)) { const [, py] = P(axes.x[0], y); ctx.moveTo(m, py); ctx.lineTo(w - m, py); }
    ctx.stroke();
    if (opt.format) {
      ctx.fillStyle = opt.ink ?? '#8a8d94';
      for (const x of niceTicks(axes.x[0], axes.x[1], opt.xTicks ?? 5)) { const [px] = P(x, axes.y[0]); ctx.fillText(opt.format(x), px, h - 1); }
    }
  }
  for (const x of opt.marks ?? []) {
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    const [px] = P(x, 0);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }
  for (const s of series) {
    if (s.points.length < 1) continue;
    ctx.save();
    ctx.globalAlpha = s.faint ? 0.3 : 1;
    ctx.strokeStyle = s.colour; ctx.lineWidth = s.width ?? 2; ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    s.points.forEach(([x, y], i) => {
      const [px, py] = P(x, Math.max(axes.y[0], Math.min(axes.y[1], y)));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }
}
