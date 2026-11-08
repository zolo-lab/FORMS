import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

// The desktop table and the phone cards both render; only one is visible at a time.
const visible = "visible=true";

test("lists: a type with a choice field, a list filled and saved, then the type deleted", async ({ page }) => {
  await login(page, "/admin/lists");
  await expect(page.getByRole("heading", { name: "רשימות", level: 1 })).toBeVisible();
  // The organizations are the built-in type, shown first.
  await expect(page.getByRole("heading", { name: "עמותות ועסקים", level: 2 })).toBeVisible();

  const type = `סוג בדיקה ${Date.now()}`;
  await page.getByRole("button", { name: "סוג רשימה" }).click();
  const create = page.getByRole("dialog", { name: "סוג רשימה חדש" });
  await create.getByLabel("שם הסוג").fill(type);
  await create.getByRole("button", { name: "יצירה" }).click();
  await expect(page.getByRole("heading", { name: type, level: 2 })).toBeVisible();

  // A choice field, its options typed line by line.
  await page.getByRole("button", { name: "שדה", exact: true }).click();
  const add = page.getByRole("dialog", { name: "שדה חדש" });
  await add.getByLabel("שם השדה").fill("אזור");
  await add.getByLabel("סוג").selectOption("select");
  await add.getByLabel("אפשרות 1", { exact: true }).fill("צפון");
  await add.getByLabel("אפשרות 1", { exact: true }).press("Enter");
  await add.getByLabel("אפשרות 2", { exact: true }).fill("דרום");
  await add.getByRole("button", { name: "הוספה" }).click();
  await expect(add).toBeHidden();

  await page.getByRole("button", { name: "רשימה חדשה" }).click();
  const name = page.getByLabel("שם – ללא שם").locator(visible);
  await name.fill("סניף בדיקה");
  await name.blur();
  await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();
  await page.getByLabel("אזור – סניף בדיקה").locator(visible).selectOption("דרום");
  await expect(page.getByText(/כל השינויים נשמרו/)).toBeVisible();

  // It stays after a reload.
  await page.reload();
  await expect(page.getByLabel("אזור – סניף בדיקה").locator(visible)).toHaveValue("דרום");

  await page.getByRole("button", { name: "מחיקת הסוג" }).click();
  const del = page.getByRole("dialog", { name: `מחיקת "${type}"` });
  await expect(del.getByText("1 רשימות ימחקו")).toBeVisible();
  await del.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("heading", { name: "עמותות ועסקים", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(type) })).toHaveCount(0);
});
