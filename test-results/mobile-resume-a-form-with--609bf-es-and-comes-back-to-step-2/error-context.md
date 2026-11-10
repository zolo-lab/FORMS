# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-resume.spec.ts >> a form with two steps: the employee fills step 1 on a phone, leaves, and comes back to step 2
- Location: tests/e2e/mobile-resume.spec.ts:30:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('גרסה 1 פורסמה')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('גרסה 1 פורסמה') with timeout 20000ms
  - waiting for getByText('גרסה 1 פורסמה')

```

```yaml
- banner:
  - link "דילוג לתוכן":
    - /url: "#main"
  - link "מערכת הטפסים":
    - /url: /admin/requests
  - navigation "ראשי":
    - link "לטיפולי":
      - /url: /admin/inbox
    - link "היסטוריית טפסים":
      - /url: /admin/requests
    - link "קמפיינים":
      - /url: /admin/campaigns
    - link "תבניות טפסים":
      - /url: /admin/forms
    - link "משתמשים":
      - /url: /admin/users
    - link "רשימות":
      - /url: /admin/lists
    - link "נתונים וייצוא":
      - /url: /admin/archive
    - button "הגדרות"
  - button "יציאה"
- link "← טפסים":
  - /url: /admin/forms
- 'heading "עריכת טופס: Resume e2e 1794270704732" [level=1]'
- textbox "שם הטופס": Resume e2e 1794270704732
- text: טיוטה (גרסה 2)
- status: נשמר
- tablist:
  - tab "PDF"
  - tab "רספונסיבי" [selected]
  - tab "שלבי הטופס"
  - tab "עיבוד טופס"
  - tab "תצוגה מקדימה"
- button "שדות מרשימה"
- group: כלים
- button "ביטול"
- button "שחזור" [disabled]
- button "פרסום"
- text: הצגת שלב
- combobox "הצגת שלב":
  - option "— כל השלבים —" [selected]
  - option "שלב 1 · השולח"
  - option "שלב 2 · העובד"
- button "עריכת שלבים"
- complementary:
  - heading "שאלות" [level=3]
  - list:
    - listitem:
      - button "תשובה קצרה"
    - listitem:
      - button "פסקה"
    - listitem:
      - button "בחירה יחידה"
    - listitem:
      - button "תיבות סימון"
    - listitem:
      - button "רשימה נפתחת"
    - listitem:
      - button "סולם ליניארי"
    - listitem:
      - button "דירוג"
    - listitem:
      - button "תאריך"
    - listitem:
      - button "שעה"
    - listitem:
      - button "מספר"
    - listitem:
      - button "סכום (₪)"
    - listitem:
      - button "אחוז"
    - listitem:
      - button "דוא\"ל"
    - listitem:
      - button "כן / לא"
    - listitem:
      - button "העלאת קובץ"
  - heading "פרטים ישראליים" [level=3]
  - list:
    - listitem:
      - button "טלפון"
    - listitem:
      - button "תעודת זהות"
  - heading "מתקדם" [level=3]
  - list:
    - listitem:
      - button "חתימה"
    - listitem:
      - button "חותמת"
    - listitem:
      - button "תאריך חתימה"
    - listitem:
      - button "הצהרה / אישור"
    - listitem:
      - button "טבלה חוזרת"
  - heading "תצוגה (לא שדות, רק בטופס הרספונסיבי)" [level=3]
  - list:
    - listitem:
      - button "כותרת"
    - listitem:
      - button "טקסט הסבר"
    - listitem:
      - button "תמונה"
    - listitem:
      - button "קו מפריד"
    - listitem:
      - button "מקטע"
    - listitem:
      - button "קישור"
- button "עמוד 1"
- button "העברת עמוד למעלה" [disabled]
- button "העברת עמוד למטה"
- button "מחיקת עמוד"
- button "שם מלא תשובה קצרה · שלב 2 · העובד"
- button "הזזה למעלה" [disabled]
- button "הזזה למטה"
- button "שכפול שדה"
- button "מחיקת שדה"
- button "מספר זהות תעודת זהות · שלב 2 · העובד"
- button "הזזה למעלה"
- button "הזזה למטה"
- button "שכפול שדה"
- button "מחיקת שדה"
- button "עמוד 2"
- button "העברת עמוד למעלה"
- button "העברת עמוד למטה" [disabled]
- button "מחיקת עמוד"
- button "תאריך לידה תאריך · שלב 2 · העובד"
- button "הזזה למעלה"
- button "הזזה למטה"
- button "שכפול שדה"
- button "מחיקת שדה"
- button "טלפון נייד טלפון · שלב 2 · העובד"
- button "הזזה למעלה"
- button "הזזה למטה" [disabled]
- button "שכפול שדה"
- button "מחיקת שדה"
- button "עמוד חדש"
- complementary "הגדרות":
  - text: כותרת העמוד
  - textbox: עמוד 1
  - text: הסבר (אופציונלי)
  - textbox
  - heading "תנאי הצגת העמוד" [level=4]
  - paragraph: "ללא תנאי: מוצג תמיד."
  - button "הוספת תנאי"
  - heading "דילוג בטופס" [level=4]
  - paragraph: אחרי העמוד הזה עוברים לעמוד הבא, אלא אם אחד התנאים כאן מתקיים (הראשון שמתקיים קובע).
  - button "כלל דילוג"
- alert
```

# Test source

```ts
  1  | import { readFileSync } from "node:fs";
  2  | import path from "node:path";
  3  | import { devices, expect, test } from "@playwright/test";
  4  | import fontkit from "@pdf-lib/fontkit";
  5  | import { PDFDocument, rgb } from "pdf-lib";
  6  | import { drawHebrew } from "../../src/lib/pdf/hebrew";
  7  | import { login, newFormFromPdf } from "./helpers";
  8  | 
  9  | // builder-plan.md part 5 (5.6): a long form filled in parts, on a phone. Needs the dev database.
  10 | test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
  11 | test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
  12 | test.setTimeout(240_000);
  13 | 
  14 | async function twoPagePdf(): Promise<Buffer> {
  15 |   const doc = await PDFDocument.create();
  16 |   doc.registerFontkit(fontkit);
  17 |   const font = await doc.embedFont(readFileSync(path.join(process.cwd(), "assets/fonts/Heebo-Regular.ttf")), { subset: true });
  18 |   const pages = [["שם מלא", "מספר זהות"], ["תאריך לידה", "טלפון נייד"]];
  19 |   for (const labels of pages) {
  20 |     const page = doc.addPage([595.28, 841.89]);
  21 |     labels.forEach((label, i) => {
  22 |       const y = 760 - i * 40;
  23 |       drawHebrew(page, label, { x: 400, y, width: 120, size: 12, font });
  24 |       page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 390, y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
  25 |     });
  26 |   }
  27 |   return Buffer.from(await doc.save());
  28 | }
  29 | 
  30 | test("a form with two steps: the employee fills step 1 on a phone, leaves, and comes back to step 2", async ({ page, browser, baseURL }) => {
  31 |   await login(page, "/admin/forms");
  32 |   const title = `Resume e2e ${Date.now()}`;
  33 |   await newFormFromPdf(page, title, await twoPagePdf());
  34 | 
  35 |   // Fields proposed from the document, one step per PDF page.
  36 |   const dialog = page.getByRole("dialog", { name: "שדות שזוהו ב-PDF" });
  37 |   await expect(dialog).toBeVisible({ timeout: 45_000 });
  38 |   await dialog.getByRole("button", { name: /^הוספת 4 שדות לטופס$/ }).click();
  39 |   await page.getByRole("tab", { name: "רספונסיבי" }).click();
  40 |   await expect(page.getByText("עמוד 2").filter({ visible: true }).first()).toBeVisible();
  41 |   await page.getByRole("button", { name: "פרסום" }).click();
> 42 |   await expect(page.getByText("גרסה 1 פורסמה")).toBeVisible({ timeout: 20_000 });
     |                                                 ^ Error: expect(locator).toBeVisible() failed
  43 | 
  44 |   // The form carries its own route (requester → employee by default): open a request from it.
  45 |   await page.goto("/admin/requests/new");
  46 |   await page.getByLabel("טופס", { exact: true }).selectOption({ label: title });
  47 |   await page.getByRole("button", { name: "הבא" }).click();
  48 |   await page.getByLabel("שם העובד").fill(`עובד resume ${Date.now()}`);
  49 |   await page.getByLabel("מייל").fill("e2e-resume@example.invalid");
  50 |   await page.getByRole("button", { name: "הבא" }).click();
  51 |   const next = page.getByRole("button", { name: "הבא" });
  52 |   if (await next.isVisible()) await next.click();
  53 |   await page.getByRole("button", { name: "שליחה" }).click();
  54 |   const done = page.getByTestId("request-done");
  55 |   await expect(done.getByRole("heading", { name: "הבקשה נשלחה" })).toBeVisible({ timeout: 30_000 });
  56 |   const link = await done.getByLabel(/קישור ל/).first().inputValue();
  57 | 
  58 |   // The employee, on a phone.
  59 |   const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: baseURL!, locale: "he-IL" });
  60 |   const phone = await ctx.newPage();
  61 |   await phone.goto(new URL(link).pathname);
  62 |   await expect(phone.getByLabel("שם מלא", { exact: true })).toBeVisible({ timeout: 30_000 });
  63 |   await phone.getByLabel("שם מלא", { exact: true }).fill("דנה כהן");
  64 |   await phone.getByLabel("מספר זהות", { exact: true }).fill("000000018");
  65 |   await phone.getByRole("button", { name: "הבא" }).click();
  66 |   await expect(phone.getByLabel("תאריך לידה", { exact: true })).toBeVisible();
  67 |   await phone.getByLabel("תאריך לידה", { exact: true }).fill("1990-05-01");
  68 |   await expect(phone.getByText("נשמר אוטומטית")).toBeVisible({ timeout: 20_000 });
  69 | 
  70 |   // Away and back: the answers are there and the form opens on the step that is not finished.
  71 |   await phone.reload();
  72 |   await expect(phone.getByLabel("תאריך לידה", { exact: true })).toBeVisible({ timeout: 30_000 });
  73 |   await expect(phone.getByLabel("תאריך לידה", { exact: true })).toHaveValue("1990-05-01");
  74 |   await phone.getByRole("button", { name: "הקודם" }).click();
  75 |   await expect(phone.getByLabel("שם מלא", { exact: true })).toHaveValue("דנה כהן");
  76 |   await ctx.close();
  77 | });
  78 | 
```