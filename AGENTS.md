# AGENTS.md

Instructions for any coding agent (Cursor, Claude Code, others) working in this repository.

- **Read `CLAUDE.md` first.** It holds the project's hard rules (RTL, semantic colors, `drawHebrew()`, forms as data,
  server-side validation, no secrets, TDD) and the workflow (branch + PR, never merge without the owner's "מזג").
- Review rules for automated PR review live in `.cursor/BUGBOT.md`.

## Who does what
- **Claude Code** builds: branches, code, tests, PRs, and fixes from review comments and CI (auto-fix on the PR).
- **Cursor / Bugbot** reviews only: comments on the PR, never pushes to the branch.
- **The owner** checks the Vercel preview and says "מזג". Nobody merges before that.

Only one agent writes to a branch at a time.
