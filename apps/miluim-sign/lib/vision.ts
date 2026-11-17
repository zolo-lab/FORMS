/**
 * Phone-photo scan and signature spotting.
 *
 * The main forms app detects fields from PDF vectors (`src/lib/pdf/detect.ts`): a label
 * containing "חתימה" is a signature, and the writing area sits to its left. A phone photo
 * has no vectors, so this file does the same job on pixels: straighten the page, then find
 * X marks, a column of them, and signature underlines. PDF text still uses the same Hebrew
 * cues (see `fieldsFromPdfItems` in the browser helper).
 */
import type { DetectedField } from "./types";

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface Pt { x: number; y: number }
export type Quad = [Pt, Pt, Pt, Pt];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function resize(src: Raster, maxW: number): Raster {
  if (src.width <= maxW) return src;
  const scale = maxW / src.width;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      data[di] = src.data[si]!;
      data[di + 1] = src.data[si + 1]!;
      data[di + 2] = src.data[si + 2]!;
      data[di + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

export function rotate90(src: Raster, turns: number): Raster {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return src;
  const w = t % 2 === 0 ? src.width : src.height;
  const h = t % 2 === 0 ? src.height : src.width;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      let nx = x;
      let ny = y;
      if (t === 1) { nx = src.height - 1 - y; ny = x; }
      else if (t === 2) { nx = src.width - 1 - x; ny = src.height - 1 - y; }
      else { nx = y; ny = src.width - 1 - x; }
      const si = (y * src.width + x) * 4;
      const di = (ny * w + nx) * 4;
      data[di] = src.data[si]!;
      data[di + 1] = src.data[si + 1]!;
      data[di + 2] = src.data[si + 2]!;
      data[di + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

export function rotateDeg(src: Raster, deg: number): Raster {
  if (Math.abs(deg) < 0.05) return src;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const cx = src.width / 2;
  const cy = src.height / 2;
  const corners = [
    [-cx, -cy],
    [src.width - cx, -cy],
    [src.width - cx, src.height - cy],
    [-cx, src.height - cy],
  ].map(([x, y]) => ({ x: c * x! - s * y!, y: s * x! + c * y! }));
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));
  const w = Math.max(1, Math.round(maxX - minX));
  const h = Math.max(1, Math.round(maxY - minY));
  const data = new Uint8ClampedArray(w * h * 4);
  data.fill(255);
  const ic = Math.cos(-rad);
  const is = Math.sin(-rad);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = minX + x;
      const dy = minY + y;
      const sx = ic * dx - is * dy + cx;
      const sy = is * dx + ic * dy + cy;
      const p = sample(src, sx, sy);
      const di = (y * w + x) * 4;
      data[di] = p[0];
      data[di + 1] = p[1];
      data[di + 2] = p[2];
      data[di + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function sample(src: Raster, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x > src.width - 1 || y > src.height - 1) return [255, 255, 255];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => {
    const i = (yy * src.width + xx) * 4;
    return [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!] as [number, number, number];
  };
  const a = at(x0, y0);
  const b = at(x1, y0);
  const c = at(x0, y1);
  const d = at(x1, y1);
  const mix = (i: number) => Math.round(
    a[i] * (1 - fx) * (1 - fy) + b[i] * fx * (1 - fy) + c[i] * (1 - fx) * fy + d[i] * fx * fy,
  );
  return [mix(0), mix(1), mix(2)];
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    const tmp = M[col]!;
    M[col] = M[pivot]!;
    M[pivot] = tmp;
    const div = M[col]![col]!;
    if (Math.abs(div) < 1e-8) return null;
    for (let c = col; c <= n; c++) M[col]![c] = M[col]![c]! / div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

function homography(src: Pt[], dst: Pt[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i]!;
    const d = dst[i]!;
    A.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    b.push(d.y);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [...h, 1];
}

function applyH(h: number[], x: number, y: number): Pt {
  const den = h[6]! * x + h[7]! * y + h[8]!;
  return { x: (h[0]! * x + h[1]! * y + h[2]!) / den, y: (h[3]! * x + h[4]! * y + h[5]!) / den };
}

export function warp(src: Raster, corners: Quad, outW: number, outH: number): Raster {
  const dst = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = homography(dst, corners);
  const data = new Uint8ClampedArray(outW * outH * 4);
  if (!h) {
    data.fill(255);
    return { width: outW, height: outH, data };
  }
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = applyH(h, x, y);
      const s = sample(src, p.x, p.y);
      const di = (y * outW + x) * 4;
      data[di] = s[0];
      data[di + 1] = s[1];
      data[di + 2] = s[2];
      data[di + 3] = 255;
    }
  }
  return { width: outW, height: outH, data };
}

export function fullQuad(src: Raster): Quad {
  return [
    { x: 0, y: 0 },
    { x: src.width - 1, y: 0 },
    { x: src.width - 1, y: src.height - 1 },
    { x: 0, y: src.height - 1 },
  ];
}

function lumAt(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
}

function grayOf(src: Raster): Float32Array {
  const g = new Float32Array(src.width * src.height);
  for (let p = 0, i = 0; p < g.length; p++, i += 4) g[p] = lumAt(src.data, i);
  return g;
}

function boxBlur(g: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(g.length);
  const out = new Float32Array(g.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -1; k <= 1; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        s += g[y * w + xx]!;
        n++;
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -1; k <= 1; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x]!;
        n++;
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

interface Line { theta: number; rho: number; votes: number }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function fitDependent(pts: Pt[], independent: "x" | "y"): { slope: number; intercept: number } | null {
  if (pts.length < 6) return null;
  const dep = (p: Pt) => independent === "y" ? p.x : p.y;
  const ind = (p: Pt) => independent === "y" ? p.y : p.x;
  const mid = median(pts.map(dep));
  const kept = pts.filter((p) => Math.abs(dep(p) - mid) < 18);
  if (kept.length < 6) return null;
  let n = 0, si = 0, sd = 0, sii = 0, sid = 0;
  for (const p of kept) {
    const i = ind(p);
    const d = dep(p);
    n++;
    si += i;
    sd += d;
    sii += i * i;
    sid += i * d;
  }
  const den = n * sii - si * si;
  if (Math.abs(den) < 1e-3) return { slope: 0, intercept: sd / n };
  const slope = (n * sid - si * sd) / den;
  return { slope, intercept: (sd - slope * si) / n };
}

/** Paper against a darker table: walk in from each edge until the page turns light, then fit four lines. */
function scanPaper(src: Raster): Quad | null {
  const small = resize(src, 360);
  const w = small.width;
  const h = small.height;
  const g = grayOf(small);
  const bright = (x: number, y: number) => (g[y * w + x] ?? 0) > 168;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let y = Math.floor(h * 0.08); y < h * 0.92; y += 3) {
    let run = 0;
    for (let x = 0; x < w * 0.6; x++) {
      if (bright(x, y)) {
        if (++run >= 6) { left.push({ x: x - 5, y }); break; }
      } else run = 0;
    }
    run = 0;
    for (let x = w - 1; x > w * 0.4; x--) {
      if (bright(x, y)) {
        if (++run >= 6) { right.push({ x: x + 5, y }); break; }
      } else run = 0;
    }
  }
  for (let x = Math.floor(w * 0.08); x < w * 0.92; x += 3) {
    let run = 0;
    for (let y = 0; y < h * 0.5; y++) {
      if (bright(x, y)) {
        if (++run >= 6) { top.push({ x, y: y - 5 }); break; }
      } else run = 0;
    }
    run = 0;
    for (let y = h - 1; y > h * 0.5; y--) {
      if (bright(x, y)) {
        if (++run >= 6) { bottom.push({ x, y: y + 5 }); break; }
      } else run = 0;
    }
  }
  if (left.length < 8 || right.length < 8 || top.length < 8 || bottom.length < 8) return null;
  const leftFit = fitDependent(left, "y");
  const rightFit = fitDependent(right, "y");
  const topFit = fitDependent(top, "x");
  const bottomFit = fitDependent(bottom, "x");
  if (!leftFit || !rightFit || !topFit || !bottomFit) return null;
  const meet = (vertical: { slope: number; intercept: number }, horizontal: { slope: number; intercept: number }): Pt | null => {
    const denom = 1 - vertical.slope * horizontal.slope;
    if (Math.abs(denom) < 1e-3) return null;
    const x = (vertical.slope * horizontal.intercept + vertical.intercept) / denom;
    const y = horizontal.slope * x + horizontal.intercept;
    return { x, y };
  };
  const tl = meet(leftFit, topFit);
  const tr = meet(rightFit, topFit);
  const br = meet(rightFit, bottomFit);
  const bl = meet(leftFit, bottomFit);
  if (!tl || !tr || !br || !bl) return null;
  const quad: Quad = [tl, tr, br, bl];
  const area = Math.abs(quad.reduce((sum, p, i) => {
    const q = quad[(i + 1) % 4]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2);
  const inside = quad.every((p) => p.x > -w * 0.06 && p.y > -h * 0.06 && p.x < w * 1.06 && p.y < h * 1.06);
  if (!inside || area < w * h * 0.45 || area > w * h * 0.995) return null;
  const sx = src.width / w;
  const sy = src.height / h;
  return quad.map((p) => ({ x: clamp(p.x * sx, 0, src.width - 1), y: clamp(p.y * sy, 0, src.height - 1) })) as Quad;
}

export function suggestQuad(src: Raster): Quad {
  const scanned = scanPaper(src);
  if (scanned) return scanned;
  const frame = fullQuad(src);
  const small = resize(src, 420);
  const w = small.width;
  const h = small.height;
  const g = boxBlur(grayOf(small), w, h);
  const mag = new Float32Array(w * h);
  const edges: Pt[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -g[i - w - 1]! + g[i - w + 1]! - 2 * g[i - 1]! + 2 * g[i + 1]! - g[i + w - 1]! + g[i + w + 1]!;
      const gy = -g[i - w - 1]! - 2 * g[i - w]! - g[i - w + 1]! + g[i + w - 1]! + 2 * g[i + w]! + g[i + w + 1]!;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > 40) edges.push({ x, y });
    }
  }
  if (edges.length < 50) return frame;
  const step = Math.max(1, Math.floor(edges.length / 5000));
  const diag = Math.hypot(w, h);
  const tBins = 180;
  const rBins = Math.ceil(diag * 2) + 2;
  const acc = new Uint16Array(tBins * rBins);
  for (let e = 0; e < edges.length; e += step) {
    const pt = edges[e]!;
    for (let t = 0; t < tBins; t++) {
      const th = (t * Math.PI) / tBins;
      const rho = pt.x * Math.cos(th) + pt.y * Math.sin(th);
      const r = Math.round(rho + diag);
      if (r >= 0 && r < rBins) acc[t * rBins + r]!++;
    }
  }
  const minVotes = Math.max(25, Math.floor(w * 0.12));
  const peaks: Line[] = [];
  for (let t = 0; t < tBins; t++) {
    for (let r = 0; r < rBins; r++) {
      const v = acc[t * rBins + r]!;
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -3; dt <= 3 && isMax; dt++) {
        for (let dr = -5; dr <= 5; dr++) {
          const tt = (t + dt + tBins) % tBins;
          const rr = r + dr;
          if (rr < 0 || rr >= rBins) continue;
          if (acc[tt * rBins + rr]! > v) { isMax = false; break; }
        }
      }
      if (!isMax) continue;
      peaks.push({ theta: (t * Math.PI) / tBins, rho: r - diag, votes: v });
    }
  }
  if (!peaks.length) return frame;
  const yAt = (ln: Line, x: number) => {
    const s = Math.sin(ln.theta);
    if (Math.abs(s) < 0.35) return null;
    return (ln.rho - x * Math.cos(ln.theta)) / s;
  };
  const xAt = (ln: Line, y: number) => {
    const c = Math.cos(ln.theta);
    if (Math.abs(c) < 0.35) return null;
    return (ln.rho - y * Math.sin(ln.theta)) / c;
  };
  const horiz = peaks.filter((ln) => Math.abs(ln.theta - Math.PI / 2) < 0.55);
  const vert = peaks.filter((ln) => ln.theta < 0.55 || ln.theta > Math.PI - 0.55);
  const pickOuter = (cands: { ln: Line; pos: number }[], side: "min" | "max", lo: number, hi: number) => {
    const inBand = cands.filter((c) => c.pos >= lo && c.pos <= hi);
    if (!inBand.length) return null;
    const bestVotes = Math.max(...inBand.map((c) => c.ln.votes));
    const strong = inBand.filter((c) => c.ln.votes >= bestVotes * 0.45);
    strong.sort((a, b) => side === "min" ? a.pos - b.pos : b.pos - a.pos);
    return strong[0]?.ln ?? null;
  };
  const top = pickOuter(horiz.map((ln) => ({ ln, pos: yAt(ln, w / 2) ?? 1e9 })), "min", h * 0.01, h * 0.42);
  const bottom = pickOuter(horiz.map((ln) => ({ ln, pos: yAt(ln, w / 2) ?? -1 })), "max", h * 0.58, h * 0.99);
  const left = pickOuter(vert.map((ln) => ({ ln, pos: xAt(ln, h / 2) ?? 1e9 })), "min", w * 0.01, w * 0.42);
  const right = pickOuter(vert.map((ln) => ({ ln, pos: xAt(ln, h / 2) ?? -1 })), "max", w * 0.58, w * 0.99);
  if (!top || !bottom || !left || !right) return frame;
  const cross = (a: Line, b: Line): Pt | null => {
    const c1 = Math.cos(a.theta);
    const s1 = Math.sin(a.theta);
    const c2 = Math.cos(b.theta);
    const s2 = Math.sin(b.theta);
    const det = c1 * s2 - s1 * c2;
    if (Math.abs(det) < 1e-4) return null;
    return { x: (a.rho * s2 - b.rho * s1) / det, y: (c1 * b.rho - c2 * a.rho) / det };
  };
  const tl = cross(top, left);
  const tr = cross(top, right);
  const br = cross(bottom, right);
  const bl = cross(bottom, left);
  if (!tl || !tr || !br || !bl) return frame;
  const quad: Quad = [tl, tr, br, bl];
  const area = Math.abs(
    quad.reduce((s, p, i) => {
      const q = quad[(i + 1) % 4]!;
      return s + p.x * q.y - q.x * p.y;
    }, 0) / 2,
  );
  const inside = quad.every((p) => p.x > -w * 0.08 && p.y > -h * 0.08 && p.x < w * 1.08 && p.y < h * 1.08);
  if (!inside || area < w * h * 0.45) return frame;
  const sx = src.width / w;
  const sy = src.height / h;
  return quad.map((p) => ({ x: clamp(p.x * sx, 0, src.width - 1), y: clamp(p.y * sy, 0, src.height - 1) })) as Quad;
}

function sizeFor(corners: Quad, maxSide: number, aspect?: number): { w: number; h: number } {
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(dist(corners[0], corners[1]), dist(corners[3], corners[2]));
  let h = Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2]));
  if (aspect && aspect > 0.2 && aspect < 5) {
    h = Math.max(h, 1);
    w = h * aspect;
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(2, Math.round(w * scale)), h: Math.max(2, Math.round(h * scale)) };
}

/** Stretch contrast but keep the pen colours (blue ink, red X). */
export function enhance(src: Raster): Raster {
  const data = new Uint8ClampedArray(src.data);
  for (let ch = 0; ch < 3; ch++) {
    const hist = new Uint32Array(256);
    for (let i = ch; i < data.length; i += 4) hist[data[i]!]!++;
    const total = src.width * src.height;
    const loTarget = total * 0.015;
    const hiTarget = total * 0.985;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= loTarget) { lo = v; break; }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= hiTarget) { hi = v; break; }
    }
    if (hi - lo < 20) continue;
    const scale = 255 / (hi - lo);
    for (let i = ch; i < data.length; i += 4) data[i] = clamp(Math.round((data[i]! - lo) * scale), 0, 255);
  }
  return { width: src.width, height: src.height, data };
}

export function prepareScan(src: Raster, corners: Quad, targetAspect?: number): Raster {
  const size = sizeFor(corners, 1600, targetAspect);
  return enhance(warp(src, corners, size.w, size.h));
}

function inkThreshold(src: Raster): number {
  const hist = new Uint32Array(256);
  const n = src.width * src.height;
  for (let i = 0; i < src.data.length; i += 4) hist[Math.round(lumAt(src.data, i))]!++;
  const target = n * 0.16;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= target) return clamp(v, 60, 165);
  }
  return 120;
}

interface Comp { minX: number; minY: number; maxX: number; maxY: number; area: number }

function components(mask: Uint8Array, w: number, h: number, minArea: number): Comp[] {
  const seen = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  const out: Comp[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y * w + x;
      if (!mask[s] || seen[s]) continue;
      let qt = 0;
      let qh = 0;
      qx[qt] = x;
      qy[qt] = y;
      qt++;
      seen[s] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      while (qh < qt) {
        const cx = qx[qh]!;
        const cy = qy[qh]!;
        qh++;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neigh = [1, 0, -1, 0, 0, 1, 0, -1];
        for (let k = 0; k < 8; k += 2) {
          const nx = cx + neigh[k]!;
          const ny = cy + neigh[k + 1]!;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!mask[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx[qt] = nx;
          qy[qt] = ny;
          qt++;
        }
      }
      if (area >= minArea) out.push({ minX, minY, maxX, maxY, area });
    }
  }
  return out;
}

export function maskBoxes(mask: Uint8Array, w: number, h: number, minArea: number): { x: number; y: number; w: number; h: number }[] {
  return components(mask, w, h, minArea).map((c) => ({
    x: c.minX / w,
    y: c.minY / h,
    w: Math.max(1, c.maxX - c.minX) / w,
    h: Math.max(1, c.maxY - c.minY) / h,
  }));
}

function xScore(mask: Uint8Array, w: number, c: Comp): number {
  const bw = c.maxX - c.minX + 1;
  const bh = c.maxY - c.minY + 1;
  const dens = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let y = c.minY; y <= c.maxY; y++) {
    for (let x = c.minX; x <= c.maxX; x++) {
      const gx = Math.min(2, Math.floor(((x - c.minX) / bw) * 3));
      const gy = Math.min(2, Math.floor(((y - c.minY) / bh) * 3));
      const k = gy * 3 + gx;
      cnt[k] = (cnt[k] ?? 0) + 1;
      if (mask[y * w + x]) dens[k] = (dens[k] ?? 0) + 1;
    }
  }
  const d = dens.map((v, i) => (cnt[i] ? v / cnt[i]! : 0));
  const corner = ((d[0] ?? 0) + (d[2] ?? 0) + (d[6] ?? 0) + (d[8] ?? 0)) / 4;
  const edge = ((d[1] ?? 0) + (d[3] ?? 0) + (d[5] ?? 0) + (d[7] ?? 0)) / 4;
  const center = d[4] ?? 0;
  let d1 = 0;
  let d2 = 0;
  const steps = Math.max(bw, bh);
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const x1 = Math.round(c.minX + t * (bw - 1));
    const y1 = Math.round(c.minY + t * (bh - 1));
    const x2 = Math.round(c.minX + (1 - t) * (bw - 1));
    const y2 = y1;
    if (near(mask, w, c, x1, y1)) d1++;
    if (near(mask, w, c, x2, y2)) d2++;
  }
  const diag = Math.min(d1, d2) / steps;
  return diag * 0.75 + Math.max(0, center - edge) * 0.35 + Math.max(0, corner - edge) * 0.45;
}

function near(mask: Uint8Array, w: number, c: Comp, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < c.minX || yy < c.minY || xx > c.maxX || yy > c.maxY) continue;
      if (mask[yy * w + xx]) return true;
    }
  }
  return false;
}

interface Seg { x: number; y: number; len: number }

function signatureLines(dark: Uint8Array, w: number, h: number): DetectedField[] {
  const minLen = Math.floor(w * 0.08);
  const maxLen = Math.floor(w * 0.36);
  const raw: Seg[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!dark[y * w + x]) { x++; continue; }
      let x2 = x;
      while (x2 < w && dark[y * w + x2]) x2++;
      const len = x2 - x;
      if (len >= minLen && len <= maxLen) {
        let thick = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          let hit = 0;
          const samples = 8;
          for (let k = 0; k < samples; k++) {
            const xx = Math.min(w - 1, x + Math.floor((len * k) / samples));
            if (dark[yy * w + xx]) hit++;
          }
          if (hit >= samples * 0.6) thick++;
        }
        if (thick <= 4) raw.push({ x, y, len });
      }
      x = x2;
    }
  }
  const used = new Set<number>();
  const merged: Seg[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (used.has(i)) continue;
    const s = { ...raw[i]! };
    used.add(i);
    for (let j = i + 1; j < raw.length; j++) {
      if (used.has(j)) continue;
      const o = raw[j]!;
      if (o.y - s.y > 3) break;
      if (Math.abs(o.x - s.x) > 12 || Math.abs(o.len - s.len) > 18) continue;
      used.add(j);
      s.y = Math.max(s.y, o.y);
    }
    merged.push(s);
  }
  const overlapX = (a: Seg, b: Seg) => {
    const ax2 = a.x + a.len;
    const bx2 = b.x + b.len;
    const inter = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
    return inter / Math.min(a.len, b.len);
  };
  const singles = merged.filter((s) => !merged.some((o) => o !== s && Math.abs(o.y - s.y) > 6 && Math.abs(o.y - s.y) < h * 0.07 && overlapX(s, o) > 0.65));
  const bottom = singles.filter((s) => s.y > h * 0.8 && s.x > w * 0.02);
  if (bottom.length < 3) return [];
  bottom.sort((a, b) => a.y - b.y || a.x - b.x);
  const clusters: Seg[][] = [];
  for (const s of bottom) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(last[0]!.y - s.y) > h * 0.02) clusters.push([s]);
    else last.push(s);
  }
  const row = clusters.sort((a, b) => b.length - a.length)[0];
  if (!row || row.length < 3) return [];
  row.sort((a, b) => a.x - b.x);
  const s = row[0]!;
  const fh = 0.05;
  const fy = clamp(s.y / h - fh, 0, 0.97);
  return [{
    kind: "signature",
    x: s.x / w,
    y: fy,
    w: s.len / w,
    h: fh,
    label: "חתימה",
    score: 0.62,
  }];
}

function snapToCell(dark: Uint8Array, w: number, h: number, c: Comp): { x: number; y: number; w: number; h: number } | null {
  const cx = (c.minX + c.maxX) / 2;
  const cy = (c.minY + c.maxY) / 2;
  const colScore = (x: number) => {
    if (x < 2 || x >= w - 2) return 0;
    let n = 0;
    for (let y = 0; y < h; y += 2) if (dark[y * w + x] || dark[y * w + x - 1] || dark[y * w + x + 1]) n++;
    return n / (h / 2);
  };
  const rowScore = (y: number) => {
    if (y < 2 || y >= h - 2) return 0;
    let n = 0;
    for (let x = 0; x < w; x += 2) if (dark[y * w + x]) n++;
    return n / (w / 2);
  };
  let left = 0;
  for (let x = Math.floor(cx) - 2; x > w * 0.01; x--) if (colScore(x) > 0.25) { left = x; break; }
  let right = w - 1;
  for (let x = Math.floor(cx) + 2; x < w * 0.99; x++) if (colScore(x) > 0.25) { right = x; break; }
  let top = 0;
  for (let y = Math.floor(cy) - 2; y > 0; y--) if (rowScore(y) > 0.35) { top = y; break; }
  let bot = h - 1;
  for (let y = Math.floor(cy) + 2; y < h; y++) if (rowScore(y) > 0.35) { bot = y; break; }
  const cw = right - left;
  const ch = bot - top;
  if (cw < w * 0.04 || cw > w * 0.22 || ch < h * 0.015 || ch > h * 0.09) return null;
  const padX = cw * 0.08;
  const padY = ch * 0.12;
  return { x: (left + padX) / w, y: (top + padY) / h, w: (cw - padX * 2) / w, h: (ch - padY * 2) / h };
}

function linePositions(rule: Uint8Array, w: number, h: number, axis: "x" | "y"): number[] {
  const n = axis === "x" ? w : h;
  const scores = new Float64Array(n);
  if (axis === "x") {
    for (let x = 0; x < w; x++) {
      let hits = 0;
      for (let y = 0; y < h; y++) if (rule[y * w + x]) hits++;
      scores[x] = hits / h;
    }
  } else {
    for (let y = 0; y < h; y++) {
      let hits = 0;
      for (let x = 0; x < w; x++) if (rule[y * w + x]) hits++;
      scores[y] = hits / w;
    }
  }
  const minGap = Math.floor((axis === "x" ? w : h) * 0.012);
  const peaks: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    const value = scores[i] ?? 0;
    if (value < 0.12 || value < (scores[i - 1] ?? 0) || value < (scores[i + 1] ?? 0)) continue;
    const prev = peaks[peaks.length - 1];
    if (prev !== undefined && i - prev < minGap) {
      if (value > (scores[prev] ?? 0)) peaks[peaks.length - 1] = i;
    } else peaks.push(i);
  }
  return peaks;
}

/** The narrow table column that holds a stack of X marks, one field per row. */
function columnSignatures(dark: Uint8Array, vRule: Uint8Array, hRule: Uint8Array, w: number, h: number): DetectedField[] {
  const xs = linePositions(vRule, w, h, "x");
  const ys = linePositions(hRule, w, h, "y");
  if (xs.length < 2 || ys.length < 4) return [];
  let best: { x0: number; x1: number; rows: { y0: number; y1: number }[] } | null = null;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const cw = x1 - x0;
    if (cw < w * 0.035 || cw > w * 0.18) continue;
    const rows: { y0: number; y1: number }[] = [];
    for (let r = 0; r < ys.length - 1; r++) {
      const y0 = ys[r]!;
      const y1 = ys[r + 1]!;
      const ch = y1 - y0;
      if (ch < h * 0.012 || ch > h * 0.18) continue;
      const padX = Math.max(2, Math.floor(cw * 0.12));
      const padY = Math.max(2, Math.floor(ch * 0.16));
      let minX = x1, maxX = x0, minY = y1, maxY = y0, area = 0;
      for (let y = y0 + padY; y < y1 - padY; y += 1) {
        for (let x = x0 + padX; x < x1 - padX; x += 1) {
          if (!dark[y * w + x]) continue;
          area++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const innerW = x1 - x0 - padX * 2;
      const innerH = y1 - y0 - padY * 2;
      if (innerW < 4 || innerH < 4 || area < 12) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const fill = area / (innerW * innerH);
      if (bw > innerW * 0.96) continue;
      if (fill < 0.03 || fill > 0.75) continue;
      if (bw / Math.max(1, bh) > 3.4) continue;
      rows.push({ y0, y1 });
    }
    const width = best ? best.x1 - best.x0 : 0;
    if (!best || rows.length > best.rows.length || (rows.length === best.rows.length && cw > width)) best = { x0, x1, rows };
  }
  if (!best || best.rows.length < 4) return [];
  return best.rows.map((row) => {
    const cx = (best.x0 + best.x1) / 2;
    const cy = (row.y0 + row.y1) / 2;
    const fw = Math.max(best.x1 - best.x0, w * 0.11);
    const fh = Math.max(row.y1 - row.y0, h * 0.04);
    return {
      kind: "signature" as const,
      x: clamp(cx - fw / 2, 0, w - fw) / w,
      y: clamp(cy - fh / 2, 0, h - fh) / h,
      w: fw / w,
      h: fh / h,
      label: "חתימה",
      score: 0.9,
    };
  });
}

export function detectFields(src: Raster): DetectedField[] {
  const view = src.width > 900 ? resize(src, 900) : src;
  const w = view.width;
  const h = view.height;
  const threshold = inkThreshold(view);
  const dark = new Uint8Array(w * h);
  const pink = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < dark.length; p++, i += 4) {
    const r = view.data[i]!;
    const g = view.data[i + 1]!;
    const b = view.data[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < threshold) dark[p] = 1;
    if (r > 150 && r > g + 25 && r > b + 18 && g > 90) pink[p] = 1;
  }
  const hRule = new Uint8Array(w * h);
  const vRule = new Uint8Array(w * h);
  const hMin = Math.floor(w * 0.1);
  const vMin = Math.floor(h * 0.08);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!dark[y * w + x]) { x++; continue; }
      let x2 = x;
      while (x2 < w && dark[y * w + x2]) x2++;
      if (x2 - x >= hMin) for (let k = x; k < x2; k++) hRule[y * w + k] = 1;
      x = x2;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!dark[y * w + x]) { y++; continue; }
      let y2 = y;
      while (y2 < h && dark[y2 * w + x]) y2++;
      if (y2 - y >= vMin) for (let k = y; k < y2; k++) vRule[k * w + x] = 1;
      y = y2;
    }
  }
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ruled = false;
      for (let dy = -1; dy <= 1 && !ruled; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (hRule[yy * w + xx] || vRule[yy * w + xx]) ruled = true;
        }
      }
      if (dark[y * w + x] && !ruled) ink[y * w + x] = 1;
    }
  }
  const minSide = Math.min(w, h);
  const xs: { c: Comp; score: number }[] = [];
  for (const c of components(ink, w, h, 25)) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (bw < minSide * 0.018 || bh < minSide * 0.018) continue;
    if (bw > w * 0.16 || bh > h * 0.07) continue;
    const aspect = bw / bh;
    if (aspect < 0.45 || aspect > 2.1) continue;
    const fill = c.area / (bw * bh);
    if (fill < 0.08 || fill > 0.62) continue;
    let score = xScore(ink, w, c);
    let pinks = 0;
    const boxA = bw * bh;
    for (let y = c.minY; y <= c.maxY; y += 2) {
      for (let x = c.minX; x <= c.maxX; x += 2) if (pink[y * w + x]) pinks++;
    }
    if (pinks / (boxA / 4) > 0.15) score += 0.12;
    if (score >= 0.42) xs.push({ c, score });
  }
  xs.sort((a, b) => a.c.minX - b.c.minX);
  const clusters: { c: Comp; score: number }[][] = [];
  for (const item of xs) {
    const cx = (item.c.minX + item.c.maxX) / 2;
    let placed = false;
    for (const group of clusters) {
      if (group.some((g) => Math.abs((g.c.minX + g.c.maxX) / 2 - cx) < w * 0.04)) {
        group.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }
  const column = clusters.filter((g) => g.length >= 3).sort((a, b) => b.length - a.length)[0] ?? null;
  const fields: DetectedField[] = columnSignatures(dark, vRule, hRule, w, h);
  const pushX = (item: { c: Comp; score: number }, trustCell: boolean) => {
    const cell = trustCell ? snapToCell(dark, w, h, item.c) : null;
    if (cell) {
      fields.push({ kind: "signature", ...cell, label: "חתימה", score: item.score });
      return;
    }
    const bw = (item.c.maxX - item.c.minX) / w;
    const bh = (item.c.maxY - item.c.minY) / h;
    const fw = clamp(Math.max(bw * 2.4, 0.12), 0.1, 0.28);
    const fh = clamp(Math.max(bh * 1.8, 0.035), 0.03, 0.07);
    const cx = (item.c.minX + item.c.maxX) / 2 / w;
    const cy = (item.c.minY + item.c.maxY) / 2 / h;
    fields.push({
      kind: "signature",
      x: clamp(cx - fw / 2, 0, 1 - fw),
      y: clamp(cy - fh / 2, 0, 1 - fh),
      w: fw,
      h: fh,
      label: "חתימה",
      score: item.score,
    });
  };
  if (fields.length < 4) {
    if (column) for (const item of column) pushX(item, true);
    else for (const item of xs.filter((i) => i.score >= 0.72).slice(0, 6)) pushX(item, true);
  }
  for (const line of signatureLines(dark, w, h)) {
    if (fields.some((f) => overlap(f, line) > 0.35)) continue;
    fields.push(line);
  }
  const kept: DetectedField[] = [];
  const sorted = fields.sort((a, b) => b.score - a.score);
  for (const f of sorted) {
    if (kept.some((k) => overlap(k, f) > 0.45)) continue;
    kept.push(clampField(f));
  }
  kept.sort((a, b) => a.y - b.y || b.x - a.x);
  return kept.slice(0, 24);
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const minA = Math.min(a.w * a.h, b.w * b.h);
  return minA > 0 ? inter / minA : 0;
}

function clampField(f: DetectedField): DetectedField {
  const w = clamp(f.w, 0.04, 0.5);
  const h = clamp(f.h, 0.02, 0.12);
  return { ...f, w, h, x: clamp(f.x, 0, 1 - w), y: clamp(f.y, 0, 1 - h) };
}

function profile(src: Raster, axis: "row" | "col", w: number, h: number): Float64Array {
  const bins = new Float64Array(axis === "row" ? h : w);
  const threshold = inkThreshold(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / w) * src.width));
      const sy = Math.min(src.height - 1, Math.floor((y / h) * src.height));
      const i = (sy * src.width + sx) * 4;
      if (lumAt(src.data, i) < threshold) bins[axis === "row" ? y : x]!++;
    }
  }
  const deriv = new Float64Array(bins.length);
  for (let i = 1; i < bins.length; i++) deriv[i] = Math.abs(bins[i]! - bins[i - 1]!);
  return deriv;
}

function scoreAt(a: Float64Array, b: Float64Array, shift: number): number {
  let score = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const j = i + shift;
    if (j < 0 || j >= b.length) continue;
    score += a[i]! * b[j]!;
    n++;
  }
  return n ? score / n : 0;
}

/** Small shift that lines the new scan up with the template. Fractions of width and height. */
export function profileShift(template: Raster, next: Raster): { dx: number; dy: number } {
  const w = 160;
  const h = 220;
  const rowsT = profile(template, "row", w, h);
  const rowsN = profile(next, "row", w, h);
  const colsT = profile(template, "col", w, h);
  const colsN = profile(next, "col", w, h);
  const maxY = Math.round(h * 0.07);
  const maxX = Math.round(w * 0.07);
  let sy = 0;
  let bestY = scoreAt(rowsT, rowsN, 0);
  const baseY = bestY;
  for (let s = -maxY; s <= maxY; s++) {
    const sc = scoreAt(rowsT, rowsN, s);
    if (sc > bestY) { bestY = sc; sy = s; }
  }
  let sx = 0;
  let bestX = scoreAt(colsT, colsN, 0);
  const baseX = bestX;
  for (let s = -maxX; s <= maxX; s++) {
    const sc = scoreAt(colsT, colsN, s);
    if (sc > bestX) { bestX = sc; sx = s; }
  }
  return {
    dx: bestX > baseX * 1.04 ? sx / w : 0,
    dy: bestY > baseY * 1.04 ? sy / h : 0,
  };
}

export function shiftFields<T extends { x: number; y: number; w: number; h: number }>(fields: T[], dx: number, dy: number): T[] {
  return fields.map((f) => ({
    ...f,
    x: clamp(f.x + dx, 0, 1 - f.w),
    y: clamp(f.y + dy, 0, 1 - f.h),
  }));
}
