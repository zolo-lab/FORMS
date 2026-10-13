/**
 * Screen ↔ PDF coordinate conversion for the placement UI.
 * PDF: points, origin bottom-left, y grows up. Screen: CSS px, origin top-left, y grows down.
 * `scale` = CSS px per PDF point of the rendered page.
 */
export interface Box { x: number; y: number; width: number; height: number }

export function pdfBoxToScreen(box: Box, pageHeightPt: number, scale: number): Box {
  return {
    x: box.x * scale,
    y: (pageHeightPt - box.y - box.height) * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

export function screenBoxToPdf(box: Box, pageHeightPt: number, scale: number): Box {
  const height = box.height / scale;
  return {
    x: box.x / scale,
    y: pageHeightPt - box.y / scale - height,
    width: box.width / scale,
    height,
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Keep a PDF-space box inside the page and above a minimum size. */
export function clampBox(box: Box, pageWidthPt: number, pageHeightPt: number, min = 6): Box {
  const width = Math.min(Math.max(box.width, min), pageWidthPt);
  const height = Math.min(Math.max(box.height, min), pageHeightPt);
  return {
    width,
    height,
    x: Math.min(Math.max(box.x, 0), pageWidthPt - width),
    y: Math.min(Math.max(box.y, 0), pageHeightPt - height),
  };
}
