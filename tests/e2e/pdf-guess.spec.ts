import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { drawHebrew } from "../../src/lib/pdf/hebrew";
import { login } from "./helpers";

// builder-plan.md part 4 (4.5): uploading a PDF to a form that already has fields proposes positions from the PDF's own text.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

async function labelledPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(path.join(process.cwd(), "assets/fonts/Heebo-Regular.ttf")), { subset: true });
  const page = doc.addPage([595.28, 841.89]);
  // Right-to-left rows: the label on the right, a line to its left to write on.
  const rows = ["שם מלא", "מספר זהות", "תאריך לידה", "טלפון נייד"];
  rows.forEach((label, i) => {
    const y = 760 - i * 40;
    drawHebrew(page, label, { x: 400, y, width: 120, size: 12, font });
    page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 390, y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
  });
  return Buffer.from(await doc.save());
}

test("PDF upload to an existing form offers automatic placement", async ({ page }) => {
  await login(page, "/admin/forms");
  const title = `Guess e2e ${Date.now()}`;
  await page.getByLabel("שם הטופס מתבנית קליטת עובד").fill(title);
  await page.locator("form").filter({ hasText: "קליטת עובד" }).getByRole("button", { name: "יצירה מתבנית" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]+\?tab=pdf/);
  await page.getByRole("tab", { name: "PDF" }).click();

  await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({ name: "labelled.pdf", mimeType: "application/pdf", buffer: await labelledPdf() });
  const dialog = page.getByRole("dialog", { name: "שיבוץ אוטומטי של השדות" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: "לשבץ אוטומטית" }).click();

  // The suggestions are marked (dashed) until the admin confirms or touches them.
  const stamps = page.locator("[data-stamp]");
  await expect.poll(() => stamps.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("status").filter({ hasText: "הוצעו אוטומטית" })).toBeVisible();
  await page.getByRole("button", { name: "אישור כל ההצעות" }).click();
  await expect(page.getByRole("status").filter({ hasText: "הוצעו אוטומטית" })).toHaveCount(0);
});

test("placing a waiting field by hand starts from the PDF's own label", async ({ page }) => {
  await login(page, "/admin/forms");
  await page.getByLabel("שם הטופס מתבנית קליטת עובד").fill(`Guess one e2e ${Date.now()}`);
  await page.locator("form").filter({ hasText: "קליטת עובד" }).getByRole("button", { name: "יצירה מתבנית" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]+\?tab=pdf/);
  await page.getByRole("tab", { name: "PDF" }).click();
  await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({ name: "labelled.pdf", mimeType: "application/pdf", buffer: await labelledPdf() });
  const dialog = page.getByRole("dialog", { name: "שיבוץ אוטומטי של השדות" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: "אשבץ ידנית" }).click();
  await expect(page.locator("[data-stamp]")).toHaveCount(0);

  await page.getByRole("button", { name: /^מיקום טלפון נייד/ }).first().click();
  await expect(page.locator("[data-stamp]")).toHaveCount(1, { timeout: 15_000 });
  // The box sits left of the printed label (label x 400..520, rule from 180): in the left half of the page.
  const box = await page.locator("[data-stamp]").first().boundingBox();
  const canvas = await page.getByTestId("pdf-page-0").boundingBox();
  expect(box!.x + box!.width / 2).toBeLessThan(canvas!.x + canvas!.width * 0.6);
});
