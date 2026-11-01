import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("the triggers panel lists every e-mail and saves a setting, then goes back to the default", async ({ page }) => {
  await login(page, "/admin/mail/triggers");
  await expect(page.getByRole("link", { name: "טריגרים" })).toHaveAttribute("aria-current", "page");
  for (const name of ["הזמנה למילוי וחתימה", "תזכורת", "התהליך הושלם", "קוד אימות"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }

  // The weekly summary only runs from the cron, so changing it here can't affect other tests.
  const card = page.locator("li").filter({ has: page.getByRole("heading", { name: "סיכום שבועי של ממתינים" }) });
  await expect(card.getByText("ברירת מחדל")).toBeVisible();
  await card.getByRole("checkbox", { name: "פעיל – לשלוח את המייל הזה" }).uncheck();
  await card.getByRole("button", { name: "שמירה" }).click();
  await expect(card.getByText("הגדרה לכל העמותות")).toBeVisible();
  await expect(card.getByText("כבוי", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "חזרה לברירת המחדל" }).click();
  await expect(card.getByText("ברירת מחדל")).toBeVisible();
  await expect(card.getByText("פעיל", { exact: true })).toBeVisible();
});

test("switched on with no one to send to is refused", async ({ page }) => {
  await login(page, "/admin/mail/triggers");
  const card = page.locator("li").filter({ has: page.getByRole("heading", { name: "התהליך הושלם" }) });
  for (const box of await card.getByRole("checkbox", { name: /^(העובד|שולח הבקשה|מזכירות העמותה|הנהלת חשבונות|כתובות קבועות)$/ }).all()) await box.uncheck();
  await card.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("alert").first()).toContainText("לפחות נמען אחד");
  await expect(card.getByText("ברירת מחדל")).toBeVisible();
});
