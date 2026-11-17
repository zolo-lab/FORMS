import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { join } from "node:path";
import { formatDay, type Field } from "./types";

const family = "Heebo";
let fontReady = false;

function ensureFont() {
  if (fontReady) return;
  GlobalFonts.registerFromPath(join(process.cwd(), "assets/Heebo-Regular.ttf"), family);
  fontReady = true;
}

/** Burns answers onto the stored page. The client never supplies the finished image. */
export async function stampPage(original: Uint8Array, fields: Field[], values: Record<string, string>, signatures: Record<string, Uint8Array>): Promise<Uint8Array> {
  ensureFont();
  const page = await loadImage(original);
  const canvas = createCanvas(page.width, page.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(page, 0, 0);
  for (const field of fields) {
    const x = field.x * page.width;
    const y = field.y * page.height;
    const w = field.w * page.width;
    const h = field.h * page.height;
    if (field.kind === "signature") {
      const png = signatures[field.id];
      if (!png) continue;
      const drawn = await loadImage(png);
      const pad = Math.min(w, h) * 0.08;
      const scale = Math.min((w - pad * 2) / drawn.width, (h - pad * 2) / drawn.height);
      const dw = drawn.width * scale;
      const dh = drawn.height * scale;
      ctx.drawImage(drawn, x + (w - dw) / 2, y + h - dh - pad / 2, dw, dh);
      continue;
    }
    const raw = (values[field.id] ?? "").trim();
    if (!raw) continue;
    const text = field.kind === "date" ? formatDay(raw) : raw;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 1, Math.max(1, w - 4), Math.max(1, h - 2));
    ctx.clip();
    ctx.fillStyle = "#1e3a5f";
    ctx.textBaseline = "middle";
    let size = Math.floor(h * 0.62);
    const rtl = field.kind === "name";
    const maxW = w * 0.9;
    ctx.font = `600 ${size}px ${family}`;
    while (size > 10 && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = `600 ${size}px ${family}`;
    }
    if (rtl) {
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillText(text, x + w - 6, y + h / 2);
    } else {
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.fillText(text, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }
  return new Uint8Array(canvas.toBuffer("image/jpeg", 86));
}
