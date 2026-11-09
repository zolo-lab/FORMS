import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("linked fields: the form against the organizations' list – missing fields added, linked, and undone", async ({ page }) => {
  await login(page);
  await newFormFromPdf(page, `מקושר e2e ${Date.now()}`);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();

  await page.locator("summary", { hasText: "כלים" }).click();
  await page.getByRole("button", { name: "שדות מקושרים" }).click();
  const dialog = page.getByRole("dialog", { name: "שדות מקושרים" });
  await expect(dialog.getByLabel("מאגר")).toHaveValue("org");

  // A new form has none of the list's fields: each is flagged, with its internal name shown beside it.
  await expect(dialog.getByText("לא נמצא בטופס").first()).toBeVisible();
  await expect(dialog.locator("code", { hasText: "__reg" })).toBeVisible();

  // Add them all: every row is now linked to a field of the form.
  await dialog.getByRole("button", { name: /^הוספת כל החסרים לטופס/ }).click();
  await expect(dialog.getByText("לא נמצא בטופס")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^ביטול הקישור של / }).first()).toBeVisible();

  // Undo one link: the field stays in the form, now found by its name and offered again.
  const before = await dialog.getByRole("button", { name: /^ביטול הקישור של / }).count();
  await dialog.getByRole("button", { name: /^ביטול הקישור של / }).nth(1).click();
  await expect(dialog.getByRole("button", { name: /^ביטול הקישור של / })).toHaveCount(before - 1);
  await expect(dialog.getByRole("button", { name: "קישור", exact: true })).toHaveCount(1);
  await dialog.getByRole("button", { name: /^קישור כל ההצעות/ }).click();
  await expect(dialog.getByRole("button", { name: /^ביטול הקישור של / })).toHaveCount(before);

  await dialog.getByRole("button", { name: "סגירה" }).click();
  await expect(dialog).toBeHidden();
});
