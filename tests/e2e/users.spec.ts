import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("users: add a manager with permissions, edit, and put them in a group", async ({ page }) => {
  const n = Date.now();
  const name = `מנהלת e2e ${n}`;
  const email = `e2e-${n}@example.test`;
  await login(page, "/admin/users");
  await expect(page.getByRole("heading", { name: "משתמשים", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "הוספת משתמש" }).click();
  await page.getByLabel("שם מלא").fill(name);
  await page.getByLabel("מייל").fill(email);
  await page.getByLabel("טלפון נייד").fill("0501234567");
  await page.getByRole("radio", { name: /מנהל/ }).first().check();
  await page.getByRole("button", { name: "יצירת המשתמש" }).click();
  await expect(page.getByRole("status")).toContainText("נשמר");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Admin hides the manager-only permissions.
  await page.getByRole("radio", { name: /אדמין/ }).check();
  await expect(page.getByRole("heading", { name: "הרשאות" })).toBeHidden();
  await page.getByRole("radio", { name: /^מנהל/ }).check();
  await expect(page.getByRole("heading", { name: "הרשאות" })).toBeVisible();

  // Listed, with the phone.
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await expect(page.getByText(email).first()).toBeVisible();

  // A group of managers.
  await page.goto("/admin/users?tab=groups");
  await page.getByLabel("שם הקבוצה").first().fill(`קבוצת e2e ${n}`);
  await page.getByLabel(`${name} – קבוצה חדשה`).check();
  await page.getByRole("button", { name: "יצירת קבוצה" }).click();
  await expect(page.getByRole("status")).toContainText("נשמר");
  await expect(page.getByLabel(`${name} – קבוצת e2e ${n}`)).toBeChecked();
});

test("users: a refused save keeps everything already typed and ticked", async ({ page }) => {
  const n = Date.now();
  const name = `מנהלת שגיאה e2e ${n}`;
  const email = `e2e-keep-${n}@example.test`;
  await login(page, "/admin/users");
  await page.getByRole("link", { name: "הוספת משתמש" }).click();
  await page.getByLabel("שם מלא").fill(name);
  await page.getByLabel("מייל").fill(email);
  await page.getByRole("radio", { name: /^מנהל/ }).check();
  const grant = page.getByLabel("רשאי לייצא דוחות (Excel / CSV / PDF חתומים)");
  await grant.check();
  // A phone the server refuses: the save must come back as a message, not as a fresh empty form.
  await page.getByLabel("טלפון נייד").fill("12345");
  await page.getByRole("button", { name: "יצירת המשתמש" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "מספר הטלפון לא תקין" })).toBeVisible();
  await expect(page.getByLabel("שם מלא")).toHaveValue(name);
  await expect(page.getByLabel("מייל")).toHaveValue(email);
  await expect(page.getByLabel("טלפון נייד")).toHaveValue("12345");
  await expect(grant).toBeChecked();

  // Fixing just the phone saves the rest as it stands.
  await page.getByLabel("טלפון נייד").fill("0501112233");
  await page.getByRole("button", { name: "יצירת המשתמש" }).click();
  await expect(page.getByRole("status")).toContainText("נשמר");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByLabel("רשאי לייצא דוחות (Excel / CSV / PDF חתומים)")).toBeChecked();
});
