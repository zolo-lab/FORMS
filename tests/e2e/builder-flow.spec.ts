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
  await add("תשובה קצרה", "שם העובד");
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
  await page.getByLabel("שם העובד").fill("דנה כהן");
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
  // The signing route is part of the form ("שלבי הטופס"), like in iForms.
  await page.getByRole("tab", { name: "שלבי הטופס" }).click();
  await expect(page.getByRole("heading", { name: "שלבי הטופס" })).toBeVisible();
  // A new form starts with requester → employee; add a third step and save all steps with one button.
  await page.getByRole("button", { name: "הוספת שלב" }).click();
  const step3 = page.getByRole("listitem", { name: "שלב 3" });
  await page.getByRole("button", { name: "שמירת השלבים" }).click();
  // A "משתמש מוגדר" step needs a user: nothing is saved and the edit stays on screen.
  await expect(page.getByRole("alert").filter({ hasText: "יש לבחור איש קשר" })).toBeVisible();
  await step3.getByLabel("מי בשלב 3").selectOption({ label: "מייל שאני רושם (למשל גורם חיצוני)" });
  await step3.getByLabel("מייל").fill("payroll@example.test");
  await page.getByRole("button", { name: "שמירת השלבים" }).click();
  await expect(page.getByRole("status").filter({ hasText: "השלבים נשמרו" })).toBeVisible();
  await page.goto(`/admin/forms/${id}/flow`); // old link: lands on the steps tab
  await expect(page.getByRole("listitem", { name: "שלב 3" }).getByLabel("מייל")).toHaveValue("payroll@example.test");
  // Each step is its own choice for the fields, and its fields can be highlighted (and others moved into it).
  await page.getByRole("tab", { name: "עריכה (רספונסיבי)" }).click();
  const focus = page.getByLabel("הדגשת השדות של שלב");
  await expect(focus.locator("option")).toHaveText(["כל השלבים", /^שלב 1 · /, /^שלב 2 · /, /^שלב 3 · /]);
  await focus.selectOption({ index: 3 });
  await expect(page.getByRole("button", { name: /לשלב הזה/ }).first()).toBeVisible();
  // The form is offered when opening a request, by its own name.
  await page.goto("/admin/requests/new");
  await expect(page.getByLabel("טופס", { exact: true }).locator(`option:has-text("${title}")`)).toHaveCount(1);
});
