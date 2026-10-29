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
