# HANDOFF — state of the project and how to work in it

_Last updated: 2026-10-13 (end of phase 4, by Claude Sonnet)._

## 1. Where things are

| What | Where |
|---|---|
| Code | GitHub `zolo0548152101-afk/FORMS` (public), branch `main` |
| Hosting | Vercel team `team_31mPt8JZMiCp6NV6462Jix5Y`, project `gybs-forms` (`prj_B2JeTYwLWRYxu6DyhqwdOMvwb0JS`), Git-linked: every push deploys (previews are behind Vercel SSO) |
| Database | Neon project `gybs-forms` (`damp-wildflower-79510538`, eu-central-1, PG 17, db `forms`). Branches: `main` (`br-muddy-frost-b9l3kp1r`) = production, `dev` (`br-wild-violet-b9p5v309`) = preview/dev |
| Vercel settings | install: `pnpm install --no-frozen-lockfile`; env `ENABLE_EXPERIMENTAL_COREPACK=1` (pnpm 10 from `packageManager`); Node 22; branch `ci-previews` is skipped via ignored-build-step. Build logs: Vercel MCP `list_deployment_events` |
| Env vars | Vercel: `DATABASE_URL` (production → Neon main, preview+development → Neon dev). Nothing in GitHub secrets |
| Plan | `docs/build-plan.md` (also in the claude.ai project as `claude/תוכנית-בנייה.md`) |
| Legacy system map | claude.ai project doc `claude/מיפוי-מערכת-קליטה-קיימת.md` |

## 2. Environment quirks (important)

The Claude cloud workspace **cannot reach npm, unpkg, jsdelivr, raw.githubusercontent, Actions logs/artifacts or `*.vercel.run`**. It can reach GitHub via `git` and `gh api`. Therefore:

- **Installing packages:** don't run `pnpm install` locally — it will fail. Add the dependency to `package.json` with an **exact version**. To find the latest version use the Vercel sandbox (Vercel MCP `create_sandboxes_v4` with `projectId: prj_B2JeTYwLWRYxu6DyhqwdOMvwb0JS`, then `run_session_command` → `npm view <pkg> version`). The sandbox has full internet but **cannot push to GitHub**, and command output is truncated at ~2.5k chars.
- **No lockfile yet.** CI and Vercel run `pnpm install --no-frozen-lockfile`. Versions are pinned in package.json.
- **Running tests:** push a branch / PR. Workflow `ci` runs typecheck → lint → vitest → Hebrew PDF sample.
  Read results without logs:
  ```bash
  R=zolo0548152101-afk/FORMS
  gh run list -R $R --limit 3
  gh run watch <run-id> -R $R --interval 15 >/dev/null
  gh api repos/$R/actions/runs/<run-id>/jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
  JOB=$(gh api repos/$R/actions/runs/<run-id>/jobs --jq '.jobs[0].id')
  gh api "repos/$R/check-runs/$JOB/annotations" --jq '.[] | "\(.path):\(.start_line) \(.message)"'
  ```
  Vitest failures appear as annotations with file:line and the assertion diff.
- **Seeing PDF output:** on every push to `main`, job `previews` renders `artifacts/hebrew-sample.pdf` to PNG and force-pushes them to branch `ci-previews`:
  `git fetch origin +refs/heads/ci-previews:refs/remotes/origin/ci-previews && git show origin/ci-previews:hebrew-sample-1.png > /tmp/p1.png` then view the PNG.
  Extend `scripts/pdf-sample.ts` (or add scripts) when you need to eyeball other PDFs.

## 3. Database

- Schema: `src/db/schema.ts` (Drizzle). Client: `src/db/index.ts` (`neon-http`).
- On push to `main` that changes the schema, workflow `db-generate` runs `drizzle-kit generate` (offline) and commits SQL into `drizzle/`.
- **Applying** migrations is manual through the Neon MCP:
  1. `git pull`, read the new `drizzle/NNNN_*.sql`.
  2. Apply to **dev** with `run_sql_transaction` (project `damp-wildflower-79510538`, branch `br-wild-violet-b9p5v309`, database `forms`). Statements are separated by `--> statement-breakpoint`.
  3. Record it: `create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now()); insert into schema_migrations(name) values ('NNNN_name');`
  4. **Production (`br-muddy-frost-b9l3kp1r`) only after the user explicitly approves**, same steps.
- Migration `0000_nifty_piledriver` (organizations, users, pdf_files, form_templates, form_template_versions) **is applied to dev** (recorded in `schema_migrations`). Not applied to production yet.

## 4. What exists (phase 1)

- Next.js 16.4 App Router, React 19.3, Tailwind v4 (turbopack plugin), Heebo, RTL root layout, tokens in `globals.css` (light + dark). `components.json` has `rtl: true` for shadcn — but `shadcn add` needs the registry (no access locally): copy component source from `github.com/shadcn-ui/ui` (`git clone --depth 1`) or write components by hand.
- `src/lib/pdf/bidi.ts` + `hebrew.ts`: bidi pipeline and `drawHebrew()` — **verified visually on 31 mixed cases** (addresses with numbers, IDs, dates, ₪, emails, parentheses, geresh/gershayim, wrapping). Font: Heebo static 400/700 in `assets/fonts` (OFL).
- `src/lib/forms/`:
  - `field-types.ts` — 29 field types: all Google Forms types (short/long text, radio, checkboxes, dropdown, file upload, linear scale, rating, radio grid, checkbox grid, date, time) + number, currency, percent, email, yes/no, Israeli phone, ת"ז, bank account, address, signature, consent, repeating table, hidden, and layout blocks (heading, info text, image, divider).
  - `schema.ts` — `FormDefinition` (pages → fields; conditions `visibleIf`/`requiredIf`; `filledBy` role for chains; `prefill`; `optionsSource` for banks/cities/cost centers; `exportKey` for Priority).
  - `conditions.ts`, `validate.ts` (Hebrew messages, role-scoped, drops hidden values), `format.ts` (display strings), `pdf-mapping.ts` (stamp boxes on uploaded PDFs, `stampPdf()`).
- Tests: `tests/*.test.ts` (bidi cases, Israeli validators, form engine, PDF stamping). All green.

## 5. Phase 2 (done, merged)

- **Login (temporary):** `/login` → HMAC cookie (`src/lib/auth/session.ts`), guard in `src/proxy.ts` (Next 16 name for middleware) for `/admin`, `/preview`, `/api/admin`. Vercel env `ADMIN_PASSWORD` + `SESSION_SECRET` set for production+preview (user will change the password).
- **UI kit:** `src/components/ui/*` — hand-written, no Radix (native `<dialog>`, `<select>`, checkbox/radio). No new UI deps.
- **Renderer:** `src/components/forms/FormRenderer.tsx` + `fields/*` (all 29 types, wizard, conditions, role read-only, repeating table as cards, signature_pad dialog, file upload via `onUpload` prop). Pure helpers in `src/lib/forms/wizard.ts`. Static banks list in `lookups.ts` (phase 3 replaces with tables).
- **Builder:** `/admin/forms` (list/create/duplicate/archive/import) and `/admin/forms/[id]` (`src/components/builder/*`: palette, canvas with drag & drop, field settings, visual condition editor, live preview, JSON import/export, undo/redo, autosave, publish). Pure operations in `src/lib/forms/builder.ts`; condition UI model in `condition-ui.ts`. Persistence: `src/server/forms-store.ts` (published versions immutable; editing creates version N+1 as draft).
- **PDF:** upload route `/api/admin/pdf` (≤4MB, sha256 dedupe), file serving `/api/admin/files/[id]`, placement UI `src/components/pdf/*` with `pdfjs-dist`, items logic `src/lib/forms/pdf-items.ts`, coordinates `src/lib/pdf/coords.ts`, server preview `/api/admin/pdf-preview` (stampPdf with sample answers).
- **File storage:** interim `stored_files` table (base64) behind `src/server/storage.ts`. Vercel Blob store `gybs-forms-files` (`store_nIynlk5Qa0UuVZNQ`) exists but is **not connected** to the project (no token). To switch: connect it in Vercel → Storage, `pnpm add @vercel/blob` is already in package.json (2.8.1), reimplement `putFile/getFile`.
- **Tests:** vitest (session, wizard, builder, condition-ui, coords, pdf-items + phase 1). Playwright e2e in `tests/e2e` (mobile fill of sample form; PDF placement demo at `/preview/pdf-placement`). CI job `e2e` builds the app with test-only env.
- **CI tips:** lint findings are printed as annotations by `scripts/eslint-annotations.mjs`. `gh pr create` and merging need REST (`gh api repos/$R/pulls ...`); GraphQL is blocked.
- **Migrations:** `0000` and `0001` applied to Neon **dev and production** (production applied 2026-10-13 by pasting the SQL in the Neon console, with the user's approval; recorded in `schema_migrations`). Production also contains a stray sample table `playing_with_neon` (created by the Neon console's default query) — harmless, can be dropped.

### Smoke test on production (2026-10-13) — passed
Create form → autosave → publish v1 → edit creates draft v2 while v1 stays unchanged (checked in the DB) → PDF upload (`/api/admin/pdf`) → server preview with Hebrew font (`/api/admin/pdf-preview`) all worked on `gybs-forms.vercel.app`. Not yet exercised by a human: drag-and-drop placement on a real government PDF (e2e covers it on a generated PDF) and the file_upload field with a real backend (no filler page exists yet; arrives with phase 4/5).

## 6. Phase 3 (done, merged) — packages, requests, workflow engine

- **Schema** (`src/db/schema.ts`, migration `0002_sloppy_madame_web`): package_templates/items, requests, package_documents, signing_steps, step_tokens, submissions, signatures, events, notifications (outbox), reminder_schedules, message_templates, webhooks, api_keys, bulk_jobs; org branding columns; `form_templates.kind/archived_at`. **Applied to dev and production** (production on 2026-10-13, pasted by Israel in the Neon console because the auto-mode classifier blocks production DB changes from Claude; verified afterwards: 15 new tables, new columns, recorded in `schema_migrations`). Production has no seed data yet (organizations, package).
- **Seed:** `pnpm seed` (`scripts/seed.ts`, idempotent): 4 organizations + package "קליטת עובד רגיל" (requester → employee → payroll). Applied to dev by equivalent SQL. Note: ארצנו shares שיבת ציון's registration number, so it is not a separate organization row (the plan says 4; CLAUDE.md says 5 nonprofits — decide if ארצנו needs its own row, which requires dropping the unique constraint on `registration_number`).
- **Engine:** `src/lib/workflow/engine.ts` (pure; `tests/workflow.test.ts`). `types.ts` holds statuses/roles/ReminderPolicy.
- **Tokens:** `src/lib/auth/tokens.ts` (43-char base64url, sha256 stored).
- **Service:** `src/server/requests-store.ts` — `createRequest`, `sendRequest` (requester steps complete immediately with `apiParams.requesterAnswers`), `getRequest`, `applyStepAction` (open/submit/decline/return/delegate), `cancelRequest`, `expireOverdue`. Tokens + outbox rows are created when a step is activated; links are `${APP_URL ?? https://gybs-forms.vercel.app}/s/<token>`; old links are revoked when the step closes. Writes are sequential (neon-http has no transactions) — a crash mid-operation can leave a half-written state; revisit with `db.batch` if it matters.
- **Merge:** `src/lib/forms/merge.ts` (`mergedDefinitionForStep`, `splitAnswers`).
- **Orgs/branding:** `/admin/settings/organizations` (name, color, logo ≤1MB, sender, reminder policy), `OrgTheme` in `src/components/branding.tsx`, public logo `/api/org-logo/[slug]`, `/preview/sample?org=<slug>`.
- **Not verified:** `tests/requests-store.test.ts` needs `DATABASE_URL` (dev) as a GitHub secret; without it, it skips in CI. Not run yet. The orgs page and branding were not seen in a browser (production lacks the migration; previews are behind Vercel SSO).

## 7. Phase 4 (done, merged) — signing screen `/s/[token]`

- **Page + API** (public, not behind the admin proxy): `src/app/s/[token]/*`, `src/app/api/s/[token]/{draft,submit,action,otp/send,otp/verify,pdf/[fileId]}`. Service: `src/server/signing.ts` (`loadByToken`, `saveDraft`, `submit`, `sendOtp`, `verifyOtp`, `performAction`, `getPdfForToken`). Pure helpers: `src/lib/workflow/signing.ts` (`tokenState`, `shouldLogSave`), `src/lib/forms/role-view.ts`, `src/lib/auth/otp.ts`, `src/lib/pdf/on-document.ts`, `src/lib/pdf/typed-signature.ts`.
- The signer sees only fields of their role as a form; other roles' answers appear in a read-only "פרטים שמולאו" card. Answers outside the signer's fields are ignored server-side.
- Autosave (1.5 s debounce, `step_saved` event at most every 5 min), submit validates with `validateAnswers(role)` → 422 `{errors}`; signature PNGs are stored as files + `signatures` rows (`drawn`/`typed`).
- Typed signature / initials: canvas PNG with Gveret Levin (OFL, `src/app/fonts`).
- OTP (per step `otpRequired`): code mailed through the outbox, hash only, 10 min, 5 attempts, 60 s resend cooldown, httpOnly cookie per step (HMAC with `SESSION_SECRET`). Enforced on draft/submit/action.
- Approver actions: decline (reason), return to an earlier completed step (reason), delegate (new person/new link).
- On-document mode (`src/components/pdf/OnDocumentFill.tsx`): offered only for a single-PDF package where **every** answerable field of the role has a simple stamp (no table cells); desktop default, toggle on mobile; "נותרו N" counter + "הבא".
- Completion card: thank-you text (`settings.thankYou` string), who the request waits for, "completed" notice.
- **Verified on the dev DB** (preview deployment + test rows, since deleted): the page renders the role view, the summary card, org branding and moves the step `active → in_progress` with a `step_opened` event.
- **Not verified:** submit/draft/OTP/actions end to end (no Playwright run against a DB: CI has no `DATABASE_URL`), on-document mode in a browser, the typed-signature PNG in a browser, the full chain "request → employee (mobile) → approver (desktop) → payroll → completed".
- **Deviations from the plan:** invalid/expired links render a Hebrew page with HTTP 200 (API returns 410); the PDF copy download on the completion page waits for the final PDF (phase 5); the `thankYou` rules/redirect object arrives with phase 8.
- **Secrets:** Claude could not create the GitHub Actions secret `DATABASE_URL` (blocked by the auto-mode classifier). Until Israel adds it (dev branch connection string), `tests/requests-store.test.ts` skips in CI.

## 8. Phase 5 (in progress) — request wizard, outbox, share links

Done and merged: **storage on Blob**, **5.1 wizard**, **5.2 outbox/templates**, **5.3 SMS interface**, **5.4 share**, **5.5 final PDF + reference page**.
- `src/server/storage.ts`: private Blob object `files/<id>` when `BLOB_READ_WRITE_TOKEN` is set; metadata stays in `stored_files` (`data_base64 = ""` for Blob rows; older rows keep inline data). Blob store `gybs-forms-files` is connected to the project in all environments. **Not yet verified at runtime** (no token locally): upload a logo / PDF on a preview deployment and open it.
- CI: the `DATABASE_URL` repo secret (dev branch) is passed to unit tests and e2e, so `tests/requests-store.test.ts` and `tests/e2e/request-wizard.spec.ts` run against dev. Vitest timeout is 60 s because of neon-http round trips.
- 5.2: `src/lib/notifications/templates.ts` (pure render, defaults, retry rule), `src/server/notifications.ts` (`enqueue`, `deliverQueued` over Resend `fetch`; without `RESEND_API_KEY` it only logs and leaves rows queued). **Nothing calls `deliverQueued` yet** (no cron/trigger) and `message_templates` DB overrides are not read yet; defaults only. Needs `RESEND_API_KEY` and a verified sender before real mail.
- 5.1/5.4: `/admin/requests` (list), `/admin/requests/new` (4 steps: package+org, employee details, requester fields, summary/send), `/admin/requests/[id]`. Plain tokens are never stored, so the page offers "create fresh links" (revokes the old link, including an emailed one). Right after sending, the wizard shows the links that were just emailed. WhatsApp: `src/lib/whatsapp.ts`.
- Deviation: the plan's step 3 "approver + channel" is a read-only summary of the workflow (assignees are fixed in the package); there is no channel choice yet. Path is under `/admin/requests` (auth), not `/requests/new`.
- The seeded package "קליטת עובד רגיל" has no forms attached, so the requester step has no fields on dev.

- 5.3: `src/server/sms/provider.ts` (interface, `getSmsProvider`, console provider that only logs). A step with a phone but no email gets an `sms` outbox row. Real provider (InforU / 019) is a new case in `getSmsProvider`, waiting for Israel's choice.
- 5.5: `src/server/finalize.ts` (`finalizeRequest`: stamped template, or `src/lib/pdf/summary.ts` answers summary when the form has no PDF; then `src/lib/pdf/certificate.ts` reference page with sha256), runs after the last step completes (failure is logged, not fatal) and from the request page button. Admin download: `/api/admin/requests/[id]/documents/[docId]`. Reference page PNG is rendered in `ci-previews` (`certificate-sample-1.png`, reviewed). `date_signed` stamps and AcroForm flattening need 7.1/7.3. The signer's completion page still has no download (decision needed: public link vs admin only).

## 9. Next step

Remaining in phase 5: **5.6 Priority export** (needs a real export sample from Israel) and the phase-5 exit test (a real email in production, with Israel's approval; needs `RESEND_API_KEY`, a verified sender, and something that calls `deliverQueued`). Then **phase 6** (dashboard, reminders, integrations). Known gaps for review feedback: the builder has no per-field styling/feedback text and no "view the published form" link; the PDF designer (phase 7) is where drawing fields on a PDF arrives.
