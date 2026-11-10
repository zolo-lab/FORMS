# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: field-list.spec.ts >> download the field list as Excel and ask for readable ids
- Location: tests/e2e/field-list.spec.ts:8:5

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /שדות\.xlsx$/
Received string:  "download"
```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - generic [ref=f1e2]:
    - banner [ref=f1e3]:
      - link "דילוג לתוכן" [ref=f1e4] [cursor=pointer]:
        - /url: "#main"
      - link "מערכת הטפסים" [ref=f1e5] [cursor=pointer]:
        - /url: /admin/requests
      - navigation "ראשי" [ref=f1e6]:
        - link "לטיפולי" [ref=f1e7] [cursor=pointer]:
          - /url: /admin/inbox
        - link "היסטוריית טפסים" [ref=f1e8] [cursor=pointer]:
          - /url: /admin/requests
        - link "קמפיינים" [ref=f1e9] [cursor=pointer]:
          - /url: /admin/campaigns
        - link "תבניות טפסים" [ref=f1e10] [cursor=pointer]:
          - /url: /admin/forms
        - link "משתמשים" [ref=f1e11] [cursor=pointer]:
          - /url: /admin/users
        - link "רשימות" [ref=f1e12] [cursor=pointer]:
          - /url: /admin/lists
        - link "נתונים וייצוא" [ref=f1e13] [cursor=pointer]:
          - /url: /admin/archive
        - button "הגדרות" [ref=f1e15]
      - button "יציאה" [ref=f1e20]
    - generic [ref=f1e22]:
      - generic [ref=f1e23]:
        - link "← טפסים" [ref=f1e24] [cursor=pointer]:
          - /url: /admin/forms
        - 'heading "עריכת טופס: Field list 1794270614025" [level=1] [ref=f1e25]'
        - textbox "שם הטופס" [ref=f1e26]: Field list 1794270614025
        - generic [ref=f1e27]: טיוטה (גרסה 1)
        - status [ref=f1e28]: יש שינויים…
        - tablist [ref=f1e29]:
          - tab "PDF" [selected] [ref=f1e30]
          - tab "רספונסיבי" [ref=f1e31]
          - tab "שלבי הטופס" [ref=f1e32]
          - tab "עיבוד טופס" [ref=f1e33]
          - tab "תצוגה מקדימה" [ref=f1e34]
        - generic [ref=f1e35]:
          - button "שדות מרשימה" [ref=f1e36]
          - group [ref=f1e40]:
            - generic "כלים" [ref=f1e41] [cursor=pointer]
            - generic [ref=f1e44]:
              - button "הגדרות הטופס" [ref=f1e45]
              - link "צפייה בטופס (בחלון חדש)" [ref=f1e49] [cursor=pointer]:
                - /url: /preview/form/31cc497c-4493-4b60-978c-f5c03581d5a1
              - button "שמות מזהים לשדות" [ref=f1e54]
              - button "רשימת השדות (Excel)" [active] [ref=f1e58]
              - button "גרסאות קודמות" [ref=f1e62]
              - button "JSON (גיבוי והעברה)" [ref=f1e67]
          - button "ביטול" [ref=f1e68]
          - button "שחזור" [disabled]
          - button "פרסום" [ref=f1e72]
      - generic [ref=f1e73]:
        - generic [ref=f1e74]:
          - generic [ref=f1e75]: הצגת שלב
          - combobox "הצגת שלב" [ref=f1e76]:
            - option "— כל השלבים —" [selected]
            - option "שלב 1 · השולח"
            - option "שלב 2 · העובד (רק אישור)"
        - button "עריכת שלבים" [ref=f1e77]
      - generic [ref=f1e83]:
        - generic [ref=f1e84]:
          - button "החלפת PDF" [ref=f1e85]
          - generic [ref=f1e86]: source.pdf · 1 עמודים
          - button "זיהוי שדות מה-PDF" [ref=f1e87]
        - status [ref=f1e88]: "לא זיהינו ב-PDF מקומות למילוי, לכן בונים ידנית: הוסיפו שדות מהפלטה והציבו אותם על המסמך. הטקסט של המסמך נוסף לטופס הרספונסיבי (1 קטעים)."
        - generic [ref=f1e89]:
          - complementary "סוגי שדות" [ref=f1e90]:
            - heading "סוגי שדות" [level=3] [ref=f1e91]
            - region "סוגי שדות להוספה" [ref=f1e92]:
              - generic [ref=f1e93]:
                - heading "שאלות" [level=3] [ref=f1e94]
                - list [ref=f1e95]:
                  - listitem [ref=f1e96]:
                    - button "הוספת תשובה קצרה" [ref=f1e97]:
                      - generic [ref=f1e103]: תשובה קצרה
                  - listitem [ref=f1e104]:
                    - button "הוספת פסקה" [ref=f1e105]:
                      - generic [ref=f1e106]: פסקה
                  - listitem [ref=f1e107]:
                    - button "הוספת בחירה יחידה" [ref=f1e108]:
                      - generic [ref=f1e112]: בחירה יחידה
                  - listitem [ref=f1e113]:
                    - button "הוספת תיבות סימון" [ref=f1e114]:
                      - generic [ref=f1e118]: תיבות סימון
                  - listitem [ref=f1e119]:
                    - button "הוספת רשימה נפתחת" [ref=f1e120]:
                      - generic [ref=f1e123]: רשימה נפתחת
                  - listitem [ref=f1e124]:
                    - button "הוספת סולם ליניארי" [ref=f1e125]:
                      - generic [ref=f1e127]: סולם ליניארי
                  - listitem [ref=f1e128]:
                    - button "הוספת דירוג" [ref=f1e129]:
                      - generic [ref=f1e132]: דירוג
                  - listitem [ref=f1e133]:
                    - button "הוספת תאריך" [ref=f1e134]:
                      - generic [ref=f1e137]: תאריך
                  - listitem [ref=f1e138]:
                    - button "הוספת שעה" [ref=f1e139]:
                      - generic [ref=f1e143]: שעה
                  - listitem [ref=f1e144]:
                    - button "הוספת מספר" [ref=f1e145]:
                      - generic [ref=f1e149]: מספר
                  - listitem [ref=f1e150]:
                    - button "הוספת סכום (₪)" [ref=f1e151]:
                      - generic [ref=f1e155]: סכום (₪)
                  - listitem [ref=f1e156]:
                    - button "הוספת אחוז" [ref=f1e157]:
                      - generic [ref=f1e162]: אחוז
                  - listitem [ref=f1e163]:
                    - button "הוספת דוא\"ל" [ref=f1e164]:
                      - generic [ref=f1e168]: דוא"ל
                  - listitem [ref=f1e169]:
                    - button "הוספת כן / לא" [ref=f1e170]:
                      - generic [ref=f1e174]: כן / לא
                  - listitem [ref=f1e175]:
                    - button "הוספת העלאת קובץ" [ref=f1e176]:
                      - generic [ref=f1e180]: העלאת קובץ
              - generic [ref=f1e181]:
                - heading "פרטים ישראליים" [level=3] [ref=f1e182]
                - list [ref=f1e183]:
                  - listitem [ref=f1e184]:
                    - button "הוספת טלפון" [ref=f1e185]:
                      - generic [ref=f1e188]: טלפון
                  - listitem [ref=f1e189]:
                    - button "הוספת תעודת זהות" [ref=f1e190]:
                      - generic [ref=f1e195]: תעודת זהות
              - generic [ref=f1e196]:
                - heading "מתקדם" [level=3] [ref=f1e197]
                - list [ref=f1e198]:
                  - listitem [ref=f1e199]:
                    - button "הוספת חתימה" [ref=f1e200]:
                      - generic [ref=f1e203]: חתימה
                  - listitem [ref=f1e204]:
                    - button "הוספת חותמת" [ref=f1e205]:
                      - generic [ref=f1e209]: חותמת
                  - listitem [ref=f1e210]:
                    - button "הוספת תאריך חתימה" [ref=f1e211]:
                      - generic [ref=f1e215]: תאריך חתימה
                  - listitem [ref=f1e216]:
                    - button "הוספת הצהרה / אישור" [ref=f1e217]:
                      - generic [ref=f1e221]: הצהרה / אישור
                  - listitem [ref=f1e222]:
                    - button "הוספת טבלה חוזרת" [ref=f1e223]:
                      - generic [ref=f1e226]: טבלה חוזרת
          - generic [ref=f1e227]:
            - generic [ref=f1e228]:
              - generic [ref=f1e229]: זום
              - button "75%" [ref=f1e230]
              - button "100%" [ref=f1e231]
              - button "125%" [ref=f1e232]
              - button "150%" [ref=f1e233]
              - button "התאמה לרוחב" [ref=f1e234]
              - button "תצוגה מקדימה עם נתוני דוגמה" [ref=f1e235]
            - generic "עמוד 1 ב-PDF" [ref=f1e239]
          - complementary "הגדרות חותמת" [ref=f1e240]:
            - paragraph [ref=f1e241]: בחרו חותמת על העמוד כדי לערוך אותה. חיצים מזיזים (Shift = 10), Delete מוחק.
            - paragraph [ref=f1e242]: 0 חותמות ממופות
  - alert [ref=f1e243]: "עריכת טופס: Field list 1794270614025"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { login, newFormFromPdf } from "./helpers";
  3  | 
  4  | test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
  5  | test.use({ viewport: { width: 1400, height: 900 }, hasTouch: false, isMobile: false, actionTimeout: 20_000 });
  6  | test.setTimeout(120_000);
  7  | 
  8  | test("download the field list as Excel and ask for readable ids", async ({ page }) => {
  9  |   await login(page, "/admin/forms");
  10 |   await newFormFromPdf(page, `Field list ${Date.now()}`);
  11 |   const download = page.waitForEvent("download");
  12 |   await page.getByText("כלים", { exact: true }).click();
  13 |   await page.getByRole("button", { name: "רשימת השדות (Excel)" }).click();
> 14 |   expect((await download).suggestedFilename()).toMatch(/שדות\.xlsx$/);
     |                                                ^ Error: expect(received).toMatch(expected)
  15 |   await page.getByRole("button", { name: "שמות מזהים לשדות" }).click();
  16 |   await expect(page.getByText("לכל השדות כבר יש שמות מזהים.")).toBeVisible();
  17 | });
  18 | 
```