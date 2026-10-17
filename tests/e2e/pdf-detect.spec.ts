import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { drawHebrew } from "../../src/lib/pdf/hebrew";
import { login, newFormFromPdf } from "./helpers";

// builder-plan.md part 5 (5.4): a new form starts from a PDF and the fields are proposed from the document.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

async function formPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(path.join(process.cwd(), "assets/fonts/Heebo-Regular.ttf")), { subset: true });
  const page = doc.addPage([595.28, 841.89]);
  ["שם מלא", "מספר זהות", "תאריך לידה"].forEach((label, i) => {
    const y = 760 - i * 40;
    drawHebrew(page, label, { x: 400, y, width: 120, size: 12, font });
    page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 390, y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
  });
  // A choice: the question, then a square and a word for each option (right to left).
  const y = 600;
  drawHebrew(page, "מין", { x: 470, y, width: 50, size: 12, font });
  page.drawRectangle({ x: 440, y: y - 1, width: 10, height: 10, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
  drawHebrew(page, "זכר", { x: 400, y, width: 36, size: 12, font });
  page.drawRectangle({ x: 360, y: y - 1, width: 10, height: 10, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
  drawHebrew(page, "נקבה", { x: 315, y, width: 41, size: 12, font });
  return Buffer.from(await doc.save());
}

test("a new form from a PDF proposes its fields, and adding them puts them in the form and on the document", async ({ page }) => {
  await login(page, "/admin/forms");
  await newFormFromPdf(page, `Detect e2e ${Date.now()}`, await formPdf());

  const dialog = page.getByRole("dialog", { name: "שדות שזוהו ב-PDF" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  const rows = dialog.getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(dialog.getByLabel("שם השדה מין")).toHaveValue("מין");
  await expect(dialog.getByText("אפשרויות: זכר · נקבה")).toBeVisible();

  // Fix one name, then add everything.
  await dialog.getByLabel("שם השדה שם מלא").fill("שם העובד");
  await dialog.getByRole("button", { name: /^הוספת 4 שדות לטופס$/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.locator("[data-stamp]").count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  await expect(page.getByText(/שיבוצים הוצעו אוטומטית/)).toBeVisible();

  // The same fields are the responsive form, in the order of the document.
  await page.getByRole("tab", { name: "עריכה" }).click();
  for (const label of ["שם העובד", "מספר זהות", "תאריך לידה", "מין"]) await expect(page.getByText(label).first()).toBeVisible();
});
