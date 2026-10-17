/**
 * Lines, boxes and comb cells of a PDF page, read from its pdf.js operator list.
 * Pure: pass `page.getOperatorList()` and `pdfjs.OPS`. Everything comes out in PDF points, origin bottom-left
 * (the same space as stamps). Only what a form needs: horizontal rules (underlines), rectangles (boxes), small
 * squares (checkboxes) and rows of touching equal boxes (comb cells, e.g. nine boxes for an ID number).
 *
 * pdf.js v6 reports a path as `constructPath(paintOp, [pathData], minMax)`; pathData is a flat list of
 * `code, ...coords` with 0 = moveTo (x y), 1 = lineTo (x y), 2 = curveTo (6 numbers), 3 = quadratic (4), 4 = close.
 */
export interface OpList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/** The numeric operator codes of `pdfjs.OPS` that matter here. */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
}

export interface Rect { x: number; y: number; width: number; height: number }
export interface HLine { x1: number; x2: number; y: number }
export interface Comb extends Rect { cells: number }
export interface Shapes {
  /** Horizontal rules at least 15pt long (underlines to write on). */
  lines: HLine[];
  /** Rectangles that could hold text. */
  boxes: Rect[];
  /** Small squares (checkboxes). */
  checkboxes: Rect[];
  /** Runs of three or more touching equal boxes. */
  combs: Comb[];
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Apply `inner` first, then `outer`. */
function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

const flat = (v: unknown): number[] => {
  if (v == null) return [];
  if (typeof v === "number") return [v];
  if (typeof v === "object" && Symbol.iterator in (v as object)) return [...(v as Iterable<unknown>)].flatMap(flat);
  // A typed array that went through JSON: { "0": .., "1": .. }.
  if (typeof v === "object") return Object.keys(v as object).sort((a, b) => Number(a) - Number(b)).flatMap((k) => flat((v as Record<string, unknown>)[k]));
  return [];
};

interface SubPath { pts: [number, number][]; closed: boolean; curved: boolean }

function subPaths(data: number[]): SubPath[] {
  const out: SubPath[] = [];
  /** The path being built (created on demand). */
  const current = (): SubPath => {
    let last = out[out.length - 1];
    if (!last) { last = { pts: [], closed: false, curved: false }; out.push(last); }
    return last;
  };
  for (let i = 0; i < data.length; ) {
    const code = data[i++]!;
    if (code === 0) {
      // A moveTo straight after another one replaces it (pdf.js repeats the start point of a line).
      const last = out[out.length - 1];
      if (last && last.pts.length === 1) last.pts = [];
      else out.push({ pts: [], closed: false, curved: false });
      current().pts.push([data[i]!, data[i + 1]!]);
      i += 2;
    } else if (code === 1) {
      current().pts.push([data[i]!, data[i + 1]!]);
      i += 2;
    } else if (code === 2) {
      current().curved = true;
      i += 6;
    } else if (code === 3) {
      current().curved = true;
      i += 4;
    } else if (code === 4) {
      const last = out[out.length - 1];
      if (last) last.closed = true;
    } else {
      break; // unknown code: the rest cannot be read reliably
    }
  }
  return out;
}

const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

export function extractShapes(ops: OpList, c: OpCodes): Shapes {
  const stroking = new Set([c.stroke, c.closeStroke, c.fillStroke, c.eoFillStroke, c.closeFillStroke, c.closeEOFillStroke]);
  const filling = new Set([c.fill, c.eoFill, c.fillStroke, c.eoFillStroke, c.closeFillStroke, c.closeEOFillStroke]);
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  const lines: HLine[] = [];
  const rects: Rect[] = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]!;
    const args = ops.argsArray[i];
    if (fn === c.save) stack.push(ctm);
    else if (fn === c.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === c.transform) {
      const m = flat(args);
      if (m.length === 6) ctm = multiply(ctm, m as Matrix);
    } else if (fn === c.constructPath) {
      const a = Array.isArray(args) ? args : [];
      const paint = Number(a[0]);
      const isStroke = stroking.has(paint);
      const isFill = filling.has(paint);
      if (!isStroke && !isFill) continue; // clip or no-op path
      // Rotated or skewed pages/content are not read.
      if (ctm[1] !== 0 || ctm[2] !== 0) continue;
      for (const sp of subPaths(flat(a[1]))) {
        if (sp.curved) continue;
        const pts = sp.pts.map(([x, y]) => [ctm[0] * x + ctm[4], ctm[3] * y + ctm[5]] as [number, number]);
        const uniq = pts.filter((p, k) => k === 0 || p[0] !== pts[k - 1]![0] || p[1] !== pts[k - 1]![1]);
        if (uniq.length > 1 && uniq[0]![0] === uniq[uniq.length - 1]![0] && uniq[0]![1] === uniq[uniq.length - 1]![1]) uniq.pop();
        if (uniq.length === 2 && isStroke && near(uniq[0]![1], uniq[1]![1])) {
          const [x1, x2] = [Math.min(uniq[0]![0], uniq[1]![0]), Math.max(uniq[0]![0], uniq[1]![0])];
          if (x2 - x1 >= 15) lines.push({ x1, x2, y: (uniq[0]![1] + uniq[1]![1]) / 2 });
        } else if (uniq.length === 4) {
          const xs = [...new Set(uniq.map((p) => Math.round(p[0] * 10) / 10))].sort((p, q) => p - q);
          const ys = [...new Set(uniq.map((p) => Math.round(p[1] * 10) / 10))].sort((p, q) => p - q);
          if (xs.length !== 2 || ys.length !== 2) continue;
          const r: Rect = { x: xs[0]!, y: ys[0]!, width: xs[1]! - xs[0]!, height: ys[1]! - ys[0]! };
          if (r.height <= 1.5 && r.width >= 15) lines.push({ x1: r.x, x2: r.x + r.width, y: r.y + r.height / 2 }); // a rule drawn as a thin bar
          else if (isStroke && r.width >= 3 && r.height >= 3 && r.width <= 600 && r.height <= 120) rects.push(r);
          // Fill-only rectangles are backgrounds, not places to write.
        }
      }
    }
  }

  return classify(dedupeLines(lines), dedupeRects(rects));
}

function dedupeLines(lines: HLine[]): HLine[] {
  const out: HLine[] = [];
  for (const l of lines) if (!out.some((o) => near(o.y, l.y, 0.6) && near(o.x1, l.x1, 1) && near(o.x2, l.x2, 1))) out.push(l);
  return out;
}

function dedupeRects(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) if (!out.some((o) => near(o.x, r.x, 1) && near(o.y, r.y, 1) && near(o.width, r.width, 1) && near(o.height, r.height, 1))) out.push(r);
  return out;
}

function classify(lines: HLine[], rects: Rect[]): Shapes {
  // Comb cells first: touching, equal-sized boxes on one row.
  const rows = new Map<string, Rect[]>();
  for (const r of rects) {
    const key = `${Math.round(r.y)}|${Math.round(r.height)}`;
    rows.set(key, [...(rows.get(key) ?? []), r]);
  }
  const combs: Comb[] = [];
  const inComb = new Set<Rect>();
  for (const row of rows.values()) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    let run: Rect[] = [];
    const flush = () => {
      if (run.length >= 3) {
        const x = run[0]!.x;
        const right = run[run.length - 1]!.x + run[run.length - 1]!.width;
        combs.push({ x, y: run[0]!.y, width: right - x, height: run[0]!.height, cells: run.length });
        run.forEach((r) => inComb.add(r));
      }
      run = [];
    };
    for (const r of sorted) {
      const prev = run[run.length - 1];
      if (prev && near(r.x, prev.x + prev.width, 1.5) && near(r.width, prev.width, 1.5)) run.push(r);
      else { flush(); run = [r]; }
    }
    flush();
  }
  const rest = rects.filter((r) => !inComb.has(r));
  const isCheckbox = (r: Rect) => near(r.width, r.height, 2) && r.width >= 5 && r.width <= 16;
  return { lines, boxes: rest.filter((r) => !isCheckbox(r)), checkboxes: rest.filter(isCheckbox), combs };
}
