# CLAUDE.md — gybs-forms

Internal HR system for 5 Israeli nonprofits: dynamic forms (builder), PDF stamping,
sequential e-signature chains, dashboard, Priority payroll export. Replaces iForms + Google Sheets.

**Read before any work:** `docs/build-plan.md` (phases, decisions, acceptance criteria) and
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
- Commits: small, English messages. Work on a branch, open a PR, merge when CI is green.
