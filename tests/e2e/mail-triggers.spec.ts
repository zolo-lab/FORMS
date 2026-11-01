import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

// The weekly summary only runs from the cron, so changing it here can't affect other tests.
const DIGEST = "סיכום שבועי של ממתינים";

test("the triggers list: one row per e-mail, switched off and on from the row", async ({ page }) => {
  await login(page, "/admin/mail/triggers");
  await expect(page.getByRole("link", { name: "טריגרים" })).toHaveAttribute("aria-current", "page");
  for (const name of ["הזמנה למילוי וחתימה", "תזכורת", "התהליך הושלם", "קוד אימות", DIGEST]) {
    await expect(page.locator("tbody tr").filter({ hasText: name }).first()).toBeVisible();
  }
  const row = () => page.locator('tr[data-trigger="weekly_digest"]');
  // Start from the default (an earlier failed run may have left a setting behind).
  await page.goto("/admin/mail/triggers?edit=weekly_digest");
  const reset = page.getByRole("dialog", { name: DIGEST }).getByRole("button", { name: "חזרה לברירת המחדל" });
  if (await reset.isVisible()) {
    await reset.click();
    await expect(row().getByText("הגדרה לכל העמותות")).toHaveCount(0);
  }
  await page.goto("/admin/mail/triggers");

  await row().getByRole("switch", { name: `${DIGEST}: פעיל` }).click();
  await expect(row().getByRole("switch", { name: `${DIGEST}: כבוי` })).toBeVisible();
  await page.waitForURL(/saved=weekly_digest/);
  // (The source badge sits in a column hidden on phones, so only its presence is checked.)
  await expect(row().getByText("הגדרה לכל העמותות")).toHaveCount(1);

  // Back to the default from the edit panel.
  await row().getByRole("link", { name: `עריכה – ${DIGEST}` }).click();
  await page.getByRole("dialog", { name: DIGEST }).getByRole("button", { name: "חזרה לברירת המחדל" }).click();
  await expect(row().getByText("הגדרה לכל העמותות")).toHaveCount(0);
  await expect(row().getByRole("switch", { name: `${DIGEST}: פעיל` })).toBeVisible();
});

test("switched on with no one to send to is refused", async ({ page }) => {
  await login(page, "/admin/mail/triggers");
  await page.goto("/admin/mail/triggers?edit=completed");
  const panel = page.getByRole("dialog", { name: "התהליך הושלם" });
  for (const box of await panel.getByRole("checkbox", { name: /^(העובד|שולח הבקשה|מזכירות העמותה|הנהלת חשבונות|כתובות קבועות)$/ }).all()) await box.uncheck();
  await panel.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "התהליך הושלם" }).getByRole("alert")).toContainText("לפחות נמען אחד");
  await expect(page.locator('tr[data-trigger="completed"]').getByText("הגדרה לכל העמותות")).toHaveCount(0);
});

test("the e-mail's HTML is edited with a live preview, saved, and set back to the default design", async ({ page }) => {
  await login(page, "/admin/mail/triggers");
  await page.goto("/admin/mail/triggers?edit=weekly_digest");
  const panel = page.getByRole("dialog", { name: DIGEST });
  const subject = panel.getByLabel("נושא");
  await subject.fill("סיכום לבדיקה ");
  await panel.getByRole("button", { name: "שם העמותה" }).click();
  await expect(subject).toHaveValue("סיכום לבדיקה {{org}}");
  await expect(panel.getByText("נושא: סיכום לבדיקה עמותת הדוגמה")).toBeVisible();

  const html = panel.getByLabel("עיצוב המייל (HTML)");
  await expect(html).toHaveValue(/dir="rtl"/);
  await html.fill('<p style="color:#b91c1c">שלום {{org}} {{nope}}</p>');
  await expect(panel.frameLocator('iframe[title="תצוגה מקדימה"]').getByText("שלום עמותת הדוגמה")).toBeVisible();
  await expect(panel.getByRole("status")).toContainText("{{nope}}");
  await panel.getByRole("button", { name: "שמירת העיצוב" }).click();
  await expect(page.getByRole("dialog", { name: DIGEST }).getByLabel("עיצוב המייל (HTML)")).toHaveValue('<p style="color:#b91c1c">שלום {{org}} {{nope}}</p>');

  await page.getByRole("dialog", { name: DIGEST }).getByRole("button", { name: "חזרה לעיצוב ברירת המחדל" }).click();
  await expect(page.getByRole("dialog", { name: DIGEST }).getByLabel("נושא")).toHaveValue("{{count}} בקשות ממתינות – {{org}}");
  await expect(page.getByRole("dialog", { name: DIGEST }).getByLabel("עיצוב המייל (HTML)")).toHaveValue(/הודעה אוטומטית/);
});

test("a sample of the e-mail is sent as it is in the editor and shows in the mail center", async ({ page }) => {
  await login(page, "/admin/mail/triggers");
  await page.goto("/admin/mail/triggers?edit=step_invite");
  const panel = page.getByRole("dialog", { name: "הזמנה למילוי וחתימה" });
  await panel.getByLabel("נושא").fill(`דוגמה ${Date.now()} {{form}}`);
  const subject = await panel.getByLabel("נושא").inputValue();
  // A .test address is never handed to the mail provider: it is recorded as sent.
  await panel.getByLabel("שליחת מייל לדוגמה אל").fill("sample@e2e.test");
  await panel.getByRole("button", { name: "שליחת מייל לדוגמה" }).click();
  await expect(page.getByRole("dialog", { name: "הזמנה למילוי וחתימה" }).getByText("נשלח ל-sample@e2e.test")).toBeVisible();

  await page.goto(`/admin/mail?kind=test&q=${encodeURIComponent(subject.replace("{{form}}", "").trim())}`);
  const msg = page.getByRole("listitem").filter({ hasText: "[דוגמה]" }).first();
  await expect(msg).toContainText("קליטת עובד");
  await msg.locator("summary").click();
  await expect(msg.frameLocator("iframe").getByRole("link", { name: "למילוי וחתימה" })).toBeVisible();
});
