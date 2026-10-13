/** Pure geometry for arranging several stamps at once (PDF space: origin bottom-left, y up). */
import type { Box } from "./coords";

export type AlignMode = "left" | "right" | "top" | "bottom" | "center-x" | "center-y";

/** Align every box to the extreme (or centre) of the group's bounding box. Returns new x/y per box, same order. */
export function alignBoxes(boxes: Box[], mode: AlignMode): { x: number; y: number }[] {
  if (boxes.length === 0) return [];
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return boxes.map((b) => {
    switch (mode) {
      case "left": return { x: minX, y: b.y };
      case "right": return { x: maxX - b.width, y: b.y };
      case "top": return { x: b.x, y: maxY - b.height };
      case "bottom": return { x: b.x, y: minY };
      case "center-x": return { x: (minX + maxX) / 2 - b.width / 2, y: b.y };
      case "center-y": return { x: b.x, y: (minY + maxY) / 2 - b.height / 2 };
    }
  });
}

/** Space the boxes evenly along an axis, keeping the two outermost boxes in place. Needs at least 3 boxes. */
export function distributeBoxes(boxes: Box[], axis: "x" | "y"): { x: number; y: number }[] {
  const out = boxes.map((b) => ({ x: b.x, y: b.y }));
  if (boxes.length < 3) return out;
  const size = axis === "x" ? "width" : "height";
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a]![axis] - boxes[b]![axis]);
  const first = boxes[order[0]!]!;
  const last = boxes[order.at(-1)!]!;
  const total = last[axis] + last[size] - first[axis];
  const used = order.reduce((sum, i) => sum + boxes[i]![size], 0);
  const gap = (total - used) / (order.length - 1);
  let cursor = first[axis];
  for (const i of order) {
    out[i]![axis] = cursor;
    cursor += boxes[i]![size] + gap;
  }
  return out;
}

/**
 * Snap a box position: edges/centres snap to other boxes within `tolerance` pt; otherwise to a `grid` pt grid (0 = no grid).
 * Returns the snapped x/y plus the guide lines that were hit (for drawing helper lines).
 */
export function snapPosition(
  box: Box,
  others: Box[],
  opts: { grid?: number; tolerance?: number } = {},
): { x: number; y: number; guides: { axis: "x" | "y"; at: number }[] } {
  const grid = opts.grid ?? 2;
  const tol = opts.tolerance ?? 4;
  const guides: { axis: "x" | "y"; at: number }[] = [];

  const snapAxis = (axis: "x" | "y"): number => {
    const size = axis === "x" ? box.width : box.height;
    const own = [box[axis], box[axis] + size / 2, box[axis] + size];
    let best: { delta: number; at: number } | null = null;
    for (const o of others) {
      const osz = axis === "x" ? o.width : o.height;
      for (const target of [o[axis], o[axis] + osz / 2, o[axis] + osz]) {
        for (const p of own) {
          const delta = target - p;
          if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target };
        }
      }
    }
    if (best) {
      guides.push({ axis, at: best.at });
      return box[axis] + best.delta;
    }
    return grid > 0 ? Math.round(box[axis] / grid) * grid : box[axis];
  };

  return { x: snapAxis("x"), y: snapAxis("y"), guides };
}
