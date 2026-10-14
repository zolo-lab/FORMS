import { expect, test } from "@playwright/test";
import { login, openPalette } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("edit a field inline, style it, and see it in the form preview", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "/admin/forms");
  await page.getByPlaceholder("שם הטופס החדש").fill(`טופס e2e ${Date.now()}`);
  await page.getByRole("button", { name: "טופס חדש" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;

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
    await page.goto(`/preview/form/${id}`);
    const label = page.locator("label", { hasText: "שם מלא" });
    await expect(label).toBeVisible({ timeout: 2000 });
    await expect(label).toHaveClass(/text-2xl/);
    await expect(page.getByText("כפי שמופיע בתעודת הזהות")).toBeVisible();
  }).toPass({ timeout: 60_000 });
});

test("form settings: layout, description and thank-you message", async ({ page }) => {
  await login(page, "/admin/forms");
  await page.getByPlaceholder("שם הטופס החדש").fill(`הגדרות ${Date.now()}`);
  await page.getByRole("button", { name: "טופס חדש" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]{36}/);
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
