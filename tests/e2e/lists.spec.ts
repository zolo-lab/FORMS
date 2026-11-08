import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

/**
 * The organizations sheet: a column is added in Hebrew, a cell saves itself, and deleting the column shows what it
 * touches first. Everything the admin sees is Hebrew; the internal name waits behind "פרטים למפתחים".
 */
test("lists: add a column, fill a cell that saves itself, then delete the column with its impact shown", async ({ page }) => {
  const n = Date.now();
  const col = `עמודת e2e ${n}`;
  await login(page, "/admin/lists");
  await expect(page.getByRole("heading", { name: "רשימות", exact: true })).toBeVisible();

  // + עמודה: a Hebrew name and a type, nothing in English.
  await page.getByRole("button", { name: /^עמודה/ }).first().click();
  await page.getByLabel("שם העמודה").fill(col);
  await page.getByLabel("סוג").selectOption("number");
  await page.getByRole("button", { name: "הוספה" }).click();
  // The header exists twice (sheet and phone chips); the one for this viewport is visible.
  await expect(page.getByRole("button", { name: col, exact: true }).locator("visible=true")).toBeVisible();

  // The first cell of the new column saves on blur, and the chip says so.
  const cell = page.getByRole("textbox", { name: new RegExp(`^${col} – `) }).locator("visible=true").first();
  await cell.fill("123456");
  await cell.press("Tab");
  await expect(page.getByRole("status")).toContainText("כל השינויים נשמרו");
  await page.reload();
  await expect(page.getByRole("textbox", { name: new RegExp(`^${col} – `) }).locator("visible=true").first()).toHaveValue("123456");

  // Delete: the dialog says one organization filled it and no form uses it.
  await page.getByRole("button", { name: `פעולות – ${col}` }).locator("visible=true").click();
  await page.getByRole("menuitem", { name: "מחיקת העמודה…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("העמודה מלאה ב-1 עמותות");
  await expect(dialog).toContainText("אף טופס לא משתמש בה");
  await dialog.getByRole("button", { name: "מחיקה מכל העמותות" }).click();
  await expect(page.getByRole("textbox", { name: new RegExp(`^${col} – `) })).toHaveCount(0);
});
