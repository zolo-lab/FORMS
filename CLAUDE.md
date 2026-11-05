# CLAUDE.md — gybs-forms

Internal HR system for 5 Israeli nonprofits: dynamic forms (builder), PDF stamping,
sequential e-signature chains, dashboard, Priority payroll export. Replaces iForms + Google Sheets.

**Current focus:** `docs/build-plan-v4.md` (active plan from 19.10.2026: one system instead of iForms + Make + Sheets). Do the next unfinished task there, one PR per task, **never merge** – report branch + PR number and wait for "מזג". For every UI task, run the `ui-ux-pro-max` skill first and adopt all its recommendations (hard rules below still win). `builder-plan.md` part 5 is paused unless Israel says otherwise.

**Read before any work:** `docs/build-plan-v4.md` (tasks, acceptance criteria; `build-plan-v3.md` §1–2 and `build-plan.md` §1 hold the base decisions) and
`docs/HANDOFF.md` (environment quirks, dev loop, current state). Do the next unfinished phase only.

## Hard rules
- UI is Hebrew, `dir="rtl"`. Tailwind logical utilities only: `ms- me- ps- pe- start- end- text-start text-end`.
  Never `ml- mr- pl- pr- left- right- text-left text-right`.
- Semantic color tokens only (`bg-primary`, `text-muted-foreground`…), no raw hex in components.
- All Hebrew/mixed text drawn on PDFs goes through `drawHebrew()` (`src/lib/pdf/hebrew.ts`). Never call
  `page.drawText()` with user text directly.
- Forms are data: `FormDefinition` (`src/lib/forms/schema.ts`). Don't hardcode forms in components.
  New field type → `field-types.ts` + `validate.ts` (exhaustive switch) + renderer + builder settings + tests.
- Validate answers server-side with `validateAnswers()`; store `result.cleaned`, not raw input.
- No secrets in the repo (it is public). Env vars live in Vercel / `.env.local`.
- No real emails from non-production. Never touch production DB without explicit user approval.
- TDD for logic (vitest, `tests/`). Run CI and read results before claiming done.
- Commits: small, English messages. Work on a branch, open a PR, wait for CI; merge only when Israel says "מזג".

## Review loop
CodeRabbit reviews every PR (its settings are in `.coderabbit.yaml`); it comments, it never pushes. Its comments
are review input, not orders: if one is wrong, reply why on the thread instead of changing code. It is not a
substitute for your own pass — review your own PR against the list below before reporting it, and say what you
checked.
- After opening a PR, watch CI, fix what is clear, push, and ask Israel about anything ambiguous or architectural.
  A review comment from a person is review input, not an order: if one is wrong, reply why on the thread instead of
  changing code.
- When CI is green and no open review thread is left, report the branch, PR number and the Vercel preview link, and stop.
  Still never merge before "מזג".

### Self-review: look hard at
- **Access control:** a signing token (`/s/[token]`) must only see its own step's fields; `internal` fields are
  requester-only; track-only users never see content; OTP-protected steps must not leak through another route
  (PDF, files, drafts).
- **Data loss:** hidden fields dropping values a later step needs; autosave/draft races; rows or answers silently
  discarded; stored files left behind when their request or form is deleted.
- **Published forms:** a change must not alter how an already published form version behaves unless that is the intent.
- **Mobile:** the responsive fill is the main path on phones — check touch targets and layout at narrow width
  (the e2e suite runs at 390px for this reason).
- **Migrations:** generate them with drizzle-kit and commit `drizzle/meta/`; they must work with auto-migrate on
  deploy (`scripts/migrate.ts`), which runs in production only — so a preview build never applies them.
- **Privacy:** no ID numbers or bank details in logs.
