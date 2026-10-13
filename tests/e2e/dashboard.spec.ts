import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

test("requests dashboard shows KPIs and filters by search", async ({ page }) => {
  await login(page, "/admin/requests");
  await expect(page.getByRole("heading", { name: "בקשות", exact: true })).toBeVisible();
  const kpis = page.getByRole("region", { name: "מדדים" });
  for (const label of ["פעילות", "באיחור", "הושלמו ב-30 ימים", "חציון ימים להשלמה", "ממתינות לתפקיד"]) {
    await expect(kpis.getByText(label)).toBeVisible();
  }

  await page.getByLabel(/חיפוש/).fill("zzz-no-such-person-zzz");
  await page.getByRole("button", { name: "סינון" }).click();
  await expect(page).toHaveURL(/q=zzz-no-such-person-zzz/);
  await expect(page.getByText("לא נמצאו בקשות לפי הסינון.")).toBeVisible();

  await page.getByRole("link", { name: "ניקוי" }).click();
  await expect(page).toHaveURL(/\/admin\/requests$/);
});

test("switches between table and board and opens the inbox by role", async ({ page }) => {
  await login(page, "/admin/requests");
  await page.getByRole("link", { name: "לוח", exact: true }).click();
  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole("list", { name: "לוח בקשות" }).or(page.getByText("אין בקשות להצגה."))).toBeVisible();
  await page.getByRole("link", { name: "טבלה", exact: true }).click();
  await expect(page).not.toHaveURL(/view=board/);

  await page.goto("/admin/inbox");
  await expect(page.getByRole("heading", { name: "ממתינים לטיפול" })).toBeVisible();
  await page.getByRole("navigation", { name: "תפקיד" }).getByRole("link", { name: /מאשר/ }).click();
  await expect(page).toHaveURL(/role=approver/);
  await expect(page.getByRole("list", { name: "לוח בקשות" }).or(page.getByText(/אין בקשות שממתינות/))).toBeVisible();
});
