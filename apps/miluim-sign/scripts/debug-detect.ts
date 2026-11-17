import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { detectFields, prepareScan, suggestQuad, type Raster } from "../lib/vision";

const input = process.argv[2] ?? "/home/ubuntu/.cursor/projects/agent-repos-FORMS/uploads/miluim_form_bfee.jpg";

function paint(src: Raster, boxes: { x: number; y: number; w: number; h: number }[]): Raster {
  const data = new Uint8ClampedArray(src.data);
  const w = src.width;
  const h = src.height;
  for (const b of boxes) {
    const x0 = Math.round(b.x * w);
    const y0 = Math.round(b.y * h);
    const x1 = Math.round((b.x + b.w) * w);
    const y1 = Math.round((b.y + b.h) * h);
    for (let t = 0; t < 4; t++) {
      for (let x = x0; x <= x1; x++) {
        for (const y of [y0 + t, y1 - t]) {
          if (y < 0 || y >= h || x < 0 || x >= w) continue;
          const i = (y * w + x) * 4;
          data[i] = 220;
          data[i + 1] = 30;
          data[i + 2] = 30;
        }
      }
      for (let y = y0; y <= y1; y++) {
        for (const x of [x0 + t, x1 - t]) {
          if (y < 0 || y >= h || x < 0 || x >= w) continue;
          const i = (y * w + x) * 4;
          data[i] = 220;
          data[i + 1] = 30;
          data[i + 2] = 30;
        }
      }
    }
  }
  return { width: w, height: h, data };
}

async function main() {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const copy = new Uint8ClampedArray(data.length);
  copy.set(data);
  const src: Raster = { width: info.width, height: info.height, data: copy };
  console.log("size", src.width, src.height);
  const quad = suggestQuad(src);
  console.log("quad", quad.map((p) => [Math.round(p.x), Math.round(p.y)]));
  const quadBoxes = [
    { x: quad[0].x / src.width, y: quad[0].y / src.height, w: 0.01, h: 0.01 },
  ];
  const marked = paint(src, []);
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const steps = 400;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a.x + (b.x - a.x) * (i / steps));
      const y = Math.round(a.y + (b.y - a.y) * (i / steps));
      for (let t = -2; t <= 2; t++) {
        const xx = Math.min(src.width - 1, Math.max(0, x + t));
        const yy = Math.min(src.height - 1, Math.max(0, y));
        const pi = (yy * src.width + xx) * 4;
        marked.data[pi] = 20;
        marked.data[pi + 1] = 90;
        marked.data[pi + 2] = 220;
      }
    }
  };
  stroke(quad[0], quad[1]);
  stroke(quad[1], quad[2]);
  stroke(quad[2], quad[3]);
  stroke(quad[3], quad[0]);
  const quadJpg = await sharp(Buffer.from(marked.data), { raw: { width: marked.width, height: marked.height, channels: 4 } }).jpeg({ quality: 70 }).toBuffer();
  writeFileSync("/tmp/quad.jpg", quadJpg);
  void quadBoxes;
  const prepared = prepareScan(src, quad);
  console.log("prepared", prepared.width, prepared.height);
  const fields = detectFields(prepared);
  console.log("count", fields.length);
  for (const f of fields) console.log(f.score.toFixed(2), f.x.toFixed(3), f.y.toFixed(3), f.w.toFixed(3), f.h.toFixed(3));
  const painted = paint(prepared, fields);
  const jpg = await sharp(Buffer.from(painted.data), { raw: { width: painted.width, height: painted.height, channels: 4 } }).jpeg({ quality: 75 }).toBuffer();
  writeFileSync("/tmp/detect.jpg", jpg);
  const plain = await sharp(Buffer.from(prepared.data), { raw: { width: prepared.width, height: prepared.height, channels: 4 } }).jpeg({ quality: 70 }).toBuffer();
  writeFileSync("/tmp/prepared.jpg", plain);
  console.log("wrote /tmp/detect.jpg");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
