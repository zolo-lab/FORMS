import type { DetectedField } from "./types";
import type { Raster } from "./vision";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה"));
    img.src = src;
  });
}

export async function fileToRaster(file: File, maxSide = 1800): Promise<Raster> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return drawToRaster(img, maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function urlToRaster(url: string, maxSide = 1600): Promise<Raster> {
  const img = await loadImage(url);
  return drawToRaster(img, maxSide);
}

function drawToRaster(img: HTMLImageElement, maxSide: number): Raster {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  return { width, height, data: image.data };
}

export function rasterToBlob(raster: Raster, type = "image/jpeg", quality = 0.82): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas"));
  const copy = new Uint8ClampedArray(raster.data);
  ctx.putImageData(new ImageData(copy, raster.width, raster.height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), type, quality);
  });
}

export async function pdfToPages(file: File): Promise<{ raster: Raster; fields: DetectedField[] }[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  if (doc.numPages > 6) throw new Error("אפשר עד 6 עמודים בקובץ");
  const pages: { raster: Raster; fields: DetectedField[] }[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 1500 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas");
    await page.render({ canvas, viewport }).promise;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const content = await page.getTextContent();
    const fields: DetectedField[] = [];
    for (const item of content.items) {
      if (!("str" in item) || typeof item.str !== "string") continue;
      const text = item.str.trim();
      if (text.length < 3 || text.length > 40) continue;
      if (!/חתימ|חתום|signature/i.test(text)) continue;
      const transform = item.transform;
      const x = transform[4] ?? 0;
      const y = transform[5] ?? 0;
      const width = item.width || 10;
      const height = item.height || Math.abs(transform[3] ?? 10);
      const a = viewport.convertToViewportPoint(x, y);
      const b = viewport.convertToViewportPoint(x + width, y + height);
      const left = Math.min(a[0] ?? 0, b[0] ?? 0);
      const top = Math.min(a[1] ?? 0, b[1] ?? 0);
      const boxW = viewport.width * 0.18;
      const boxH = Math.max(viewport.height * 0.04, Math.abs((b[1] ?? 0) - (a[1] ?? 0)) * 2.4);
      const bx = Math.max(0, left - boxW - 6);
      const by = Math.max(0, top - boxH * 0.55);
      fields.push({
        kind: "signature",
        x: bx / viewport.width,
        y: by / viewport.height,
        w: boxW / viewport.width,
        h: boxH / viewport.height,
        label: "חתימה",
        score: 0.8,
      });
    }
    pages.push({ raster: { width: canvas.width, height: canvas.height, data: image.data }, fields });
  }
  return pages;
}
