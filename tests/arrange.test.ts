import { describe, expect, it } from "vitest";
import { alignBoxes, distributeBoxes, nextFreePosition, snapPosition, snapToText } from "@/lib/pdf/arrange";

const b = (x: number, y: number, width = 20, height = 10) => ({ x, y, width, height });

describe("arrange", () => {
  it("aligns 5 boxes to the right edge", () => {
    const boxes = [b(10, 0, 20), b(50, 20, 30), b(5, 40, 10), b(70, 60, 25), b(33, 80, 12)];
    const out = alignBoxes(boxes, "right");
    // right edge of the group = 95 (70 + 25)
    expect(out.map((p, i) => p.x + boxes[i]!.width)).toEqual([95, 95, 95, 95, 95]);
    expect(out.map((p) => p.y)).toEqual([0, 20, 40, 60, 80]);
  });

  it("aligns left, top, bottom and centres", () => {
    const boxes = [b(10, 0), b(50, 20, 40, 30)];
    expect(alignBoxes(boxes, "left").map((p) => p.x)).toEqual([10, 10]);
    expect(alignBoxes(boxes, "bottom").map((p) => p.y)).toEqual([0, 0]);
    expect(alignBoxes(boxes, "top").map((p) => p.y + 0)).toEqual([40, 20]);
    expect(alignBoxes(boxes, "center-x").map((p, i) => p.x + boxes[i]!.width / 2)).toEqual([50, 50]);
    expect(alignBoxes(boxes, "center-y").map((p, i) => p.y + boxes[i]!.height / 2)).toEqual([25, 25]);
  });

  it("distributes evenly, keeping outer boxes", () => {
    const boxes = [b(0, 0, 10), b(15, 0, 10), b(90, 0, 10)];
    const out = distributeBoxes(boxes, "x");
    expect(out.map((p) => p.x)).toEqual([0, 45, 90]);
    expect(distributeBoxes([b(0, 0), b(5, 0)], "x").map((p) => p.x)).toEqual([0, 5]);
  });

  it("snaps to other boxes within tolerance, else to the grid", () => {
    const others = [b(100, 200, 40, 20)];
    const near = snapPosition(b(102, 301), others);
    expect(near.x).toBe(100);
    expect(near.guides).toContainEqual({ axis: "x", at: 100 });
    expect(near.y).toBe(302); // no vertical neighbour in range → grid
    const far = snapPosition(b(51.3, 77.9), others);
    expect(far).toMatchObject({ x: 52, y: 78, guides: [] });
  });

  it("places new elements one under the other, never stacked", () => {
    const page = { width: 595, height: 842 };
    const dims = { width: 120, height: 16 };
    const placed: ReturnType<typeof b>[] = [];
    for (let i = 0; i < 5; i++) {
      const p = nextFreePosition(dims, page, placed);
      placed.push(b(p.x, p.y, dims.width, dims.height));
    }
    const keys = new Set(placed.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(5);
    expect(placed[0]!.y).toBeGreaterThan(placed[1]!.y); // y grows upward: the second sits below the first
    expect(placed.every((p) => p.y >= 40 && p.x >= 40)).toBe(true);
  });

  it("staggers when there is no room below the last element", () => {
    const page = { width: 595, height: 842 };
    const dims = { width: 120, height: 16 };
    const last = b(40, 40, 120, 16); // already at the bottom margin
    const p = nextFreePosition(dims, page, [last]);
    expect(p).not.toEqual({ x: 40, y: 16 });
    expect(p.y).toBeGreaterThanOrEqual(40);
  });
});

describe("snap to printed text", () => {
  // "שם העובד" printed at x 370–420, baseline 760, 11pt high: visual middle at 763.85.
  const name = { x: 370, y: 760, width: 50, height: 11 };
  it("lines a field up with the name on its row and flush against its left side", () => {
    const r = snapToText({ x: 240, y: 752, width: 120, height: 16 }, [name]);
    expect(r.text).toBe(name);
    expect(r.y + 8).toBeCloseTo(763.85, 5);
    expect(r.x + 120).toBeCloseTo(366, 5);
    expect(r.guides).toEqual([{ axis: "y", at: 763.85 }, { axis: "x", at: 366 }]);
  });
  it("only the row when the box is far from the name's side", () => {
    const r = snapToText({ x: 100, y: 757, width: 120, height: 16 }, [name]);
    expect(r.x).toBe(100);
    expect(r.y + 8).toBeCloseTo(763.85, 5);
    expect(r.guides).toHaveLength(1);
  });
  it("flush to the right of a text too, and nothing when no text is on the row", () => {
    const en = { x: 50, y: 500, width: 40, height: 10 };
    const r = snapToText({ x: 100, y: 495, width: 80, height: 16 }, [en]);
    expect(r.x).toBe(94);
    expect(snapToText({ x: 100, y: 600, width: 80, height: 16 }, [en])).toEqual({ x: 100, y: 600, guides: [], text: null });
  });
  it("picks the closest text when two rows are near", () => {
    const below = { x: 370, y: 742, width: 50, height: 11 };
    expect(snapToText({ x: 240, y: 754, width: 120, height: 16 }, [below, name]).text).toBe(name);
  });
});
