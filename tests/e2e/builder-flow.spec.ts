import { expect, test } from "@playwright/test";
import { login, newFormFromPdf } from "./helpers";

// builder-plan.md §2.7 (route A): a form built from scratch, Google-Forms style, then filled and published.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

test("from scratch: eight field types, labels, a condition, a second page, preview fill+submit, publish, package", async ({ page }) => {
  await login(page, "/admin/forms");
  const title = `בונה e2e ${Date.now()}`;
  const id = await newFormFromPdf(page, title);
  await page.getByRole("tab", { name: "עריכה" }).click();
  const palette = page.getByRole("button", { name: /^(תשובה קצרה|תעודת זהות|בחירה יחידה|תאריך|סכום \(₪\)|כן \/ לא|שם מלא|חתימה)$/ });

  // Eight field types from the palette; the last one added is selected in the settings panel.
  const quick = page.getByRole("group", { name: "עריכה מהירה" }).or(page.locator('[aria-label="עריכה מהירה"]'));
  const add = async (type: string, label: string) => {
    await palette.filter({ hasText: type }).first().click();
    await quick.getByLabel("תווית השדה").fill(label);
  };
  await add("תשובה קצרה", "תפקיד");
  await add("תעודת זהות", "מספר זהות");
  await add("בחירה יחידה", "סוג העסקה");
  await page.getByPlaceholder(/שורה לכל פריט/).first().fill("חודשי\nשעתי");
  await page.getByText('הוספת אפשרות "אחר"').click();
  await add("תאריך", "תאריך התחלה");
  await add("סכום (₪)", "שכר");
  await add("כן / לא", "רכב צמוד?");
  await add("שם מלא", "שם העובד");
  await add("חתימה", "חתימת העובד");
  await page.getByRole("switch", { name: "שדה חובה" }).click();

  // Condition: the salary shows only for monthly employment.
  await page.getByRole("button", { name: /^שכר/ }).first().click();
  await page.getByRole("button", { name: "הוספת תנאי" }).first().click();
  await page.getByRole("combobox", { name: "שדה", exact: true }).first().selectOption({ label: "סוג העסקה" });
  await page.getByRole("combobox", { name: "ערך", exact: true }).first().selectOption({ label: "חודשי" });

  // Second page with one field.
  await page.getByRole("button", { name: "עמוד חדש" }).click();
  await add("תשובה קצרה", "הערות");

  // Autosave, then the full-page preview: fill, step through, submit.
  await page.waitForTimeout(1500);
  await expect(page.getByText("נשמר", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.goto(`/preview/form/${id}`);
  await expect(page.getByLabel("תפקיד")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("שכר")).toHaveCount(0); // hidden until "חודשי"
  await page.getByLabel("תפקיד").fill("מדריך");
  await page.getByLabel("מספר זהות").fill("000000018");
  await page.getByLabel("חודשי").check();
  await expect(page.getByLabel("שכר")).toBeVisible();
  await page.getByLabel("שכר").fill("12000");
  await page.getByLabel("תאריך התחלה").fill("2026-11-01");
  await page.getByRole("radiogroup").filter({ hasText: "כן" }).last().getByLabel("כן", { exact: true }).check();
  await page.getByLabel("שם פרטי").fill("דנה");
  await page.getByLabel("שם משפחה").fill("כהן");
  await page.getByRole("button", { name: "חתימה", exact: true }).click();
  await page.getByRole("tab", { name: "הקלדה" }).click();
  await page.getByPlaceholder("הקלידו את שמכם").fill("דנה כהן");
  await page.getByRole("button", { name: "שמירת חתימה" }).click();
  await page.getByRole("button", { name: "הבא" }).click();
  await page.getByLabel("הערות").fill("אין");
  await page.getByRole("button", { name: "שליחה" }).click();
  // With a PDF attached the saved answers sit in a collapsed section.
  await page.getByText("התשובות כפי שנשמרות (JSON)").click();
  const result = page.getByTestId("result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("12000");
  await expect(result).toContainText("000000018");

  // Publish and attach to a package.
  await page.goto(`/admin/forms/${id}`);
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("גרסה 1 פורסמה")).toBeVisible({ timeout: 20_000 });
  await page.goto("/admin/packages");
  const pkg = `ערכת בונה e2e ${Date.now()}`;
  await page.getByLabel("שם הערכה החדשה").fill(pkg);
  await page.getByRole("button", { name: "ערכה חדשה" }).click();
  await expect(page.getByRole("heading", { name: pkg })).toBeVisible();
  const picker = page.locator("select").filter({ has: page.locator(`option:has-text("${title}")`) }).first();
  await picker.selectOption({ label: title });
  await page.getByRole("button", { name: "הוספת טופס" }).click();
  await expect(page.locator("main").getByText(title).first()).toBeVisible({ timeout: 15_000 });
});
