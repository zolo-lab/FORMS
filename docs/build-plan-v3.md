# תוכנית בנייה v3 – מערכת טפסים, סבבי חתימה ודשבורד (לביצוע על ידי Sonnet)

> **זה המסמך הפעיל.** הוא מחליף את שלבים 3–7 ב-`docs/build-plan.md` ואת סעיף 5 ב-`docs/spec-two-tools.md`. שני המסמכים הישנים נשארים כרקע (החלטות סגורות, מודל נתונים מורחב, השוואת שדות).
> **לפני כל עבודה:** `CLAUDE.md`, `docs/HANDOFF.md` (סביבה, איך מריצים CI בלי npm, איך מחילים מיגרציות).
> **איך לעבוד:** משימה אחת = ענף אחד = PR אחד. ממזגים רק כש-CI ירוק. אחרי כל שלב מעדכנים `HANDOFF.md`. נתקעים 3 פעמים על אותה שגיאה → עוצרים ומדווחים לישראל. לא מחליטים על מה שלא כתוב כאן – שואלים.
> **אבטחה:** לא בתוכנית הזאת (לפי ישראל). נשאר רק מה שהכרחי לתפקוד: token כ-hash, OTP, ולא לרשום ת"ז/בנק בלוגים.

---

## 0. מה כבר קיים (לא לבנות שוב)

| יכולת | איפה |
|---|---|
| מנוע טפסים: 29 סוגי שדות, תנאים (visibleIf/requiredIf, AND/OR, 12 אופרטורים), `filledBy`, prefill, ולידציה בעברית, טבלה חוזרת | `src/lib/forms/*` |
| מציג טפסים רספונסיבי: אשף/עמוד יחיד, progress, חתימה בציור, טבלה ככרטיסים בנייד, העלאת קובץ | `src/components/forms/*` |
| בונה טפסים: רשימה, שכפול, ארכוב, ייבוא/ייצוא JSON, עורך (פלטה, גרירה, הגדרות, עורך תנאים, תצוגה מקדימה, ביטול/שחזור, שמירה אוטומטית), פרסום וגרסאות נעולות | `src/app/admin/forms/*`, `src/components/builder/*`, `src/server/forms-store.ts` |
| PDF: העלאה, חותמות (טקסט/סימון/חתימה/תמונה, תאי טבלה, חלקי שדה מורכב, `whenValue`), עורך מיקום (לחיצה/גרירה, הזזה/גודל, חיצים, זום, שורות טבלה, חותמות יתומות), תצוגה מקדימה ממולאת בשרת, עברית מעורבת מאומתת | `src/lib/forms/pdf-mapping.ts`, `src/lib/pdf/*`, `src/components/pdf/*` |
| התחברות זמנית (סיסמה + cookie), DB בייצור ובפיתוח, CI עם vitest + Playwright, אחסון קבצים זמני ב-DB | `src/lib/auth`, `src/proxy.ts`, `src/server/storage.ts` |

---

## 1. החלטות סגורות (חדשות, מעבר ל-`build-plan.md` §1)

| נושא | החלטה |
|---|---|
| **מנוע אחד, שני עורכים** | אותו `FormDefinition` משמש טופס אינטרנטי וטופס PDF. שדה שמצוירים על PDF בלי מקור בטופס ("שדה PDF בלבד") נוצר אוטומטית ב-`pages[0]` עם `id: "pdf"` ו-`settings.pdfOnly: true`, ומוצג לממלא על גבי המסמך. |
| **סוג תבנית** | `form_templates.kind`: `web` / `pdf` / `both`. קובע איזה עורך נפתח ואיזה מצב מילוי מוצג. |
| **ערכה (package)** | תבנית ערכה = רשימת תבניות טפסים + הגדרת שלבים (workflow). בקשה = מופע של ערכה לעובד אחד. שדות עם אותו `id` במסמכים שונים ממולאים פעם אחת. |
| **שלבים** | `signing_steps` עם `order` ו-`parallelGroup`. אותו `order` = מקבילי. שלב נפתח כשכל השלבים ב-`order` הקודם הושלמו או דולגו. |
| **תפקידים** | `requester`, `employee`, `approver`, `payroll`, `hr` (קיימים). שדה שייך לשלב לפי `filledBy`. |
| **פעולות מאשר** | אישור / דחייה (סיבה חובה) / החזרה לשלב קודם (בחירת שלב + הערה) / העברה לאדם אחר. |
| **קישורים** | קישור אישי חד-פעמי לכל שלב: `/s/[token]`. token = 32 בתים אקראיים base64url; נשמר רק sha256. תוקף = `expiresAt` של הבקשה. |
| **OTP** | אופציונלי לכל שלב (`otpRequired`). 6 ספרות, 10 דקות, 5 ניסיונות. עד שלב 5 נשלח במייל; SMS בשלב 5. |
| **ערוצים** | מייל (Resend), SMS (ספק ישראלי, ממשק `SmsProvider`), WhatsApp כקישור `wa.me` בלבד, "העתק קישור". |
| **תזכורות** | ברירת מחדל: 24 שעות אחרי הפעלה, אחר כך כל 48 שעות, עד 3. אין שליחה 21:00–08:00 ובשבת (Asia/Jerusalem). ניתן לעריכה לכל ארגון. Vercel Cron כל 15 דקות. |
| **תפוגה** | `expiresAt` ברירת מחדל 30 יום מהשליחה. |
| **PDF סופי** | בסיום הבקשה: לכל מסמך `stampPdf` + השטחת AcroForm + עמוד אסמכתא (שלבים, שמות, זמנים, ערוצים, sha256). |
| **אחסון** | Vercel Blob (ברגע שישראל מחבר את ה-store). עד אז `stored_files`. כל גישה דרך `src/server/storage.ts`. |
| **מחושב** | מפרש ביטויים משלנו (לא `eval`): `+ - * /`, סוגריים, `sum() round() age() days() if()`, `{field}`, `{table.col}`. מחושב בלקוח ובשרת; ערך הלקוח מוחלף. |
| **שדות על PDF שלא היו** | `comb` (תא לתו), `date_signed`, `initials`, `stamp_image`, `dateFormat`, `valign`, `bold`, `role`, `group`, `tabIndex`, `repeatOnPages`. |
| **לא לבנות** | תשלומים, חידונים, CAPTCHA, KBA, נוטריון/עד, shuffle, autofill דפדפן, פגישות/מיקום/QR/ציור, עריכה inline בטבלת הגשות (תיקון רק דרך "החזרה"), text tags/זיהוי אוטומטי של שדות מקווים (רק ייבוא AcroForm), העתקת קוד מ-DocuSeal/Documenso/OpenSign (AGPL). |

---

## 2. מודל הנתונים הסופי (להוסיף ל-`src/db/schema.ts`)

כל טבלה חדשה: `id uuid`, `createdAt`, `updatedAt` (כמו הקיימות). `organizationId` בכל מה שקשור לבקשה.

```
enums:
  template_kind: web | pdf | both
  request_status: draft | in_progress | returned | completed | declined | cancelled | expired
  step_status: pending | active | in_progress | completed | declined | returned | skipped | expired | cancelled | delegated
  step_action: fill | sign | approve | fill_and_sign | view
  channel: email | sms | whatsapp | link
  notification_status: queued | sent | failed

organizations (+): slug, logoFileId, primaryColor, senderName, senderEmail, smsSenderId,
  dateFormat default 'dd/MM/yyyy', stampImageFileId, reminderPolicy jsonb
form_templates (+): kind template_kind default 'web', archivedAt
package_templates: organizationId?, name, description, workflow jsonb, archivedAt
  workflow = { steps: [{ order, role, action, otpRequired, assigneeFromFieldId?, skipIf?: Condition, dueHours? }] }
package_template_items: packageTemplateId, templateId, order, required
requests: organizationId, packageTemplateId, kind ('onboarding'|'termination'|'custom'),
  subjectName, subjectIdNumber, subjectEmail, subjectPhone, createdBy,
  status, currentOrder int, dueAt, expiresAt, completedAt, cancelledAt, cancelReason,
  externalRef, apiParams, redirectUrl
  index (organizationId, status), index (dueAt)
package_documents: requestId, templateVersionId, order, status ('pending'|'completed'),
  finalFileId, finalSha256, generatedAt
signing_steps: requestId, order, parallelGroup, role, action, assigneeUserId?, assigneeName,
  assigneeEmail, assigneePhone, assigneeFromFieldId?, skipIf jsonb?, status, channel,
  otpRequired, otpHash, otpExpiresAt, otpAttempts, delegatedFromStepId?, returnedToStepId?,
  declineReason, returnReason, activatedAt, firstViewedAt, completedAt, dueAt,
  signerIp, signerUserAgent
step_tokens: stepId, tokenHash unique, expiresAt, revokedAt, lastUsedAt
submissions: requestId, stepId, status ('draft'|'submitted'), answers jsonb, savedAt, submittedAt
  unique (stepId)
signatures: stepId, fieldId, kind ('drawn'|'typed'|'initials'|'stamp'), fileId, typedText, signedAt
events: requestId, stepId?, actorType ('user'|'signer'|'system'|'api'), actorId?, type text, payload jsonb
  index (requestId, createdAt)
notifications: organizationId, requestId?, stepId?, channel, to, templateKey, subject, body,
  status, providerId, error, scheduledAt, sentAt, attempts
reminder_schedules: stepId, nextRunAt, intervalHours, maxCount, sentCount, stoppedAt
  index (nextRunAt) where stoppedAt is null
message_templates: organizationId?, key, channel, subject, body
webhooks: organizationId, templateId?, url, secret, events text[], active
api_keys: organizationId, name, keyHash, lastUsedAt, revokedAt
bulk_jobs: organizationId, packageTemplateId, fileId, rowCount, createdCount, errors jsonb, status, createdBy
```

**הרחבות JSON (סכמות Zod קיימות):**
- `FormDefinition.settings.layout`: `wizard | single | card`; `settings.thankYou: { message?, redirectUrl?, rules?: [{ if: Condition, message?, redirectUrl? }] }`.
- `FormPage.nextPage?: [{ if: Condition, goTo: pageId }]`.
- `FormField`: `formula?`, `mask?`, `hint?`, `unique?`, `disabledIf?`, `colSpan? (1–12)`; סוגים חדשים `full_name`, `grid`, `section`.
- `PdfStamp.kind` + `comb | date_signed | initials | stamp_image`; שדות `comb?: {cells, gap?}`, `dateFormat?`, `valign?`, `bold?`, `color?`, `role?`, `group?`, `tabIndex?`, `repeatOnPages?: number[] | "all"`.
- `PdfMapping`: `acroImported?: Record<string, string>` (שם AcroForm → stampId), `flatten: boolean` (ברירת מחדל true).

---

## 3. מכונת מצבים (פונקציות טהורות ב-`src/lib/workflow/engine.ts`, כל מעבר כותב event)

**בקשה:** `draft → in_progress` (שליחה: יצירת steps, הפעלת order 1, שליחת הודעות) · `in_progress → returned` (החזרה; שלב היעד `active`, הביניים `pending`) · `returned → in_progress` (שלב היעד הושלם שוב) · `in_progress → completed` (כל השלבים completed/skipped → PDF-ים + אסמכתא + webhook + מייל סיכום) · `in_progress → declined` · כל לא-סופי `→ cancelled` (אדמין) · `→ expired` (Cron כש-`expiresAt` עבר). סופיים: completed, declined, cancelled, expired.

**שלב:** `pending → active` (כל הקודמים הושלמו; `skipIf` מתקיים → `skipped`) · `active → in_progress` (פתיחה ראשונה) · `in_progress → completed | declined | returned | delegated` (delegated: נוצר שלב חדש עם token חדש, הישן `cancelled`) · `active|in_progress → expired`. קבוצה מקבילית הושלמה כשכל חבריה completed.

---

## 4. שלבי הבנייה

לכל משימה: **קבצים** (איפה לגעת), **בוצע כאשר** (תנאי סיום שניתן לבדוק), **בדיקות** (חובה לפני PR). המספור הוא סדר הביצוע.

### שלב 3 – מודל נתונים, ארגונים, מנוע סבבים · ~שבוע

**3.1 סכמה ומיגרציה.** קבצים: `src/db/schema.ts`, `drizzle/`. כל הטבלאות וה-enums מסעיף 2. Seed (`scripts/seed.ts`): 4 הארגונים (מספרי עמותה מ-`claude/מיפוי-מערכת-קליטה-קיימת.md`), ערכה "קליטת עובד רגיל" עם 3 שלבים (requester → employee → payroll). **בוצע כאשר:** המיגרציה נוצרה ב-CI והוחלה על dev (לפי HANDOFF §3); `pnpm tsx scripts/seed.ts` רץ פעמיים בלי כפילויות. **בדיקות:** typecheck.

**3.2 מנוע סבבים.** קובץ: `src/lib/workflow/engine.ts` (טהור, בלי DB). פונקציות: `planSteps(workflow, answers) → steps[]` (כולל `assigneeFromFieldId` ו-`skipIf`), `activateNext(steps)`, `completeStep`, `declineStep`, `returnTo(steps, stepId)`, `delegate`, `expire`, `requestStatus(steps)`. כל פונקציה מחזירה `{ steps, events }`. **בוצע כאשר:** `tests/workflow.test.ts` מכסה: סדרתי 3 שלבים; מקבילי (2 עם אותו order); skipIf; החזרה משלב 3 לשלב 1; delegate; expire; דחייה; חישוב סטטוס בקשה בכל מצב. **בדיקות:** vitest.

**3.3 Tokens.** קובץ: `src/lib/auth/tokens.ts`. `createToken() → {token, hash}`, `hashToken`, `verifyToken(hash, token)`. **בוצע כאשר:** בדיקות: hash עקבי, token שגוי נדחה, אורך 43 תווים base64url.

**3.4 שכבת שירות.** קובץ: `src/server/requests-store.ts`. `createRequest(packageTemplateId, subject, requesterAnswers)`, `sendRequest(id)` (מפעיל `planSteps`, יוצר tokens, רושם events, מכניס notifications ל-outbox), `getRequest(id)` (עם steps, documents, events), `applyStepAction(stepId, action, payload)`. **בוצע כאשר:** `tests/requests-store.test.ts` רץ מול DB (vitest עם `DATABASE_URL` של dev כ-secret ב-GitHub; אם ישראל לא מגדיר secret – הבדיקה מדלגת ומדווחת). **בדיקות:** יצירה→שליחה→השלמת שלב 1→שלב 2 פעיל.

**3.5 מיזוג שדות בין מסמכי ערכה.** קובץ: `src/lib/forms/merge.ts`. `mergedDefinitionForStep(documents[], role) → FormDefinition` (שדות עם אותו `id` מופיעים פעם אחת; שדות של תפקידים אחרים read-only; עמודים לפי מסמך). **בוצע כאשר:** בדיקה: 3 מסמכים עם `idNumber` → שדה אחד; תשובה אחת מתפזרת לכל המסמכים ב-`splitAnswers`.

**3.6 ניהול ארגונים ומשתמשים (מינימלי).** קבצים: `src/app/admin/settings/organizations/*`. רשימה, עריכת שם/לוגו/צבע/שם שולח/מדיניות תזכורות. **בוצע כאשר:** שינוי צבע משתקף ב-CSS variables של מסך החתימה (3.7). לא בונים משתמשים – נשאר סיסמה אחת עד OAuth (שלב 6).

**3.7 מיתוג לכל ארגון.** קובץ: `src/components/branding.tsx`. `<OrgTheme org>` שמגדיר `--primary` ולוגו. **בוצע כאשר:** `/preview/sample?org=<slug>` מציג את הלוגו והצבע.

**תנאי סיום לשלב 3:** CI ירוק; מיגרציה על dev; seed; `requests-store` עובר מול DB.

### שלב 4 – מסך מילוי וחתימה · ~שבוע

**4.1 דף `/s/[token]`.** קבצים: `src/app/s/[token]/page.tsx`, `src/server/signing.ts`. אימות token → שלב פעיל → `mergedDefinitionForStep`. שדות של שלבים קודמים בכרטיס "פרטים שמולאו" (read-only). token לא תקין/פג → עמוד 410 בעברית. **בוצע כאשר:** Playwright: עובד רואה רק שדות `employee`, שדות requester נעולים. (ה-proxy לא חוסם `/s/*`.)

**4.2 שמירה אוטומטית.** `PUT /api/s/[token]/draft` → `submissions.answers` (status draft), event `step.saved` (לא יותר מאחד ל-5 דקות). **בוצע כאשר:** רענון משחזר ערכים (Playwright).

**4.3 הגשה.** `POST /api/s/[token]/submit`: `validateAnswers(role)` → 422 עם `errors` → אחרת `applyStepAction("complete")`, שמירת חתימות ב-`signatures` + קובץ PNG. **בוצע כאשר:** שדה חובה חסר מחזיר 422; הגשה תקינה מפעילה את השלב הבא (בדיקת DB).

**4.4 חתימה בהקלדה + ראשי תיבות.** קבצים: `src/components/forms/fields/signature.tsx`, `src/lib/pdf/typed-signature.ts`, גופן כתב-יד עברי OFL ב-`assets/fonts`. **בוצע כאשר:** PNG נוצר בשרת מהשם, ראשי תיבות = אות ראשונה של כל מילה; נראה ב-`ci-previews`.

**4.5 OTP.** `POST /api/s/[token]/otp/send`, `/otp/verify`. hash, 10 דקות, 5 ניסיונות, cookie לשלב אחרי אימות. שליחה דרך outbox (מייל עכשיו). **בוצע כאשר:** שלב עם `otpRequired` לא מציג שדות עד אימות (Playwright עם OTP שנקרא מה-DB בבדיקה).

**4.6 פעולות מאשר.** כפתורים: אשר / דחה (מודאל סיבה) / החזר (בחירת שלב + הערה) / העבר (שם, מייל, טלפון). **בוצע כאשר:** כל פעולה משנה סטטוסים לפי סעיף 3 ומופיעה ב-events.

**4.7 מצב "על גבי המסמך".** קבצים: `src/components/pdf/OnDocumentFill.tsx`. ה-PDF מרונדר (pdfjs) עם inputs ממוקמים לפי החותמות של התפקיד; כפתור "הבא" לשדה החובה הבא; מונה "נותרו N". ברירת מחדל: דסקטופ למסמך `pdf`; בנייד מצב טופס עם מתג. **בוצע כאשר:** Playwright דסקטופ: חתימה מלאה בלי לצאת מתצוגת ה-PDF.

**4.8 עמוד סיום.** `thankYou` (הודעה/redirect לפי rules), "השלב הבא: ממתין ל-…", הורדת עותק PDF כשהבקשה הושלמה. **בוצע כאשר:** Playwright.

**תנאי סיום לשלב 4:** Playwright מקצה לקצה: שליחת ערכה (דרך שירות) → עובד ממלא וחותם בנייד → מאשר מאשר בדסקטופ → payroll ממלא → בקשה completed.

### שלב 5 – יצירת בקשה, הודעות, PDF סופי · ~שבוע

**5.1 אשף בקשה חדשה `/requests/new`.** 4 צעדים: ערכה → פרטי עובד + שדות requester (ממוזגים) → מאשר + ערוץ → סיכום/שליחה/טיוטה. **בוצע כאשר:** Playwright: נוצרת בקשה עם steps וקישור לשלב 1 מוצג להעתקה.

**5.2 Outbox + Resend.** `src/server/notifications.ts`: `enqueue`, `deliver` (Resend; env `RESEND_API_KEY`, `MAIL_FROM`), retry עד 3. תבניות ב-`message_templates` עם משתנים `{{name}} {{link}} {{org}} {{dueDate}}`; ברירות מחדל ב-seed (הזמנה, תזכורת, הושלם, נדחה, הוחזר, OTP). **בוצע כאשר:** בדיקת יחידה על רינדור תבניות; כשל ספק → `attempts++` ו-`status failed` אחרי 3. **אין מיילים אמיתיים מ-dev** (כש-`RESEND_API_KEY` חסר → רק לוג).

**5.3 SMS.** `src/server/sms/provider.ts` (ממשק) + מימוש לספק שישראל יבחר (InforU או 019). **בוצע כאשר:** mock בבדיקות; שליחה אמיתית רק בייצור.

**5.4 "שתף בוואטסאפ" + "העתק קישור"** בעמוד הבקשה. **בוצע כאשר:** `wa.me/972…?text=` נפתח עם הודעה ממולאת.

**5.5 PDF סופי.** `src/server/finalize.ts`: לכל `package_document`: `stampPdf` (כולל date_signed) → מילוי והשטחת AcroForm → עמוד אסמכתא (`src/lib/pdf/certificate.ts`, `drawHebrew`) → sha256 → storage → `finalFileId`. **בוצע כאשר:** PNG ב-`ci-previews` של אסמכתא; sha256 תואם לקובץ.

**5.6 ייצוא Priority.** לפי מיפוי הגיליון "העלאת 101 לפריוריטי" (`exportKey` ו-`code` של אפשרויות). `GET /api/admin/export/priority?from&to`. **בוצע כאשר:** ישראל מאשר קובץ מול ייצוא אמיתי.

**תנאי סיום לשלב 5:** בקשה נשלחת במייל אמיתי בייצור (באישור ישראל), מסתיימת ב-PDF-ים חתומים + אסמכתא.

### שלב 6 – דשבורד, תזכורות, אינטגרציות · ~שבוע

**6.1 טבלת בקשות `/admin/requests`.** עמודות: עובד, ארגון, ערכה, סטטוס (צ'יפ), ממתין ל-(שם+תפקיד), ימים בשלב, התקדמות x/y, נוצר, יעד, תזכורת אחרונה. פילטרים ב-URL: ארגון, סטטוס, תפקיד ממתין, ערכה, טווח תאריכים, "באיחור". חיפוש שם/ת"ז/מייל. pagination בשרת. **בוצע כאשר:** seed של 2,000 בקשות נטען < 500ms לעמוד (נמדד ב-CI).

**6.2 KPI strip.** פעילות, ממתינות לתפקיד, באיחור, הושלמו ב-30 יום, חציון ימים להשלמה. **בוצע כאשר:** ערכים נבדקים מול seed ידוע.

**6.3 עמוד בקשה `/admin/requests/[id]`.** ציר שלבים אופקי, ציר זמן מ-`events` (טקסט עברי לכל type), מסמכים (תצוגה/הורדה), תשובות, פעולות: תזכורת עכשיו, שליחה מחדש, החלפת נמען, העברה, ביטול, הארכת תוקף, הורדת אסמכתא. **בוצע כאשר:** כל event type מוצג; Playwright על פעולה אחת.

**6.4 Bulk + ייצוא.** בחירה מרובה: תזכורת, ביטול, ייצוא CSV/XLSX (עמודה לכל `exportKey`), ZIP של PDF-ים. **בוצע כאשר:** 500 שורות מיוצאות; ZIP נוצר.

**6.5 Kanban + "ממתינים לי".** תצוגת עמודות לפי תפקיד; דף `/admin/inbox` לשלבים פעילים של המשתמש המחובר (כשיש OAuth; עד אז לפי תפקיד). **בוצע כאשר:** מעבר טבלה/קנבן שומר פילטרים.

**6.6 Cron תזכורות/תפוגה.** `src/app/api/cron/reminders/route.ts` (Vercel Cron `*/15 * * * *`, header `CRON_SECRET`). לפי `reminder_schedules`; שעות שקטות; `expiresAt` → expired. **בוצע כאשר:** בדיקה עם שעון מדומה: 3 תזכורות בדיוק, שום דבר בשבת.

**6.7 Webhooks.** HMAC-SHA256 על גוף, retry 3, events: `request.completed`, `step.completed`, `request.declined`. קישורי PDF זמניים (24 שעות). **בוצע כאשר:** בדיקה מול `webhook.site`/mock; Make מקבל `request.completed` ומעתיק ל-Drive (ישראל בונה את התרחיש).

**6.8 API בסגנון iForms.** `src/app/api/v1/*` עם `api_keys`: `GET templates`, `GET requests?from&to&status`, `GET requests/:id`, `POST requests` (`packageTemplateId`, `subject`, `answers`, `readOnlyFields`, `expiresAt`, `redirectUrl`, `apiParams`), `DELETE requests/:id`. **בוצע כאשר:** בדיקות אינטגרציה + `docs/api.md`.

**6.9 שליחה המונית מ-XLSX.** העלאה → מיפוי עמודות לשדות → תצוגת שגיאות (ת"ז/טלפון) → יצירת בקשות → דוח. **בוצע כאשר:** 200 שורות, 3 שגויות → 197 בקשות ודוח.

**6.10 Google OAuth + `users`/`memberships`.** Auth.js, `org_office` רואה רק את הארגון שלו, מחליף את סיסמת האדמין. **בוצע כאשר:** Playwright עם mock provider; משתמש ארגון א' לא רואה בקשות של ב'.

**תנאי סיום לשלב 6:** ישראל מנהל שבוע של בקשות אמיתיות מהדשבורד בלי Sheets.

### שלב 7 – מעצב PDF מלא · ~שבוע

**7.1 חותמות חדשות ב-`stampPdf`.** `comb` (תו במרכז כל תא; כיוון לפי `resolveDirection`), `date_signed` (מ-`completedAt` של השלב, `dateFormat`), `initials`, `stamp_image`, `valign`, `bold`, `color`, `repeatOnPages`. **בוצע כאשר:** `tests/pdf.test.ts` + PNG ב-`ci-previews`: ת"ז 9 ספרות ב-9 תאים, תאריך בתאים.

**7.2 שדות PDF-בלבד.** ציור חותמת מהפלטה (טקסט, תאים, תאריך חתימה, חתימה, ראשי תיבות, חותמת, תיבה, רדיו, רשימה, ת"ז, טלפון) יוצר שדה ב-`pages[0]`(`pdfOnly`) + חותמת עם `role`. פלטת חותמות בטאב PDF; כפתור "טופס מ-PDF" ברשימה (`kind: pdf`). **בוצע כאשר:** Playwright: PDF ריק → 5 שדות על המסמך → פרסום → מילוי במצב "על גבי המסמך" (4.7) → PDF ממולא.

**7.3 ייבוא AcroForm.** `src/lib/pdf/acroform.ts`: `importAcroForm(bytes) → {fields, stamps, acroImported}` (text/checkbox/radio/dropdown/signature; `MaxLen`+comb → `comb`). ב-`stampPdf`: כשיש `acroImported` ממלאים את שדה ה-AcroForm ומשטחים. **בוצע כאשר:** בדיקה על fixture עם AcroForm (ליצור ב-pdf-lib בבדיקה) ועל PDF סרוק (0 שדות, בלי שגיאה).

**7.4 עורך: תמונות עמודים, ציור בגרירה, בחירה מרובה, העתק/הדבק, שכפול, "לכל העמודים".** **בוצע כאשר:** Playwright: ראשי תיבות על כל 3 עמודים בלחיצה אחת; Ctrl+C/V.

**7.5 יישור, פיזור, snap 2pt, קווי עזר, Ctrl+Z/Y בעורך PDF.** **בוצע כאשר:** 5 חותמות מיושרות לימין בפעולה אחת.

**7.6 צבע לכל תפקיד + "צפה כ-תפקיד" + פאנל: `dateFormat`, `valign`, `tabIndex`, `comb.cells`.** **בוצע כאשר:** מקרא מוצג; Tab במסך החתימה עוקב אחרי `tabIndex`.

**תנאי סיום לשלב 7:** ישראל מעלה את טופס 101 הרשמי, מייבא שדות, משלים, ורואה PDF ממולא נכון כולל ת"ז בתאים.

### שלב 8 – לוגיקה ו-UX מתקדמים בבונה · ~שבוע

**8.1 נוסחאות.** `src/lib/forms/formula.ts` (lexer + parser רקורסיבי + evaluator), `field.formula`, חישוב חי ב-Renderer, חישוב מחדש ב-`validateAnswers`. עורך נוסחה עם בחירת שדות. **בוצע כאשר:** בדיקות: עדיפויות, חלוקה באפס → ריק, `sum({children.amount})`, `age({birthDate})`, `if()`; שרת ולקוח זהים.

**8.2 דילוג לעמוד + `disabledIf`.** `page.nextPage`; ב-`wizard.ts` `nextPageIndex` מכבד אותו; עמודים שדולגו לא מאומתים. **בוצע כאשר:** בדיקות wizard; Playwright.

**8.3 מסכות קלט + `hint` + `unique`.** `mask` ("999-9999999", "a"=אות, "*"=כל); ערך נשמר ללא תווי מסכה; `unique` נבדק בשרת מול הגשות של אותה תבנית. **בוצע כאשר:** בדיקות.

**8.4 סוגים חדשים: `full_name`, `grid` (תאים: text/number/dropdown/date), `section` (מתקפל).** הוספה ב-`field-types`, `validate`, Renderer, Builder, PDF parts. **בוצע כאשר:** 32 סוגים ב-`tests/forms.test.ts`; `grid` מוצג כטבלה בדסקטופ וככרטיסים בנייד.

**8.5 Card layout + review-before-submit.** `layout: card`: שאלה אחת למסך, Enter/החלקה; עמוד סיכום לפני חתימה. **בוצע כאשר:** Playwright נייד.

**8.6 `colSpan`, `info_text` ב-Markdown מוגבל (מודגש, קישור, רשימה), answer piping `{{field}}` בתוויות.** **בוצע כאשר:** בדיקת רינדור; XSS לא עובר (Markdown מסונן).

**8.7 i18n תוויות (`definition.i18n[locale]`) + מתג שפה במסך החתימה** (ערבית, רוסית, אמהרית – RTL/LTR לפי שפה). **בוצע כאשר:** החלפה לערבית מציגה תוויות מתורגמות.

**8.8 ערכת סיום העסקה** כ-package template (ללא קוד ייעודי) + הודעה למנהל אחרי "נחתם". **בוצע כאשר:** רצה על אותו מנוע מקצה לקצה.

### שלב 9 – מעבר (cutover) · ~שבוע
כמו `build-plan.md` שלב 7: ייבוא פתוחים מ-Sheets (dry-run), הרצה מקבילה בארגון אחד, כיבוי Make/Apps Script רק באישור ישראל.

---

## 5. פרוטוקול למודל המבצע

1. קרא `CLAUDE.md`, `docs/HANDOFF.md`, ואת המשימה הבאה כאן. אל תקרא את כל המסמך בכל פעם.
2. ענף `phase-<n>-<m>-<slug>`. TDD: קודם הבדיקה, אחר כך הקוד.
3. `git push` → PR (REST: `gh api repos/$R/pulls`) → `gh run watch` → קריאת annotations → תיקון → מיזוג (REST) רק כשירוק.
4. מיגרציה חדשה: לפי HANDOFF §3 (dev בלבד; ייצור רק באישור ישראל).
5. UI: עברית, RTL, logical utilities, tokens. בנייד: שדות ≥44px, `inputmode` מתאים, חתימה במסך מלא.
6. בסוף משימה: שורה אחת לישראל – מה נבנה, מה לא נבדק, מה צריך ממנו. בסוף שלב: עדכון `HANDOFF.md` §"מה קיים" ו-§"הצעד הבא".
7. אם משהו כאן סותר את הקוד הקיים – הקוד הקיים + `CLAUDE.md` קובעים; לדווח על הסתירה.
