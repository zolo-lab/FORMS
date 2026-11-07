# Fill UX plan (2.11.2026)

Goal: make filling long documents (Form 101 first) pleasant on a phone. Responsive fill only; the on-document mode is out of scope.

**Numbering:** items keep Israel's original numbers (1–5). The build order is different and is given separately below.
"Section 3" always means item 3 (checkbox-dependent fields).

## Decisions taken
- Item 1 and item 3 suggestions are shown as a **preview the builder approves** ("החל" / "בטל"), never applied silently.
- Item 2, public link `/f/…`: resume through a **personal continue link by e-mail/SMS**, valid 14 days.
- One PR per item, Vercel preview for Israel, merge only on "מזג" (see `CLAUDE.md`).

## Build order
| Order | Item | Status |
|---|---|---|
| 1st | 4 – auto rows in repeating tables | Built, branch `fill-ux/auto-rows`. Needs PR + CI + Israel's approval |
| 2nd | 3 – checkbox-dependent fields | **Next** |
| 3rd | 5 – bank and branch with live search | Not started |
| 4th | 1 – suggested steps by document sections | Not started |
| 5th | 2 – save and resume | Not started |

## Items

### Item 1 – suggested steps by document sections
Today "the prototype" cuts steps by PDF page (`orderByPdf`, `splitStepAt` in `src/lib/forms/pdf-draw.ts`), so Form 101 gets 2 huge steps.
- Button "הצע חלוקה לשלבים": split by the document's own section headings (Form 101: א. פרטי המעסיק, ב. פרטי העובד, ג. ילדים … ח. פטור/זיכוי, ט. תיאום מס),
  heading text = step title.
- A section that is still too long is split again by row groups; target 5–8 visible fields per step on a phone.
- A checkbox and the fields that depend on it (item 3) always stay in the same step.
- Preview of the proposed steps, then apply / cancel. Pure function + tests; headings come from the PDF text layer (`extract-page-data.ts`).

### Item 2 – save and resume
- `/s/[token]` already autosaves (1.5 s debounce, `PUT /api/s/[token]/draft`) and `resumePageIndex` lands on the first unfinished step.
  Missing: a clear indicator "נשמר · אפשר לסגור ולחזור מאותו קישור".
- `/f/[id]` (public, anonymous) has no draft at all. Add: server-side draft, button "שמירה והמשך מאוחר יותר" that sends a personal
  continue link (random token stored hashed, 14-day expiry) by e-mail/SMS; resume lands on the right step; expired link explains itself and offers to start over.
  No real e-mails from non-production.

### Item 3 – fields that appear only when a box is ticked  ← next
The engine already supports `visibleIf`, but Form 101 (built by PDF detection) has **no conditions at all**, so every field always shows.
- Suggest `visibleIf: <checkbox> is ticked` for fields that sit on the same line as a checkbox or right after it on the PDF
  (e.g. "מתאריך" and "מתגוררים ביישוב" after "אני תושב/ת קבוע/ה בישוב מזכה", section ח on page 2).
- Shown as a preview listing each proposed link; the builder approves all or unticks single ones.
- In the builder: a button "קשר לתיבה שמעל" on a field, for manual fixes.
- Geometry from the PDF stamps only (`readingOrder`, stamp boxes). Pure function + tests.

### Item 4 – one row, the next appears when you start  (done, awaiting approval)
`src/lib/forms/rows.ts`: repeating tables (`settings.autoRows !== false`, on by default) show one row; typing in it opens the next;
empty rows are not stored or validated; row label per table ("ילד 1"). Applies to children, changes during the year, other incomes.
Note: in the dev copy of Form 101, "changes during the year" was detected as single fields, not a table — check the real form;
if so it must become a repeating table for this to apply.

### Item 5 – bank and branch with live search
Today: static list of 17 banks (`src/lib/forms/lookups.ts`), branch is free text.
- Branch table from the Bank of Israel / data.gov.il branches file, refreshed weekly (cron).
- Searchable combobox for bank ("לאו" or "10" finds לאומי) and for branch (by number, name or city), branches filtered by the chosen bank.
- Same component in the request wizard, the signing page and the public link.

## Review loop
See `AGENTS.md` and `CLAUDE.md`: Claude Code opens the PR and reviews it against the self-review list, CodeRabbit
reviews it too, CI runs, and Israel approves the preview.
