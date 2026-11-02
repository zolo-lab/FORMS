# Bugbot review rules – gybs-forms

Hebrew HR forms and e-signature system for Israeli nonprofits (replaces iForms).
Stack: Next.js 16 App Router, React 19, Tailwind v4, Drizzle on Neon Postgres, Vitest, Playwright.
Real employee data (ID numbers, bank accounts, salaries) flows through this code.

**You review only.** Do not push commits or open fix branches; the author's agent (Claude Code) fixes what you find.

## Write your findings in Hebrew
The owner reads Hebrew. Write every comment in Hebrew. Code, file names and identifiers stay as they are.

## Hard rules – flag every violation
- UI is Hebrew with `dir="rtl"`. Only logical Tailwind utilities: `ms- me- ps- pe- start- end- text-start text-end`.
  Never `ml- mr- pl- pr- left- right- text-left text-right`.
- Only semantic color tokens (`bg-primary`, `text-muted-foreground`…). No raw hex or named colors in components.
- Every Hebrew/mixed user text drawn on a PDF goes through `drawHebrew()` (`src/lib/pdf/hebrew.ts`), never `page.drawText()` directly.
- Forms are data (`FormDefinition`, `src/lib/forms/schema.ts`). No form hardcoded in a component.
  A new field type touches `field-types.ts` + `validate.ts` (exhaustive switch) + renderer + builder settings + tests.
- Answers are validated on the server with `validateAnswers()` and `result.cleaned` is what gets stored, never raw input.
- No secrets in the repo (it is public). No ID numbers or bank details in logs.
- Logic changes come with Vitest tests in `tests/`.

## Look hard at
- **Access control:** a signing token (`/s/[token]`) must only see its own step's fields; `internal` fields are requester-only;
  track-only users never see content; OTP-protected steps must not leak through other routes (PDF, files, drafts).
- **Data loss:** hidden fields dropping values a later step needs; autosave/draft races; rows or answers silently discarded.
- **Published forms:** a change must not alter how an already published form version behaves unless that is the intent.
- **Mobile:** the responsive fill is the main path on phones; check touch targets and layouts at narrow width.
- **Migrations:** schema changes must work with auto-migrate on deploy (`scripts/migrate.ts`); no hand-run production SQL.

## Format
One comment per real problem: severity (קריטי / גבוה / בינוני / נמוך), what breaks, a concrete failure scenario, a short fix.
Do not invent findings to fill space. Style nits only when they break a hard rule above.
