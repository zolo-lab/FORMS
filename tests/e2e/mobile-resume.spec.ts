import { readFileSync } from "node:fs";
import path from "node:path";
import { devices, expect, test } from "@playwright/test";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { drawHebrew } from "../../src/lib/pdf/hebrew";
import { login, newFormFromPdf } from "./helpers";

// builder-plan.md part 5 (5.6): a long form filled in parts, on a phone. Needs the dev database.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(240_000);

async function twoPagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(path.join(process.cwd(), "assets/fonts/Heebo-Regular.ttf")), { subset: true });
  const pages = [["שם מלא", "מספר זהות"], ["תאריך לידה", "טלפון נייד"]];
  for (const labels of pages) {
    const page = doc.addPage([595.28, 841.89]);
    labels.forEach((label, i) => {
      const y = 760 - i * 40;
      drawHebrew(page, label, { x: 400, y, width: 120, size: 12, font });
      page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 390, y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
    });
  }
  return Buffer.from(await doc.save());
}

test("a form with two steps: the employee fills step 1 on a phone, leaves, and comes back to step 2", async ({ page, browser, baseURL }) => {
  await login(page, "/admin/forms");
  const title = `Resume e2e ${Date.now()}`;
  await newFormFromPdf(page, title, await twoPagePdf());

  // Fields proposed from the document, one step per PDF page.
  const dialog = page.getByRole("dialog", { name: "שדות שזוהו ב-PDF" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: /^הוספת 4 שדות לטופס$/ }).click();
  await page.getByRole("tab", { name: "עריכה" }).click();
  await expect(page.getByText("עמוד 2").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("גרסה 1 פורסמה")).toBeVisible({ timeout: 20_000 });

  // The form carries its own route (requester → employee by default): open a request from it.
  await page.goto("/admin/requests/new");
  await page.getByLabel("טופס", { exact: true }).selectOption({ label: title });
  await page.getByRole("button", { name: "הבא" }).click();
  await page.getByLabel("שם העובד").fill(`עובד resume ${Date.now()}`);
  await page.getByLabel("מייל").fill("e2e-resume@example.invalid");
  await page.getByRole("button", { name: "הבא" }).click();
  const next = page.getByRole("button", { name: "הבא" });
  if (await next.isVisible()) await next.click();
  await page.getByRole("button", { name: "שליחה" }).click();
  const done = page.getByTestId("request-done");
  await expect(done.getByRole("heading", { name: "הבקשה נשלחה" })).toBeVisible({ timeout: 30_000 });
  const link = await done.getByLabel(/קישור ל/).first().inputValue();

  // The employee, on a phone.
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: baseURL!, locale: "he-IL" });
  const phone = await ctx.newPage();
  await phone.goto(new URL(link).pathname);
  await expect(phone.getByLabel("שם מלא", { exact: true })).toBeVisible({ timeout: 30_000 });
  await phone.getByLabel("שם מלא", { exact: true }).fill("דנה כהן");
  await phone.getByLabel("מספר זהות", { exact: true }).fill("000000018");
  await phone.getByRole("button", { name: "הבא" }).click();
  await expect(phone.getByLabel("תאריך לידה", { exact: true })).toBeVisible();
  await phone.getByLabel("תאריך לידה", { exact: true }).fill("1990-05-01");
  await expect(phone.getByText("נשמר אוטומטית")).toBeVisible({ timeout: 20_000 });

  // Away and back: the answers are there and the form opens on the step that is not finished.
  await phone.reload();
  await expect(phone.getByLabel("תאריך לידה", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(phone.getByLabel("תאריך לידה", { exact: true })).toHaveValue("1990-05-01");
  await phone.getByRole("button", { name: "הקודם" }).click();
  await expect(phone.getByLabel("שם מלא", { exact: true })).toHaveValue("דנה כהן");
  await ctx.close();
});
