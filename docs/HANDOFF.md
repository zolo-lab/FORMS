# HANDOFF — state of the project and how to work in it

_Last updated: 2026-10-13 (end of phase 1, by Claude Opus)._

## 1. Where things are

| What | Where |
|---|---|
| Code | GitHub `zolo0548152101-afk/FORMS` (public), branch `main` |
| Hosting | Vercel team `team_31mPt8JZMiCp6NV6462Jix5Y`, project `gybs-forms` (`prj_B2JeTYwLWRYxu6DyhqwdOMvwb0JS`), Git-linked: every push deploys (previews are behind Vercel SSO) |
| Database | Neon project `gybs-forms` (`damp-wildflower-79510538`, eu-central-1, PG 17, db `forms`). Branches: `main` (`br-muddy-frost-b9l3kp1r`) = production, `dev` (`br-wild-violet-b9p5v309`) = preview/dev |
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
- Phase 1 schema (organizations, users, pdf_files, form_templates, form_template_versions) is generated but **not yet applied** anywhere.

## 4. What exists (phase 1)

- Next.js 16.4 App Router, React 19.3, Tailwind v4 (turbopack plugin), Heebo, RTL root layout, tokens in `globals.css` (light + dark). `components.json` has `rtl: true` for shadcn — but `shadcn add` needs the registry (no access locally): copy component source from `github.com/shadcn-ui/ui` (`git clone --depth 1`) or write components by hand.
- `src/lib/pdf/bidi.ts` + `hebrew.ts`: bidi pipeline and `drawHebrew()` — **verified visually on 31 mixed cases** (addresses with numbers, IDs, dates, ₪, emails, parentheses, geresh/gershayim, wrapping). Font: Heebo static 400/700 in `assets/fonts` (OFL).
- `src/lib/forms/`:
  - `field-types.ts` — 29 field types: all Google Forms types (short/long text, radio, checkboxes, dropdown, file upload, linear scale, rating, radio grid, checkbox grid, date, time) + number, currency, percent, email, yes/no, Israeli phone, ת"ז, bank account, address, signature, consent, repeating table, hidden, and layout blocks (heading, info text, image, divider).
  - `schema.ts` — `FormDefinition` (pages → fields; conditions `visibleIf`/`requiredIf`; `filledBy` role for chains; `prefill`; `optionsSource` for banks/cities/cost centers; `exportKey` for Priority).
  - `conditions.ts`, `validate.ts` (Hebrew messages, role-scoped, drops hidden values), `format.ts` (display strings), `pdf-mapping.ts` (stamp boxes on uploaded PDFs, `stampPdf()`).
- Tests: `tests/*.test.ts` (bidi cases, Israeli validators, form engine, PDF stamping). All green.

## 5. Next step

Phase 2 in `docs/build-plan.md`: form builder + renderer + PDF field placement.
