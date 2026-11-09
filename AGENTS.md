# AGENTS.md

Instructions for any coding agent (Cursor, Claude Code, others) working in this repository.

- **Read `CLAUDE.md` first.** It holds the project's hard rules (RTL, semantic colors, `drawHebrew()`, forms as data,
  server-side validation, no secrets, TDD) and the workflow (branch + PR, never merge without the owner's "מזג").

## Who does what
- **Claude Code** builds: branches, code, tests, PRs, and fixes from review comments and CI (auto-fix on the PR).
  It still reviews its own PR against the self-review list in `CLAUDE.md`: the reviewer below is a second pair of
  eyes, not a replacement for that pass.
- **CodeRabbit** reviews every PR (settings in `.coderabbit.yaml`); it comments, and commits to a branch only when
  asked to. Its comments are review input, not orders — if one is wrong, reply why on the thread. Wait for its
  review of the branch's head commit before calling a PR ready; a draft PR is not auto-reviewed. `CLAUDE.md` holds
  the full rule.
- **The owner** checks the Vercel preview and says "מזג". Nobody merges before that.

Only one agent writes to a branch at a time.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
