import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { login, newFormFromPdf } from "./helpers";

// builder-plan.md §1.7 (route B): a form built from an existing PDF, iForms-style.
// Needs the dev database; skipped when DATABASE_URL is not provided.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
test.setTimeout(180_000);

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText("Employee form - name: ________   ID: _________", { x: 50, y: 760, size: 12, font });
  page.drawText("Date: ________   Agree: [ ]   Signature: __________", { x: 50, y: 700, size: 12, font });
  return Buffer.from(await doc.save());
}

test("PDF form: upload, draw, publish, package, request, fill on the document, final PDF", async ({ page, browser, baseURL }) => {
  await login(page, "/admin/forms");
  const title = `PDF e2e ${Date.now()}`;
  // A one-page PDF generated on the fly starts the form.
  await newFormFromPdf(page, title, await samplePdf());
  await expect(page.getByText(/source\.pdf · 1 עמודים/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pdf-page-0").locator("canvas")).toBeVisible({ timeout: 20_000 });

  // Five elements from the palette; each lands on its own spot.
  for (const label of ["טקסט", 'ת"ז בתאים', "תאריך", "תיבת סימון", "חתימה"]) {
    await page.getByRole("button", { name: `הוספת ${label}`, exact: true }).click();
  }
  const stamps = page.locator("[data-stamp]");
  await expect(stamps).toHaveCount(5);
  const boxes = await stamps.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; }));
  expect(new Set(boxes).size).toBe(5);
  await expect(page.getByText("5 חותמות ממופות")).toBeVisible();

  // The last element (signature) is selected: give it to the employee.
  await page.getByLabel("מי ממלא").selectOption("employee");

  // The drawn fields are ordinary fields of the form: they show in the editor like any other (no hidden page).
  await page.getByRole("tab", { name: "עריכה" }).click();
  await expect(page.getByText("מספר זהות").first()).toBeVisible();
  await expect(page.getByText("שדות במסמך")).toHaveCount(0);

  // Publish.
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("גרסה 1 פורסמה")).toBeVisible({ timeout: 20_000 });

  // Viewing the published form shows the PDF itself with the placed fields to fill.
  const formId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(`/preview/form/${formId}`);
  await expect(page.getByRole("button", { name: "על גבי המסמך" })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("מספר זהות", { exact: true })).toBeVisible();

  // Attach to a new package.
  await page.goto("/admin/packages");
  const pkg = `ערכת PDF e2e ${Date.now()}`;
  await page.getByLabel("שם הערכה החדשה").fill(pkg);
  await page.getByRole("button", { name: "ערכה חדשה" }).click();
  await expect(page.getByRole("heading", { name: pkg })).toBeVisible();
  const picker = page.locator("select").filter({ has: page.locator(`option:has-text("${title}")`) }).first();
  await picker.selectOption({ label: title });
  await page.getByRole("button", { name: "הוספת טופס" }).click();
  await expect(page.locator("main").getByText(title).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("הוסיפו לפחות טופס אחד")).toHaveCount(0);

  // ---- Stage B: a request from that package, filled by the employee on the document, final PDF. ----
  await page.goto("/admin/requests/new");
  await page.getByLabel("ערכת מסמכים").selectOption({ label: pkg });
  await page.getByRole("button", { name: "הבא" }).click();
  const employee = `עובד PDF e2e ${Date.now()}`;
  await page.getByLabel("שם העובד").fill(employee);
  await page.getByLabel("מייל").fill("e2e-pdf@example.invalid");
  await page.getByRole("button", { name: "הבא" }).click();
  const next = page.getByRole("button", { name: "הבא" });
  if (await next.isVisible()) await next.click();
  await page.getByRole("button", { name: "שליחה" }).click();
  const done = page.getByTestId("request-done");
  await expect(done.getByRole("heading", { name: "הבקשה נשלחה" })).toBeVisible({ timeout: 30_000 });
  const link = await done.getByLabel(/קישור ל/).first().inputValue();
  await done.getByRole("link", { name: "לעמוד הבקשה" }).click();
  await page.waitForURL(/\/admin\/requests\/[0-9a-f-]+$/);
  const requestUrl = page.url();

  // The employee, in a fresh context, fills straight on the document.
  const ctx = await browser.newContext({ baseURL: baseURL!, viewport: { width: 1400, height: 900 } });
  const guest = await ctx.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText(`עבור: ${employee}`)).toBeVisible({ timeout: 20_000 });
  await guest.getByRole("button", { name: "על גבי המסמך" }).click();
  await expect(guest.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await guest.getByLabel("טקסט", { exact: true }).fill("דנה כהן");
  await guest.getByLabel("מספר זהות", { exact: true }).fill("000000018");
  await guest.getByLabel("תאריך", { exact: true }).fill("2026-11-01");
  await guest.getByLabel("אישור", { exact: true }).check();
  await guest.getByRole("button", { name: "חתימה", exact: true }).click();
  await guest.getByRole("tab", { name: "הקלדה" }).click();
  await guest.getByPlaceholder("הקלידו את שמכם").fill("דנה כהן");
  await guest.getByRole("button", { name: "שמירת חתימה" }).click();
  await guest.getByRole("button", { name: "שליחה" }).click();
  await expect(guest.getByText(/תודה|נשלח|הושלם/).first()).toBeVisible({ timeout: 30_000 });
  await ctx.close();

  // The final PDF exists (made when the last step completes, or on demand) and is a real one-page PDF.
  await page.goto(requestUrl);
  const finalize = page.getByRole("button", { name: "יצירת קבצי PDF סופיים" });
  if (await finalize.isVisible()) {
    await finalize.click();
    await expect(page.getByRole("status")).toBeVisible({ timeout: 30_000 });
    await page.reload();
  }
  const pdfLink = page.getByRole("link", { name: "פתיחת ה-PDF (כולל אסמכתא)" }).first();
  await expect(pdfLink).toBeVisible({ timeout: 30_000 });
  const res = await page.request.get((await pdfLink.getAttribute("href"))!);
  expect(res.ok()).toBe(true);
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  const finalDoc = await PDFDocument.load(body, { ignoreEncryption: true });
  expect(finalDoc.getPageCount()).toBeGreaterThanOrEqual(1);
});

test("a new form cannot be published without a PDF, and a form is created only from one", async ({ page }) => {
  await login(page, "/admin/forms");
  // The old "blank form" entry is gone; the one card asks for a PDF.
  await expect(page.getByRole("button", { name: "להתחיל מטופס ריק" })).toHaveCount(0);
  await page.getByRole("button", { name: "יצירת הטופס" }).click();
  await expect(page.getByText("בחרו קובץ PDF כדי להתחיל")).toBeVisible();

  // From a template the form has fields but no document yet: publishing says why it is blocked.
  await page.getByLabel("שם הטופס מתבנית קליטת עובד").fill(`ללא PDF ${Date.now()}`);
  await page.locator("form").filter({ hasText: "קליטת עובד" }).getByRole("button", { name: "יצירה מתבנית" }).click();
  await page.waitForURL(/\/admin\/forms\/[0-9a-f-]{36}\?tab=pdf/);
  await page.getByRole("button", { name: "פרסום" }).click();
  await expect(page.getByText("העלו PDF לפני הפרסום")).toBeVisible({ timeout: 20_000 });
});
