import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

/** A fixed record: the organization's values are copied into the form as locked defaults, no picker. */
test("fields from a list with a fixed record come in filled and locked", async ({ page }) => {
  await login(page);
  await newFormFromPdf(page, `רשומה קבועה e2e ${Date.now()}`);
  await page.getByRole("tab", { name: "רספונסיבי" }).click();
  await page.getByRole("button", { name: "שדות מרשימה" }).click();
  const dialog = page.getByRole("dialog", { name: "שדות מרשימה" });
  await dialog.getByRole("button", { name: /^עמותות ועסקים/ }).click();
  await dialog.getByText("רשומה קבועה").click();
  const picker = dialog.getByRole("combobox", { name: /רשומה/ }).or(dialog.locator("#fixed-record"));
  await picker.first().fill("פנימה");
  await page.getByRole("option", { name: "פנימה" }).click();
  // The values show beside the fields before adding.
  await expect(dialog.getByText("580078277")).toBeVisible();
  await expect(dialog.getByLabel("לקריאה בלבד – הממלא לא ישנה את הערכים")).toBeChecked();
  // Only the name and the number.
  await dialog.getByRole("button", { name: "כלום" }).click();
  await dialog.getByRole("checkbox", { name: /^שם/ }).first().check();
  await dialog.getByRole("checkbox", { name: /^ח"פ/ }).check();
  await dialog.getByRole("button", { name: /^הוספת 2 שדות עם הערכים של «פנימה»/ }).click();
  await expect(dialog).toBeHidden();
  // In the preview: filled, read-only, no picker.
  await page.getByRole("tab", { name: "תצוגה מקדימה" }).click();
  const reg = page.getByLabel('ח"פ', { exact: true });
  await expect(reg).toHaveValue("580078277");
  await expect(reg).toBeDisabled();
  await expect(page.getByLabel("שם", { exact: true })).toHaveValue("פנימה");
  await expect(page.getByRole("combobox", { name: "עמותות ועסקים" })).toHaveCount(0);
});
