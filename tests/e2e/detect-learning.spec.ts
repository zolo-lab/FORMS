import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { drawHebrew } from "../../src/lib/pdf/hebrew";
import { login, newFormFromPdf } from "./helpers";

// builder-plan.md 5.12: corrections made in the dialog are remembered for the next PDF with the same labels.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

async function pdfWith(labels: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(path.join(process.cwd(), "assets/fonts/Heebo-Regular.ttf")), { subset: true });
  const page = doc.addPage([595.28, 841.89]);
  labels.forEach((label, i) => {
    const y = 760 - i * 40;
    drawHebrew(page, label, { x: 380, y, width: 140, size: 12, font });
    page.drawLine({ start: { x: 160, y: y - 2 }, end: { x: 370, y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
  });
  return Buffer.from(await doc.save());
}

test("a dropped proposal comes back unticked and a renamed one with its new name", async ({ page }) => {
  await login(page, "/admin/forms");
  const n = String(Date.now() % 1_000_000);
  const keep = `מספר עובד ${n}`;
  const drop = `הערה פנימית ${n}`;
  const pdf = await pdfWith([keep, drop]);

  await newFormFromPdf(page, `Learn A ${n}`, pdf);
  let dialog = page.getByRole("dialog", { name: "שדות שזוהו ב-PDF" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await dialog.getByLabel(`שם השדה ${keep}`).fill("מספר העובד במערכת");
  await dialog.getByLabel(`מזהה השדה ${keep}`).fill("employeeNumber");
  await dialog.getByLabel(`לכלול את ${drop}`).uncheck();
  const saved = page.waitForResponse((r) => r.url().includes("/api/admin/pdf-detect/feedback"));
  await dialog.getByRole("button", { name: /^הוספת 1 שדות לטופס$/ }).click();
  expect(((await (await saved).json()) as { saved: number }).saved).toBe(2);

  await newFormFromPdf(page, `Learn B ${n}`, pdf);
  dialog = page.getByRole("dialog", { name: "שדות שזוהו ב-PDF" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByLabel("שם השדה מספר העובד במערכת")).toHaveValue("מספר העובד במערכת");
  await expect(dialog.getByLabel("מזהה השדה מספר העובד במערכת")).toHaveValue("employeeNumber");
  await expect(dialog.getByLabel(`לכלול את ${drop}`)).not.toBeChecked();
  await expect(dialog.getByText("לפי תיקון קודם")).toBeVisible();
  await expect(dialog.getByText("בוטל בעבר")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^הוספת 1 שדות לטופס$/ })).toBeVisible();
});
