import { formatDay, type Field } from "./types";
import { loadImage } from "./browser-image";

/** Draws names, ID numbers, dates and signatures onto the page. The image is what gets stored. */
export async function burnPage(url: string, fields: Field[], values: Record<string, string>, signatures: Record<string, string>): Promise<Blob> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0);
  const signatureImages = new Map<string, HTMLImageElement>();
  for (const field of fields) {
    if (field.kind !== "signature") continue;
    const data = signatures[field.id];
    if (!data || signatureImages.has(data)) continue;
    signatureImages.set(data, await loadImage(data));
  }
  for (const field of fields) {
    const x = field.x * canvas.width;
    const y = field.y * canvas.height;
    const w = field.w * canvas.width;
    const h = field.h * canvas.height;
    if (field.kind === "signature") {
      const data = signatures[field.id];
      const drawn = data ? signatureImages.get(data) : undefined;
      if (!drawn) continue;
      const pad = Math.min(w, h) * 0.08;
      const scale = Math.min((w - pad * 2) / drawn.naturalWidth, (h - pad * 2) / drawn.naturalHeight);
      const dw = drawn.naturalWidth * scale;
      const dh = drawn.naturalHeight * scale;
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
    const font = () => `600 ${size}px Heebo, sans-serif`;
    ctx.font = font();
    const maxW = w * 0.9;
    while (size > 10 && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = font();
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
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/jpeg", 0.86);
  });
}
