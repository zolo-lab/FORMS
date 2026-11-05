import { expect, test } from "@playwright/test";
import { login, newFormFromPdf, openPalette } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("edit a field inline, style it, and see it in the form preview", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "/admin/forms");
  const id = await newFormFromPdf(page, `טופס e2e ${Date.now()}`);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();

  await openPalette(page);
  await page.getByRole("button", { name: /תשובה קצרה/ }).first().click();

  // Write the label right on the field (quick edit), without opening the side panel.
  const quick = page.getByRole("group", { name: "עריכה מהירה" }).or(page.locator('[aria-label="עריכה מהירה"]'));
  await quick.getByLabel("תווית השדה").fill("שם מלא");
  await quick.getByLabel("הסבר לשדה").fill("כפי שמופיע בתעודת הזהות");

  // Style this field only.
  await page.getByLabel("גודל", { exact: true }).selectOption({ label: "גדול מאוד" });
  // The draft autosaves ~1s after the last edit; wait for that request before leaving the editor.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/admin/forms/${id}`), { timeout: 30_000 });
  await page.getByRole("switch", { name: "בולד" }).click();
  await expect(page.getByLabel("דוגמה לעיצוב")).toHaveClass(/text-2xl/);
  await expect(page.getByLabel("דוגמה לעיצוב")).toHaveClass(/font-bold/);

  await saved;

  // The full-screen preview shows the saved version.
  await expect(async () => {
    await page.goto(`/preview/form/${id}?all=1`);
    const label = page.locator("label", { hasText: "שם מלא" });
    await expect(label).toBeVisible({ timeout: 2000 });
    await expect(label).toHaveClass(/text-2xl/);
    await expect(page.getByText("כפי שמופיע בתעודת הזהות")).toBeVisible();
  }).toPass({ timeout: 60_000 });
});

test("form settings: layout, description and thank-you message", async ({ page }) => {
  await login(page, "/admin/forms");
  await newFormFromPdf(page, `הגדרות ${Date.now()}`);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();
  await page.getByText("כלים", { exact: true }).click();
  await page.getByRole("button", { name: "הגדרות הטופס" }).click();
  await page.getByLabel("הסבר בראש הטופס").fill("מלאו בבקשה את כל השדות");
  await page.getByLabel("אופן המילוי").selectOption("card");
  await page.getByLabel("הודעה אחרי השליחה").fill("תודה רבה");
  // One question: after a short-text field exists the preview shows it as a card, then the review screen.
  await openPalette(page);
  await page.getByRole("button", { name: /תשובה קצרה/ }).first().click();
  await page.getByRole("tab", { name: "תצוגה מקדימה" }).click();
  await expect(page.getByText("מלאו בבקשה את כל השדות")).toBeVisible();
  await expect(page.getByRole("button", { name: "לסיכום" })).toBeVisible();
  await page.getByRole("button", { name: "לסיכום" }).click();
  await expect(page.getByRole("heading", { name: "בדקו את התשובות" })).toBeVisible();
});

test("fields are reordered by dragging a row onto another", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "/admin/forms");
  await newFormFromPdf(page, `טופס e2e ${Date.now()}`);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();
  await openPalette(page);
  for (const label of ["ראשון", "שני", "שלישי"]) {
    await page.getByRole("button", { name: /תשובה קצרה/ }).first().click();
    await page.locator('[aria-label="עריכה מהירה"]').getByLabel("תווית השדה").fill(label);
  }
  const rows = page.locator("[draggable=true]");
  const labels = async () => (await rows.locator("span.block.truncate.text-sm").allTextContents()).map((t) => t.replace("*", "").trim());
  await expect.poll(labels).toEqual(["ראשון", "שני", "שלישי"]);
  // Drop "שלישי" on the upper half of "ראשון": it goes first.
  const first = rows.filter({ hasText: "ראשון" });
  await rows.filter({ hasText: "שלישי" }).dragTo(first, { targetPosition: { x: 40, y: 4 } });
  await expect.poll(labels).toEqual(["שלישי", "ראשון", "שני"]);
});
